import Anthropic from '@anthropic-ai/sdk';
import type {SparkApiContext} from '../sparkApi';
import {generatorFinalizeSchema, type GeneratorFinalize} from './schema';
import {GENERATOR_SYSTEM_PROMPT} from './systemPrompt';
import {
  GENERATOR_TOOLS,
  getToolByName,
  type AgentToolContext,
  type ToolDescriptor,
} from './tools';

export interface GeneratorInput {
  newHireName: string;
  slackUserIdIfKnown?: string;
  email?: string;
  teamHint?: string;
  startDate?: string;
  intent?: string;
}

export type GeneratorEvent =
  | {type: 'started'; iteration: 0}
  | {
      type: 'tool_call';
      iteration: number;
      tool: string;
      input: unknown;
    }
  | {
      type: 'tool_result';
      iteration: number;
      tool: string;
      durationMs: number;
      ok: boolean;
      preview?: unknown;
      error?: string;
    }
  | {type: 'thinking'; iteration: number; text: string}
  | {type: 'draft_ready'; draft: GeneratorFinalize}
  | {type: 'draft_persisted'; pkgUserId: string}
  | {type: 'validation_error'; iteration: number; issues: unknown}
  | {type: 'error'; message: string}
  | {type: 'done'; iterations: number};

export interface GeneratorRunOptions {
  apiKey: string;
  model?: string;
  spark: SparkApiContext;
  signal?: AbortSignal;
  maxIterations?: number;
  perToolTimeoutMs?: number;
  maxTokens?: number;
}

const DEFAULT_MAX_ITERATIONS = 20;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_MODEL = 'claude-3-5-haiku-latest';

/**
 * Autonomous multi-tool Generator agent. Runs the Anthropic tool-use loop
 * until the model calls `finalize_draft` with a Zod-valid payload (or the
 * iteration cap trips).
 *
 * Streams `GeneratorEvent`s so the UI can render the agent timeline live.
 */
export async function* runGenerator(
  input: GeneratorInput,
  options: GeneratorRunOptions
): AsyncGenerator<GeneratorEvent, void, void> {
  const {
    apiKey,
    model = DEFAULT_MODEL,
    spark,
    signal,
    maxIterations = DEFAULT_MAX_ITERATIONS,
    perToolTimeoutMs = DEFAULT_TIMEOUT_MS,
    maxTokens = DEFAULT_MAX_TOKENS,
  } = options;

  const anthropic = new Anthropic({apiKey});
  const controller = new AbortController();
  if (signal) {
    signal.addEventListener('abort', () => controller.abort());
  }
  const toolCtx: AgentToolContext = {
    spark: {...spark, signal: controller.signal},
    signal: controller.signal,
    perToolTimeoutMs,
  };

  const userMessage = buildUserMessage(input);
  const messages: Anthropic.MessageParam[] = [
    {role: 'user', content: userMessage},
  ];
  const tools = GENERATOR_TOOLS.map(toAnthropicTool);

  yield {type: 'started', iteration: 0};

  let finalPayload: GeneratorFinalize | null = null;
  let iteration = 0;
  for (; iteration < maxIterations; iteration++) {
    const response = await callAnthropicWithRetry({
      anthropic,
      model,
      maxTokens,
      messages,
      tools,
      signal: controller.signal,
    });

    messages.push({role: 'assistant', content: response.content});

    const toolUseBlocks: Anthropic.ToolUseBlock[] = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    );
    const textBlocks = response.content.filter(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );
    for (const text of textBlocks) {
      if (text.text.trim()) {
        yield {type: 'thinking', iteration, text: text.text};
      }
    }

    if (toolUseBlocks.length === 0) {
      // No tool call and no finalize — end the loop.
      break;
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of toolUseBlocks) {
      yield {
        type: 'tool_call',
        iteration,
        tool: block.name,
        input: block.input,
      };
      const descriptor = getToolByName(block.name);
      if (!descriptor) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify({error: `unknown tool ${block.name}`}),
          is_error: true,
        });
        yield {
          type: 'tool_result',
          iteration,
          tool: block.name,
          durationMs: 0,
          ok: false,
          error: 'unknown tool',
        };
        continue;
      }

      if (descriptor.name === 'finalize_draft') {
        const parseResult = generatorFinalizeSchema.safeParse(block.input);
        if (parseResult.success) {
          finalPayload = parseResult.data;
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify({ok: true}),
          });
          yield {
            type: 'tool_result',
            iteration,
            tool: block.name,
            durationMs: 0,
            ok: true,
          };
        } else {
          yield {
            type: 'validation_error',
            iteration,
            issues: parseResult.error.issues,
          };
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify({
              ok: false,
              error: 'schema validation failed',
              issues: parseResult.error.issues,
            }),
            is_error: true,
          });
          yield {
            type: 'tool_result',
            iteration,
            tool: block.name,
            durationMs: 0,
            ok: false,
            error: 'schema validation failed',
          };
        }
        continue;
      }

      const started = Date.now();
      try {
        const result = await descriptor.run(block.input, toolCtx);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
        yield {
          type: 'tool_result',
          iteration,
          tool: block.name,
          durationMs: Date.now() - started,
          ok: true,
          preview: summarizeResult(result),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'tool failure';
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify({error: message}),
          is_error: true,
        });
        yield {
          type: 'tool_result',
          iteration,
          tool: block.name,
          durationMs: Date.now() - started,
          ok: false,
          error: message,
        };
      }
    }

    messages.push({role: 'user', content: toolResults});

    if (finalPayload) {
      yield {type: 'draft_ready', draft: finalPayload};
      break;
    }

    if (response.stop_reason === 'end_turn' && toolUseBlocks.length === 0) {
      break;
    }
  }

  if (!finalPayload && iteration >= maxIterations) {
    yield {
      type: 'error',
      message:
        'generator hit the 20-iteration cap without finalizing — try adding a team hint and retry',
    };
  } else if (!finalPayload) {
    yield {
      type: 'error',
      message: 'generator ended without calling finalize_draft',
    };
  }

  yield {type: 'done', iterations: iteration + 1};
}

