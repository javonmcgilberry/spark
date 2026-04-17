import Anthropic from "@anthropic-ai/sdk";
import type { Logger } from "../logger";

/**
 * Narrow LLM client interface. In production it wraps @anthropic-ai/sdk
 * so the rest of the code never touches the SDK directly. In tests and
 * sandbox mode it returns canned responses — no network, no token burn.
 */

export interface LlmMessageInput {
  system: string;
  messages: Anthropic.MessageParam[];
  tools?: Anthropic.Tool[];
  maxTokens?: number;
  model?: string;
  signal?: AbortSignal;
}

export interface LlmClient {
  /**
   * Run a single Anthropic Messages API turn. Lower-level than
   * `generate` — used by the agent loop in generator.ts so it can
   * iterate on tool_use blocks across multiple turns.
   */
  message(input: LlmMessageInput): Promise<Anthropic.Message>;
  /**
   * One-shot text generation. Convenience wrapper for short completions
   * like writePersonBlurb.
   */
  generate(
    system: string,
    user: string,
    opts?: { maxTokens?: number; signal?: AbortSignal },
  ): Promise<string>;
  /** True in prod, false in tests/sandbox. */
  isConfigured(): boolean;
}

const DEFAULT_MODEL = "claude-3-5-haiku-latest";
const DEFAULT_MAX_TOKENS = 700;

export function makeAnthropicClient(
  apiKey: string | undefined,
  logger: Logger,
  defaultModel: string = DEFAULT_MODEL,
): LlmClient {
  if (!apiKey) {
    logger.warn(
      "Anthropic API key missing; LLM calls will throw. Set ANTHROPIC_MOCK_MODE=1 for local dev.",
    );
  }
  const client = apiKey ? new Anthropic({ apiKey }) : null;

  return {
    isConfigured: () => client !== null,
    async message(input) {
      if (!client) {
        throw new Error(
          "Anthropic client not configured. Set ANTHROPIC_API_KEY or ANTHROPIC_MOCK_MODE=1.",
        );
      }
      return client.messages.create(
        {
          model: input.model ?? defaultModel,
          max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
          system: input.system,
          messages: input.messages,
          tools: input.tools,
        },
        { signal: input.signal },
      );
    },
    async generate(system, user, opts = {}) {
      if (!client) {
        throw new Error("Anthropic client not configured");
      }
      const response = await client.messages.create(
        {
          model: defaultModel,
          max_tokens: opts.maxTokens ?? 350,
          system,
          messages: [{ role: "user", content: user }],
        },
        { signal: opts.signal },
      );
      return extractText(response.content);
    },
  };
}

/**
 * Deterministic stub used in tests. The `responses` map keys by a
 * fingerprint of the system + user content; unknown calls fall back to
 * a boilerplate reply so tests don't crash on incidental calls.
 */
export interface StubLlmOptions {
  /**
   * Canned text-only responses keyed by (system prompt fragment).
   * First substring match wins.
   */
  textResponses?: Array<{ match: string | RegExp; text: string }>;
  /**
   * For agent-loop tests: a queue of Messages API responses that
   * `message` returns in order. Once exhausted, falls back to a
   * text-only end_turn reply.
   */
  messageQueue?: Anthropic.Message[];
  defaultText?: string;
}

export function makeStubLlm(options: StubLlmOptions = {}): LlmClient {
  const queue = [...(options.messageQueue ?? [])];
  return {
    isConfigured: () => true,
    async message() {
      const next = queue.shift();
      if (next) return next;
      return makeStubTextMessage(options.defaultText ?? "stubbed reply");
    },
    async generate(system, user) {
      const fingerprint = `${system}\n---\n${user}`;
      for (const candidate of options.textResponses ?? []) {
        if (typeof candidate.match === "string") {
          if (fingerprint.includes(candidate.match)) return candidate.text;
        } else if (candidate.match.test(fingerprint)) {
          return candidate.text;
        }
      }
      return options.defaultText ?? "stubbed reply";
    },
  };
}

export function makeStubTextMessage(text: string): Anthropic.Message {
  return {
    id: `msg_stub_${Math.random().toString(36).slice(2)}`,
    type: "message",
    role: "assistant",
    model: "stub-model",
    content: [{ type: "text", text, citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      server_tool_use: null,
      service_tier: null,
    },
    container: null,
  } as unknown as Anthropic.Message;
}

function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}
