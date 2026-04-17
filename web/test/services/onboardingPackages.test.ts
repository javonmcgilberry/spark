import {describe, expect, it} from 'vitest';
import {makeTestCtx} from '../helpers/makeTestCtx';
import {
  createDraftPackage,
  updateDraftPackage,
  hydrateSlackWorkspace,
} from '../../lib/services/onboardingPackages';
import type {TeamProfile} from '../../lib/types';

const baseProfile: TeamProfile = {
  userId: 'UHIRE001',
  firstName: 'Hira',
  displayName: 'Hira Test',
  email: 'hira@webflow.com',
  teamName: 'Frontend Platform',
  pillarName: 'Platform',
  roleTrack: 'frontend',
  manager: {
    name: 'Mia Manager',
    role: 'Engineering Manager',
    discussionPoints: 'ask about the roadmap',
    weekBucket: 'week1-2',
    kind: 'manager',
    slackUserId: 'UMANAGER1',
    email: 'mia@webflow.com',
  },
  buddy: {
    name: 'Buddy Bud',
    role: 'Onboarding Buddy',
    discussionPoints: 'ask about anything',
    weekBucket: 'week1-2',
    kind: 'buddy',
    slackUserId: 'UBUDDY1',
  },
  teammates: [],
  docs: [],
  keyPaths: ['packages/systems/spring'],
  recommendedChannels: [],
  tools: [],
  rituals: [],
  checklist: [],
};

describe('onboardingPackages', () => {
  it('creates a draft with default sections and canvas skipped in mock mode', async () => {
    const ctx = makeTestCtx();
    const pkg = await createDraftPackage(ctx, {
      profile: baseProfile,
      createdByUserId: 'UMANAGER1',
      hydrateSlack: false,
    });
    expect(pkg.userId).toBe('UHIRE001');
    expect(pkg.status).toBe('draft');
    expect(pkg.managerUserId).toBe('UMANAGER1');
    expect(pkg.reviewerUserIds).toContain('UMANAGER1');
    expect(pkg.reviewerUserIds).toContain('UBUDDY1');
    expect(pkg.sections.welcome.intro).toContain('Hira');
    expect(pkg.sections.onboardingChecklist.sections.length).toBeGreaterThan(0);
  });

  it('round-trips via ctx.db', async () => {
    const ctx = makeTestCtx();
    await createDraftPackage(ctx, {
      profile: baseProfile,
      createdByUserId: 'UMANAGER1',
      hydrateSlack: false,
    });
    const drafts = await ctx.db.listDraftsForManager('UMANAGER1');
    expect(drafts).toHaveLength(1);
    expect(drafts[0].userId).toBe('UHIRE001');
  });

  it('hydrateSlackWorkspace skips when draft channel already exists', async () => {
    const ctx = makeTestCtx();
    const pkg = await createDraftPackage(ctx, {
      profile: baseProfile,
      createdByUserId: 'UMANAGER1',
      hydrateSlack: false,
    });
    pkg.draftChannelId = 'C_ALREADY_THERE';
    await ctx.db.update(pkg);
    const again = await hydrateSlackWorkspace(ctx, pkg, baseProfile);
    expect(again.draftChannelId).toBe('C_ALREADY_THERE');
    // No conversations.create call was made — only the initial Slack
    // calls from createDraftPackage (nothing) plus nothing here.
    expect(
      ctx.slack._calls?.some((c) => c.method === 'conversations.create')
    ).toBe(false);
  });

  it('update drafts patches existing state', async () => {
    const ctx = makeTestCtx();
    await createDraftPackage(ctx, {
      profile: baseProfile,
      createdByUserId: 'UMANAGER1',
      hydrateSlack: false,
    });
    const updated = await updateDraftPackage(ctx, {
      profile: baseProfile,
      createdByUserId: 'UMANAGER1',
      welcomeNote: 'Welcome, Hira!',
      hydrateSlack: false,
    });
    expect(updated?.welcomeNote).toBe('Welcome, Hira!');
  });
});
