import {describe, expect, it} from 'vitest';
import {FALLBACK_UNREACHABLE} from '../../src/services/llmService.js';
import {resolveJourneyText} from '../../src/slack/journeyText.js';
import {createTestServices} from '../helpers/createTestServices.js';

describe('journeyText routing', () => {
  it('recognizes a Jira issue key embedded in the message and returns a structured reply', async () => {
    const {profile, services} = createTestServices();

    const result = await resolveJourneyText(
      profile,
      'can you look up ABC-123 for me?',
      services.journey
    );

    expect(result.kind).toBe('reply');
    expect(result.title).toBe('Jira ABC-123');
  });

  it('routes everything else through the LLM answer path', async () => {
    const {profile, services} = createTestServices();

    const result = await resolveJourneyText(
      profile,
      'what are the fun channels around here?',
      services.journey
    );

    expect(result.kind).toBe('answer');
    if (result.kind === 'answer') {
      // With no Anthropic key in tests, the LLM falls back to the neutral message.
      expect(result.answer).toBe(FALLBACK_UNREACHABLE);
      expect(result.suggestedPrompts).toBeNull();
    }
  });

  it('threads history into the answer call without erroring', async () => {
    const {profile, services} = createTestServices();

    const result = await resolveJourneyText(
      profile,
      'remind me about what we said before',
      services.journey,
      [
        {role: 'user', content: 'hi'},
        {role: 'assistant', content: 'hi there'},
      ]
    );

    expect(result.kind).toBe('answer');
  });
});
