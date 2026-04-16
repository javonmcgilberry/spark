import type {App} from '@slack/bolt';
import {describe, expect, it, vi} from 'vitest';
import {
  DEFAULT_PROMPTS,
  fetchThreadHistory,
  mergeWithPinnedHome,
} from '../../src/slack/handlers/assistant.js';

describe('mergeWithPinnedHome', () => {
  it('returns DEFAULT_PROMPTS when the agent emitted nothing', () => {
    expect(mergeWithPinnedHome(null)).toEqual(DEFAULT_PROMPTS);
    expect(mergeWithPinnedHome([])).toEqual(DEFAULT_PROMPTS);
  });

  it('pins "Open my Home tab" as the first prompt and appends agent picks', () => {
    const result = mergeWithPinnedHome([
      {title: 'My checklist', message: "what's on my checklist?"},
      {title: 'Who should I meet', message: 'who should I meet?'},
    ]);

    expect(result.prompts[0]).toEqual({
      title: 'Open my Home tab',
      message: 'open my home tab',
    });
    expect(result.prompts).toHaveLength(3);
  });

  it('caps the total pill count at 4 (Slack max)', () => {
    const result = mergeWithPinnedHome([
      {title: 'A', message: 'a'},
      {title: 'B', message: 'b'},
      {title: 'C', message: 'c'},
      {title: 'D', message: 'd'},
      {title: 'E', message: 'e'},
    ]);
    expect(result.prompts).toHaveLength(4);
  });

  it('dedupes a duplicate Open my Home tab suggestion from the agent', () => {
    const result = mergeWithPinnedHome([
      {title: 'Open my Home tab', message: 'open my home tab'},
      {title: 'Find a task', message: 'find me a starter task'},
    ]);
    const homeCount = result.prompts.filter(
      (p) => p.title === 'Open my Home tab'
    ).length;
    expect(homeCount).toBe(1);
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
