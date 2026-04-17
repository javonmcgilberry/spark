import {beforeEach, describe, expect, it, vi} from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import {buildUserMessage, runGenerator} from '../../lib/agents/generator';
import type {GeneratorEvent} from '../../lib/agents/generator';
import {makeTestCtx} from '../helpers/makeTestCtx';
import {
  makeStubTextMessage,
  makeStubLlm,
  type LlmClient,
} from '../../lib/services/llm';
import type {HandlerCtx} from '../../lib/ctx';

// ---- Mocks & helpers ---------------------------------------------------

interface MockResponseShape {
  content: Anthropic.ContentBlock[];
  stop_reason?: Anthropic.Message['stop_reason'];
  id?: string;
}

function mockMessage(shape: MockResponseShape): Anthropic.Message {
  return {
    id: shape.id ?? `msg_${Math.random().toString(36).slice(2)}`,
    type: 'message',
    role: 'assistant',
    model: 'claude-3-5-haiku-latest',
    content: shape.content,
    stop_reason: shape.stop_reason ?? 'end_turn',
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

function text(t: string): Anthropic.TextBlock {
  return {type: 'text', text: t, citations: null} as Anthropic.TextBlock;
}

function toolUse(
  name: string,
  input: unknown,
  id = `tu_${Math.random()}`
): Anthropic.ToolUseBlock {
  return {type: 'tool_use', id, name, input} as Anthropic.ToolUseBlock;
}

function buildGenCtx(responses: MockResponseShape[]): HandlerCtx {
  return makeTestCtx({
    slack: {
      usersLookupByEmail: {
        'maria@webflow.com': {
          id: 'UNEW',
          real_name: 'Maria Vega',
          profile: {
            first_name: 'Maria',
            display_name: 'maria',
            email: 'maria@webflow.com',
            title: 'Software Engineer',
          },
        },
      },
    },
    llm: {
      messageQueue: responses.map(mockMessage),
      defaultText: 'ok',
    },
  });
}

async function collect(
  gen: AsyncGenerator<GeneratorEvent, void, void>
): Promise<GeneratorEvent[]> {
  const events: GeneratorEvent[] = [];
  for await (const event of gen) events.push(event);
  return events;
}

const VALID_DRAFT = {
  welcomeIntro:
    "Welcome aboard! I've mapped out your first few weeks — people, a PR, and the rooms that matter.",
  welcomeNote:
    'Welcome to Webflow and to the Commerce Sprint team. Your first few weeks will focus on learning our checkout flow and pairing on a small feature. Glad to have you.',
  customChecklistItems: [
    {
      label: 'Shadow the on-call rotation in week 2',
      kind: 'task' as const,
      notes: 'Sit in on the daily pager triage with the primary on-call.',
    },
  ],
  summary: 'Commerce backend onboarding draft ready for review.',
};

beforeEach(() => {
  vi.restoreAllMocks();
});

// ---- Tests -------------------------------------------------------------

describe('runGenerator — happy path', () => {
  it('emits tool_call, tool_result, draft_ready, and done', async () => {
    const ctx = buildGenCtx([
      {
        content: [
          text('Looking up Maria.'),
          toolUse('resolve_team', {hint: 'maria@webflow.com'}),
        ],
        stop_reason: 'tool_use',
      },
      {
        content: [toolUse('finalize_draft', VALID_DRAFT)],
        stop_reason: 'tool_use',
      },
      {content: [text('done')]},
    ]);

    const events = await collect(
      runGenerator(
        {newHireName: 'Maria', slackUserIdIfKnown: 'UNEW'},
        {ctx, maxIterations: 10}
      )
    );

    const types = events.map((e) => e.type);
    expect(types).toContain('tool_call');
    expect(types).toContain('tool_result');
    expect(types).toContain('draft_ready');
    expect(types[types.length - 1]).toBe('done');

    const draftReady = events.find(
      (e): e is Extract<GeneratorEvent, {type: 'draft_ready'}> =>
        e.type === 'draft_ready'
    );
    expect(draftReady?.draft.customChecklistItems).toHaveLength(1);
    // Generator output carries ONLY welcome + checklist fields now.
    expect('peopleToMeet' in (draftReady?.draft ?? {})).toBe(false);
    expect('buddyUserId' in (draftReady?.draft ?? {})).toBe(false);
  });
});

describe('runGenerator — retry behavior', () => {
  it('retries connection errors before failing the turn', async () => {
    const message = vi
      .fn<LlmClient['message']>()
      .mockRejectedValueOnce(
        Object.assign(new Error('Connection error.'), {
          name: 'APIConnectionError',
        })
      )
      .mockResolvedValueOnce(
        mockMessage({
          content: [toolUse('finalize_draft', VALID_DRAFT)],
          stop_reason: 'tool_use',
        })
      );
    const ctx = makeTestCtx({
      llm: {
        isConfigured: () => true,
        message,
        generate: async () => 'ok',
      },
    });

    const events = await collect(
      runGenerator({newHireName: 'Maria'}, {ctx, maxIterations: 10})
    );

    expect(message).toHaveBeenCalledTimes(2);
    expect(events.find((event) => event.type === 'draft_ready')).toBeDefined();
  });
});

describe('runGenerator — Zod validation', () => {
  it('feeds validation errors back to the loop on invalid finalize_draft', async () => {
    const ctx = buildGenCtx([
      {
        content: [
          toolUse('finalize_draft', {
            welcomeNote: 'short',
            customChecklistItems: [],
            summary: '',
          }),
        ],
        stop_reason: 'tool_use',
      },
      {
        content: [toolUse('finalize_draft', VALID_DRAFT)],
        stop_reason: 'tool_use',
      },
    ]);

    const events = await collect(
      runGenerator({newHireName: 'Maria'}, {ctx, maxIterations: 10})
    );
    expect(events.find((e) => e.type === 'validation_error')).toBeDefined();
    expect(events.find((e) => e.type === 'draft_ready')).toBeDefined();
  });
});

describe('runGenerator — iteration cap', () => {
  it('stops after maxIterations without finalize', async () => {
    // Queue enough tool_use responses that the loop can't run out;
    // iteration cap kicks in first.
    const loopRes: MockResponseShape = {
      content: [toolUse('resolve_team', {hint: 'x@y.com'})],
      stop_reason: 'tool_use',
    };
    const ctx = buildGenCtx([loopRes, loopRes, loopRes, loopRes]);
    const events = await collect(
      runGenerator({newHireName: 'Maria'}, {ctx, maxIterations: 3})
    );
    const errorEvent = events.find(
      (e): e is Extract<GeneratorEvent, {type: 'error'}> => e.type === 'error'
    );
    expect(errorEvent).toBeDefined();
    expect(errorEvent!.message).toContain('iteration cap');
  });
});

describe('runGenerator — unknown tool handling', () => {
  it('emits a failed tool_result without aborting the loop', async () => {
    const ctx = buildGenCtx([
      {
        content: [toolUse('bogus_tool_name', {})],
        stop_reason: 'tool_use',
      },
      {
        content: [toolUse('finalize_draft', VALID_DRAFT)],
        stop_reason: 'tool_use',
      },
    ]);
    const events = await collect(
      runGenerator({newHireName: 'Maria'}, {ctx, maxIterations: 10})
    );
    const failed = events.find(
      (e): e is Extract<GeneratorEvent, {type: 'tool_result'}> =>
        e.type === 'tool_result' && e.tool === 'bogus_tool_name'
    );
    expect(failed?.ok).toBe(false);
    expect(events.find((e) => e.type === 'draft_ready')).toBeDefined();
  });
});

describe('buildUserMessage', () => {
  it('includes manager intent when provided', () => {
    const msg = buildUserMessage({
      newHireName: 'Maria',
      intent: 'Cares about reliability',
    });
    expect(msg).toContain('Manager intent');
    expect(msg).toContain('Cares about reliability');
  });

  it('omits optional lines when not provided', () => {
    const msg = buildUserMessage({newHireName: 'Maria'});
    expect(msg).toContain('New hire: Maria');
    expect(msg).not.toContain('Slack id:');
    expect(msg).not.toContain('Manager intent');
  });
});

// Ensure the exports used elsewhere still import cleanly.
describe('stub llm exports', () => {
  it('makeStubLlm + makeStubTextMessage both produce valid messages', async () => {
    const stub = makeStubLlm({
      messageQueue: [makeStubTextMessage('hello world')],
    });
    const msg = await stub.message({
      system: 'x',
      messages: [{role: 'user', content: 'y'}],
    });
    expect(msg.content[0].type).toBe('text');
  });
});
