import {describe, expect, it, vi, beforeEach} from 'vitest';
import {runGenerator, buildUserMessage} from '../../lib/agents/generator';
import type {GeneratorEvent} from '../../lib/agents/generator';

// ---- Mocks ---------------------------------------------------------------

const {createMock, MockAPIError} = vi.hoisted(() => {
  const fn = vi.fn();
  class APIErrorImpl extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
      this.name = 'APIError';
    }
  }
  return {createMock: fn, MockAPIError: APIErrorImpl};
});

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = {create: createMock};
    constructor(_opts: unknown) {}
  }
  return {
    default: Object.assign(MockAnthropic, {APIError: MockAPIError}),
  };
});

vi.mock('../../lib/sparkApi', () => ({
  lookupTeam: vi.fn().mockResolvedValue({
    teamName: 'Commerce Sprint',
    pillarName: 'Commerce',
    githubTeamSlug: 'commerce-sprint',
    roleTrack: 'backend',
    manager: {
      name: 'Grace Hopper',
      role: 'Engineering Manager',
      discussionPoints: 'x',
      kind: 'manager',
      weekBucket: 'week1-2',
      slackUserId: 'UMGR',
    },
    buddy: {
      name: 'Lin Clark',
      role: 'Onboarding Buddy',
      discussionPoints: 'y',
      kind: 'buddy',
      weekBucket: 'week1-2',
      slackUserId: 'UBUD',
    },
  }),
  lookupTeammates: vi.fn().mockResolvedValue({
    teamName: 'Commerce Sprint',
    teammates: [
      {
        name: 'Maria Vega',
        role: 'Senior Engineer',
        discussionPoints: 'z',
        kind: 'teammate',
        weekBucket: 'week1-2',
        slackUserId: 'UTM1',
      },
    ],
    insights: {},
  }),
  lookupConfluencePeople: vi.fn().mockResolvedValue({guides: {}}),
  lookupContributionTasks: vi.fn().mockResolvedValue({tasks: []}),
  SparkApiError: class SparkApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

// ---- Helpers -------------------------------------------------------------

interface MockResponseShape {
  content: unknown[];
  stop_reason?: string;
  id?: string;
}

function queueResponses(responses: MockResponseShape[]): void {
  createMock.mockReset();
  let i = 0;
  createMock.mockImplementation(async () => {
    const r = responses[Math.min(i, responses.length - 1)];
    i++;
    return {
      id: r.id ?? `msg_${i}`,
      type: 'message',
      role: 'assistant',
      model: 'claude-3-5-haiku-latest',
      content: r.content,
      stop_reason: r.stop_reason ?? 'end_turn',
      stop_sequence: null,
      usage: {input_tokens: 0, output_tokens: 0},
    };
  });
}

function text(t: string) {
  return {type: 'text', text: t, citations: null};
}

function toolUse(name: string, input: unknown, id = `tu_${Math.random()}`) {
  return {type: 'tool_use', id, name, input};
}

async function collect(
  gen: AsyncGenerator<GeneratorEvent, void, void>
): Promise<GeneratorEvent[]> {
  const events: GeneratorEvent[] = [];
  for await (const event of gen) events.push(event);
  return events;
}

async function runOnce(
  overrides: Partial<Parameters<typeof runGenerator>[1]> = {}
): Promise<GeneratorEvent[]> {
  return collect(
    runGenerator(
      {newHireName: 'Maria', slackUserIdIfKnown: 'UNEW'},
      {
        apiKey: 'sk-test',
        maxIterations: 10,
        perToolTimeoutMs: 5000,
        spark: {
          env: {
            SPARK_API_BASE_URL: 'http://localhost:8787',
            SPARK_API_TOKEN: 'stub',
          },
          managerSlackId: 'UMGR',
        },
        ...overrides,
      }
    )
  );
}

const VALID_DRAFT = {
  welcomeNote:
    'Welcome to Webflow and to the Commerce Sprint team. Your first few weeks will focus on learning our checkout flow and pairing on a small feature. Glad to have you.',
  buddyUserId: 'UTM1',
  stakeholderUserIds: ['UPM1'],
  peopleToMeet: [
    {
      name: 'Grace Hopper',
      role: 'Manager',
      discussionPoints: 'Priorities',
      weekBucket: 'week1-2',
      slackUserId: 'UMGR',
    },
    {
      name: 'Maria Vega',
      role: 'Senior Engineer',
      discussionPoints: 'Codebase tour',
      weekBucket: 'week1-2',
      slackUserId: 'UTM1',
    },
  ],
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
  createMock.mockReset();
});

// ---- Tests ---------------------------------------------------------------

describe('runGenerator — happy path', () => {
  it('emits tool_call, tool_result, draft_ready, and done', async () => {
    queueResponses([
      {
        content: [
          text('Looking up the Commerce team.'),
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

    const events = await runOnce();
    const types = events.map((e) => e.type);
    expect(types).toContain('tool_call');
    expect(types).toContain('tool_result');
    expect(types).toContain('draft_ready');
    expect(types[types.length - 1]).toBe('done');
    const draftReady = events.find(
      (e): e is Extract<GeneratorEvent, {type: 'draft_ready'}> =>
        e.type === 'draft_ready'
    );
    expect(draftReady?.draft.buddyUserId).toBe('UTM1');
    expect(draftReady?.draft.peopleToMeet).toHaveLength(2);
  });
});

describe('runGenerator — Zod validation', () => {
  it('feeds validation errors back to the loop on invalid finalize_draft', async () => {
    queueResponses([
      {
        content: [
          toolUse('finalize_draft', {
            welcomeNote: 'short',
            stakeholderUserIds: [],
            peopleToMeet: [],
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

    const events = await runOnce();
    expect(events.find((e) => e.type === 'validation_error')).toBeDefined();
    expect(events.find((e) => e.type === 'draft_ready')).toBeDefined();
  });
});

describe('runGenerator — iteration cap', () => {
  it('stops after maxIterations without finalize', async () => {
    queueResponses([
      {
        content: [toolUse('resolve_team', {hint: 'x@y.com'})],
        stop_reason: 'tool_use',
      },
    ]);

    const events = await runOnce({maxIterations: 3});
    const errorEvent = events.find(
      (e): e is Extract<GeneratorEvent, {type: 'error'}> => e.type === 'error'
    );
    expect(errorEvent).toBeDefined();
    expect(errorEvent!.message).toContain('iteration cap');
  });
});

describe('runGenerator — unknown tool handling', () => {
  it('emits a failed tool_result without aborting the loop', async () => {
    queueResponses([
      {
        content: [toolUse('bogus_tool_name', {})],
        stop_reason: 'tool_use',
      },
      {
        content: [toolUse('finalize_draft', VALID_DRAFT)],
        stop_reason: 'tool_use',
      },
    ]);

    const events = await runOnce();
    const failed = events.find(
      (e): e is Extract<GeneratorEvent, {type: 'tool_result'}> =>
        e.type === 'tool_result' && e.tool === 'bogus_tool_name'
    );
    expect(failed?.ok).toBe(false);
    expect(events.find((e) => e.type === 'draft_ready')).toBeDefined();
  });
});

describe('runGenerator — rate limit backoff', () => {
  it('retries on a 529 and eventually finalizes', async () => {
    let rateLimitHit = false;
    createMock.mockImplementation(async () => {
      if (!rateLimitHit) {
        rateLimitHit = true;
        throw new MockAPIError(529, 'overloaded');
      }
      return {
        id: 'msg_retry',
        type: 'message',
        role: 'assistant',
        model: 'claude-3-5-haiku-latest',
        content: [toolUse('finalize_draft', VALID_DRAFT)],
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: {input_tokens: 0, output_tokens: 0},
      };
    });

    const events = await runOnce();
    expect(events.find((e) => e.type === 'draft_ready')).toBeDefined();
    expect(rateLimitHit).toBe(true);
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
