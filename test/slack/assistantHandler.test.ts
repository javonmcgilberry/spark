import type {App} from '@slack/bolt';
import {describe, expect, it, vi} from 'vitest';
import type {LiveSignalContext} from '../../src/onboarding/liveSignals.js';
import type {JourneyState, TeamProfile} from '../../src/onboarding/types.js';
import {
  fetchJoinedChannels,
  fetchThreadHistory,
  pickPromptsForTurn,
} from '../../src/slack/handlers/assistant.js';
import {createTestLogger} from '../helpers/createTestLogger.js';

function buildMinimalContext(
  overrides: Partial<LiveSignalContext> = {}
): LiveSignalContext {
  const profile: TeamProfile = {
    userId: 'U1',
    firstName: 'Ada',
    displayName: 'Ada',
    email: 'ada@webflow.com',
    teamName: 'Frontend',
    roleTrack: 'frontend',
    manager: {
      name: 'Grace',
      role: 'EM',
      discussionPoints: '',
      weekBucket: 'week1-2',
    },
    buddy: {
      name: 'Lin',
      role: 'Buddy',
      discussionPoints: '',
      weekBucket: 'week1-2',
    },
    teammates: [],
    docs: [],
    keyPaths: [],
    recommendedChannels: [],
    tools: [],
    rituals: [],
    checklist: [],
  };
  const state: JourneyState = {
    userId: 'U1',
    currentStep: 'day1-welcome',
    completedSteps: [],
    activeHomeSection: 'welcome',
    itemStatuses: {},
    toolAccess: {},
    userGuideIntake: {answers: {}},
    tasks: [],
    startedAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-01T00:00:00Z',
  };
  return {
    profile,
    state,
    onboardingPackage: undefined,
    stage: {weekKey: 'week1', daysSince: 0},
    joinedSlackChannels: undefined,
    github: undefined,
    jira: undefined,
    logger: createTestLogger(),
    ...overrides,
  };
}

describe('pickPromptsForTurn', () => {
  it('returns agent-picked prompts verbatim when present, without computing live signals', async () => {
    const agentPrompts = [
      {title: 'Draft a PR', message: 'draft a PR'},
      {title: 'Explain the repo', message: 'explain the repo'},
    ];
    const result = await pickPromptsForTurn(
      agentPrompts,
      buildMinimalContext()
    );

    expect(result.prompts).toEqual(agentPrompts);
  });

  it('caps agent-picked prompts at 4 when more are supplied', async () => {
    const agentPrompts = [
      {title: 'A', message: 'a'},
      {title: 'B', message: 'b'},
      {title: 'C', message: 'c'},
      {title: 'D', message: 'd'},
      {title: 'E', message: 'e'},
    ];
    const result = await pickPromptsForTurn(
      agentPrompts,
      buildMinimalContext()
    );
    expect(result.prompts).toHaveLength(4);
  });

  it('falls back to live signals when no agent prompts were supplied, ranked by priority', async () => {
    // Empty state will still emit at least the user-guide (priority 9) and
    // stage-checkpoint (priority 2) signals. The user-guide pill must come
    // first because of its higher priority.
    const result = await pickPromptsForTurn(null, buildMinimalContext());

    expect(result.prompts.length).toBeGreaterThan(0);
    expect(result.prompts.length).toBeLessThanOrEqual(4);
    expect(result.prompts[0].title).toBe('Draft my User Guide');
  });

  it('does not pad beyond what the signals produce', async () => {
    // Minimal context → user-guide signal + stage-checkpoint signal = 2
    // pills. If live signals ever start padding, this would go to 4.
    const result = await pickPromptsForTurn(null, buildMinimalContext());
    expect(result.prompts.length).toBeLessThanOrEqual(2);
  });

  it('treats an empty agent-prompts array the same as null (falls back to signals)', async () => {
    const fromEmpty = await pickPromptsForTurn([], buildMinimalContext());
    const fromNull = await pickPromptsForTurn(null, buildMinimalContext());
    expect(fromEmpty.prompts).toEqual(fromNull.prompts);
  });
});

describe('fetchThreadHistory', () => {
  function buildClient(messages: unknown[]): App['client'] {
    const repliesMock = vi.fn().mockResolvedValue({messages});
    return {
      conversations: {replies: repliesMock},
    } as unknown as App['client'];
  }

  it('returns an empty array when channel or thread_ts is missing', async () => {
    const client = buildClient([]);
    expect(await fetchThreadHistory(client, undefined, '123')).toEqual([]);
    expect(await fetchThreadHistory(client, 'D1', undefined)).toEqual([]);
  });

  it('maps replies to user/assistant turns and excludes the last message', async () => {
    const client = buildClient([
      {text: 'hi', user: 'U1'},
      {text: 'hello there', bot_id: 'B1'},
      {text: 'current question', user: 'U1'},
    ]);

    const history = await fetchThreadHistory(client, 'D1', 'T1');

    expect(history).toEqual([
      {role: 'user', content: 'hi'},
      {role: 'assistant', content: 'hello there'},
    ]);
  });

  it('drops empty messages', async () => {
    const client = buildClient([
      {text: '', user: 'U1'},
      {text: 'keep me', user: 'U1'},
      {text: 'trailing', user: 'U1'},
    ]);

    const history = await fetchThreadHistory(client, 'D1', 'T1');

    expect(history).toEqual([{role: 'user', content: 'keep me'}]);
  });

  it('falls back to an empty array on API failure', async () => {
    const client = {
      conversations: {
        replies: vi.fn().mockRejectedValue(new Error('boom')),
      },
    } as unknown as App['client'];

    expect(await fetchThreadHistory(client, 'D1', 'T1')).toEqual([]);
  });
});

describe('fetchJoinedChannels', () => {
  it('returns a lowercased set of channel names from a single page', async () => {
    const client = {
      users: {
        conversations: vi.fn().mockResolvedValue({
          channels: [
            {name: 'eng-frontend'},
            {name: 'ENG-PLATFORM'},
            {name: 'social-dogs'},
          ],
        }),
      },
    } as unknown as App['client'];

    const joined = await fetchJoinedChannels(client, 'U1');

    expect(joined).toEqual(
      new Set(['eng-frontend', 'eng-platform', 'social-dogs'])
    );
  });

  it('follows pagination via next_cursor and merges all pages', async () => {
    const mock = vi.fn();
    mock
      .mockResolvedValueOnce({
        channels: [{name: 'page1-a'}, {name: 'page1-b'}],
        response_metadata: {next_cursor: 'cursor-2'},
      })
      .mockResolvedValueOnce({
        channels: [{name: 'page2-a'}],
        response_metadata: {next_cursor: ''},
      });
    const client = {
      users: {conversations: mock},
    } as unknown as App['client'];

    const joined = await fetchJoinedChannels(client, 'U1');

    expect(joined).toEqual(new Set(['page1-a', 'page1-b', 'page2-a']));
    expect(mock).toHaveBeenCalledTimes(2);
    const secondCallArgs = mock.mock.calls[1][0];
    expect(secondCallArgs.cursor).toBe('cursor-2');
  });

  it('skips channels without a name', async () => {
    const client = {
      users: {
        conversations: vi.fn().mockResolvedValue({
          channels: [{name: 'ok'}, {id: 'C1'}, {name: undefined}],
        }),
      },
    } as unknown as App['client'];

    const joined = await fetchJoinedChannels(client, 'U1');
    expect(joined).toEqual(new Set(['ok']));
  });
});