function toAnthropicTool(descriptor: ToolDescriptor): Anthropic.Tool {
  return {
    name: descriptor.name,
    description: descriptor.description,
    input_schema: descriptor.input_schema as Anthropic.Tool['input_schema'],
  };
}

function buildUserMessage(input: GeneratorInput): string {
  const lines = [
    `New hire: ${input.newHireName}`,
    input.slackUserIdIfKnown
      ? `Slack id: <@${input.slackUserIdIfKnown}>`
      : null,
    input.email ? `Email: ${input.email}` : null,
    input.teamHint ? `Team hint: ${input.teamHint}` : null,
    input.startDate ? `Start date: ${input.startDate}` : null,
    input.intent
      ? `Manager intent (one sentence of context):\n${input.intent}`
      : null,
    '',
    'Produce the onboarding draft. Call tools, then finalize_draft exactly once.',
  ].filter(Boolean);
  return lines.join('\n');
}

function summarizeResult(result: unknown): unknown {
  if (!result || typeof result !== 'object') return result;
  // Keep the preview tiny — the UI only needs a hint for the timeline.
  const obj = result as Record<string, unknown>;
  const preview: Record<string, unknown> = {};
  for (const key of ['teamName', 'roleTrack', 'pillarName', 'resolved']) {
    if (key in obj) preview[key] = obj[key];
  }
  if (Array.isArray(obj.teammates)) {
    preview.teammateCount = (obj.teammates as unknown[]).length;
  }
  if (Array.isArray(obj.tasks)) {
    preview.taskCount = (obj.tasks as unknown[]).length;
  }
  return preview;
}

async function callAnthropicWithRetry(args: {
  anthropic: Anthropic;
  model: string;
  maxTokens: number;
  messages: Anthropic.MessageParam[];
  tools: Anthropic.Tool[];
  signal: AbortSignal;
}): Promise<Anthropic.Message> {
  const {anthropic, model, maxTokens, messages, tools, signal} = args;
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await anthropic.messages.create(
        {
          model,
          max_tokens: maxTokens,
          messages,
          tools,
        },
        {signal}
      );
    } catch (error) {
      lastError = error;
      if (
        error instanceof Anthropic.APIError &&
        (error.status === 429 || error.status === 529)
      ) {
        await sleep(500 * Math.pow(2, attempt));
        continue;
      }
      throw error;
    }
  }
  throw lastError ?? new Error('anthropic call failed after retries');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exported for tests. */
export {buildUserMessage};
