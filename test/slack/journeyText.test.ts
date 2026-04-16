import {describe, expect, it} from 'vitest';
import {resolveJourneyText} from '../../src/slack/journeyText.js';
import {collectTextContent} from '../helpers/collectTextContent.js';
import {createTestServices} from '../helpers/createTestServices.js';

describe('journeyText routing', () => {
  it('points the user at Jira config when Jira is not set up', async () => {
    const {profile, services} = createTestServices();

    const result = await resolveJourneyText(
      profile,
      'show me my jira tickets',
      services.journey
    );

    expect(result.kind).toBe('reply');
    if (result.kind === 'reply') {
      expect(collectTextContent(result.reply.blocks)).toContain(
        "Jira search isn't configured yet"
      );
    }
  });

  it('recognizes a Jira issue key embedded in the message', async () => {
    const {profile, services} = createTestServices();

    const result = await resolveJourneyText(
      profile,
      'can you look up ABC-123 for me?',
      services.journey
    );

    expect(result.kind).toBe('reply');
    expect(result.title).toBe('Jira ABC-123');
  });

  it('points the user at GitHub config when GitHub is not set up', async () => {
    const {profile, services} = createTestServices();

    const result = await resolveJourneyText(
      profile,
      'show me my open prs',
      services.journey
    );

    expect(result.kind).toBe('reply');
    if (result.kind === 'reply') {
      expect(collectTextContent(result.reply.blocks)).toContain(
        "GitHub search isn't configured yet"
      );
    }
  });

  it('routes review-requested phrasing to the review lookup', async () => {
    const {profile, services} = createTestServices();

    const result = await resolveJourneyText(
      profile,
      'what is awaiting review for me?',
      services.journey
    );

    expect(result.kind).toBe('reply');
    expect(result.title).toBe('PRs to review');
  });
});
