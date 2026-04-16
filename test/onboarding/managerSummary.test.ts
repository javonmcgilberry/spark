import {describe, expect, it, vi} from 'vitest';
import {
  buildManagerSummaries,
  buildHomePendingView,
  buildHomeView,
  type ManagerHireSummary,
  renderManagerSummaryCard,
} from '../../src/onboarding/home/index.js';
import {buildToolAccessKey} from '../../src/onboarding/home/actionIds.js';
import type {GitHubService} from '../../src/services/githubService.js';
import type {JiraService} from '../../src/services/jiraService.js';
import {collectTextContent} from '../helpers/collectTextContent.js';
import {createTestLogger} from '../helpers/createTestLogger.js';
import {createTestServices} from '../helpers/createTestServices.js';

function buildSummary(
  overrides: Partial<ManagerHireSummary> = {}
): ManagerHireSummary {
  return {
    userId: 'UADA',
    firstName: 'Ada',
    daysIn: 12,
    checklistCompleted: 4,
    checklistTotal: 12,
    userGuideAnswered: 3,
    userGuideTotal: 8,
    toolsChecked: 2,
    toolsTotal: 8,
    ...overrides,
  };
}

describe('OnboardingPackageService.getPackagesManagedBy', () => {
  it('returns packages created by the given user', async () => {
    const managerUserId = 'UMGR';
    const {services, profile} = createTestServices();

    const pkg = await services.onboardingPackages.createDraftPackage({
      profile,
      createdByUserId: managerUserId,
    });

    const managed =
      services.onboardingPackages.getPackagesManagedBy(managerUserId);

    expect(managed).toHaveLength(1);
    expect(managed[0].userId).toBe(pkg.userId);
    expect(managed[0].createdByUserId).toBe(managerUserId);
  });

  it('returns packages where managerUserId matches even when another user authored them', async () => {
    const {services, profile} = createTestServices();
    const assignedManagerUserId = profile.manager.slackUserId!;
    const authorUserId = 'UREC123';

    await services.onboardingPackages.createDraftPackage({
      profile,
      createdByUserId: authorUserId,
    });

    const managedByAssignedManager =
      services.onboardingPackages.getPackagesManagedBy(assignedManagerUserId);
    const managedByAuthor =
      services.onboardingPackages.getPackagesManagedBy(authorUserId);

    expect(managedByAssignedManager.map((pkg) => pkg.userId)).toEqual([
      profile.userId,
    ]);
    expect(managedByAuthor.map((pkg) => pkg.userId)).toEqual([profile.userId]);
  });

  it('excludes packages the user neither created nor is the assigned manager of', async () => {
    const {services, profile} = createTestServices();
    const authorAndManagerUserId = profile.manager.slackUserId!;
    const outsiderUserId = 'UOUTSIDER';

    await services.onboardingPackages.createDraftPackage({
      profile,
      createdByUserId: authorAndManagerUserId,
    });

    const managedByOutsider =
      services.onboardingPackages.getPackagesManagedBy(outsiderUserId);

    expect(managedByOutsider).toEqual([]);
  });
});

describe('renderManagerSummaryCard', () => {
  it('returns an empty block list when no summaries are provided', () => {
    expect(renderManagerSummaryCard([])).toEqual([]);
  });

  it('includes the hire name, days count, checklist fraction, and user-guide fraction in the rendered text', () => {
    const summary = buildSummary({
      firstName: 'Ada',
      daysIn: 12,
      checklistCompleted: 4,
      checklistTotal: 12,
      userGuideAnswered: 3,
      userGuideTotal: 8,
    });

    const blocks = renderManagerSummaryCard([summary]);
    const text = collectTextContent(blocks);

    expect(text).toContain('Ada');
    expect(text).toContain('day 12');
    expect(text).toContain('Checklist 4/12');
    expect(text).toContain('User guide 3/8');
  });

  it('renders one section block per hire plus a single header', () => {
    const blocks = renderManagerSummaryCard([
      buildSummary({userId: 'U1', firstName: 'Ada'}),
      buildSummary({userId: 'U2', firstName: 'Grace'}),
    ]);

    const headerBlocks = blocks.filter((block) => block.type === 'header');
    const sectionBlocks = blocks.filter((block) => block.type === 'section');
    expect(headerBlocks).toHaveLength(1);
    expect(sectionBlocks).toHaveLength(2);

    const sectionText = collectTextContent(sectionBlocks);
    expect(sectionText).toContain('Ada');
    expect(sectionText).toContain('Grace');
  });

  it('appends the optional PR/ticket activity line only when counts are positive', () => {
    const withActivity = renderManagerSummaryCard([
      buildSummary({firstName: 'Ada', openPRs: 2, openTickets: 3}),
    ]);
    const withoutActivity = renderManagerSummaryCard([
      buildSummary({firstName: 'Ada', openPRs: 0, openTickets: 0}),
    ]);
    const withoutData = renderManagerSummaryCard([
      buildSummary({firstName: 'Ada'}),
    ]);

    expect(collectTextContent(withActivity)).toContain('2 open PRs');
    expect(collectTextContent(withActivity)).toContain('3 tickets');
    expect(collectTextContent(withoutActivity)).not.toContain('open PR');
    expect(collectTextContent(withoutActivity)).not.toContain('ticket');
    expect(collectTextContent(withoutData)).not.toContain('open PR');
  });
});

describe('buildHomeView with managerSummaries', () => {
  it('includes the manager card blocks when managerSummaries is non-empty', async () => {
    const {services, profile} = createTestServices();
    const managerUserId = profile.manager.slackUserId!;
    await services.onboardingPackages.createDraftPackage({
      profile,
      createdByUserId: managerUserId,
    });
    services.onboardingPackages.publishPackage(profile.userId, managerUserId);
    const pkg = services.onboardingPackages.getPackageForUser(profile.userId)!;
    const state = services.journey.getState(profile.userId);

    const summary = buildSummary({
      userId: profile.userId,
      firstName: profile.firstName,
      daysIn: 5,
      checklistCompleted: 2,
      checklistTotal: 7,
      userGuideAnswered: 1,
      userGuideTotal: 8,
    });

    const viewWithCard = buildHomeView(pkg, state, {
      managerSummaries: [summary],
    });
    const viewWithoutCard = buildHomeView(pkg, state);

    expect(viewWithCard.blocks.length).toBeGreaterThan(
      viewWithoutCard.blocks.length
    );
    const diff = viewWithCard.blocks.length - viewWithoutCard.blocks.length;
    expect(diff).toBe(2);

    const cardText = collectTextContent(viewWithCard.blocks.slice(0, diff + 1));
    expect(cardText).toContain(profile.firstName);
    expect(cardText).toContain('day 5');
    expect(cardText).toContain('Checklist 2/7');
    expect(cardText).toContain('User guide 1/8');
  });

  it('omits the manager card entirely when context.managerSummaries is undefined', async () => {
    const {services, profile} = createTestServices();
    const managerUserId = profile.manager.slackUserId!;
    await services.onboardingPackages.createDraftPackage({
      profile,
      createdByUserId: managerUserId,
    });
    services.onboardingPackages.publishPackage(profile.userId, managerUserId);
    const pkg = services.onboardingPackages.getPackageForUser(profile.userId)!;
    const state = services.journey.getState(profile.userId);

    const viewWithoutCard = buildHomeView(pkg, state);
    const viewWithCard = buildHomeView(pkg, state, {
      managerSummaries: [
        buildSummary({
          userId: 'U_OTHER_HIRE',
          firstName: 'Zelda',
          daysIn: 99,
        }),
      ],
    });

    const cardHeaderText = 'Your 1 onboarding hire';
    expect(collectTextContent(viewWithCard.blocks)).toContain(cardHeaderText);
    expect(collectTextContent(viewWithoutCard.blocks)).not.toContain(
      cardHeaderText
    );
    expect(collectTextContent(viewWithCard.blocks)).toContain('Zelda');
    expect(collectTextContent(viewWithoutCard.blocks)).not.toContain('Zelda');
  });
});

describe('buildHomePendingView with managerSummaries', () => {
  it('renders the manager card BEFORE the draft-review list', async () => {
    const {services, profile} = createTestServices();
    const managerUserId = profile.manager.slackUserId!;
    const draft = await services.onboardingPackages.createDraftPackage({
      profile,
      createdByUserId: managerUserId,
    });

    const summary = buildSummary({
      userId: 'U_DIFFERENT_HIRE',
      firstName: 'Zelda',
      daysIn: 7,
    });

    const view = buildHomePendingView([draft], [summary]);

    const managerCardHeaderIdx = view.blocks.findIndex((block) => {
      if (block.type !== 'header') return false;
      return collectTextContent(block).includes('onboarding hire');
    });
    const draftSectionIdx = view.blocks.findIndex((block) => {
      if (block.type !== 'section') return false;
      return collectTextContent(block).includes('Status:');
    });

    expect(managerCardHeaderIdx).toBeGreaterThanOrEqual(0);
    expect(draftSectionIdx).toBeGreaterThanOrEqual(0);
    expect(managerCardHeaderIdx).toBeLessThan(draftSectionIdx);
  });

  it('omits the manager card when no summaries are supplied, preserving the existing pending view structure', () => {
    const viewWith = buildHomePendingView([], [buildSummary()]);
    const viewWithout = buildHomePendingView([]);

    expect(viewWith.blocks.length).toBeGreaterThan(viewWithout.blocks.length);
  });
});

describe('buildManagerSummaries', () => {
  it('computes checklist, user-guide, and tools progress from journey state and the package', async () => {
    const {services, profile} = createTestServices();
    const managerUserId = profile.manager.slackUserId!;
    await services.onboardingPackages.createDraftPackage({
      profile,
      createdByUserId: managerUserId,
    });
    services.onboardingPackages.publishPackage(profile.userId, managerUserId);
    const pkg = services.onboardingPackages.getPackageForUser(profile.userId)!;

    const firstSection = pkg.sections.onboardingChecklist.sections[0];
    services.journey.setItemStatus(
      profile.userId,
      `${firstSection.id}:0`,
      'completed'
    );
    services.journey.setItemStatus(
      profile.userId,
      `${firstSection.id}:1`,
      'completed'
    );

    services.journey.saveUserGuideAnswer(
      profile.userId,
      'schedule',
      '9 to 5 PT'
    );
    services.journey.saveUserGuideAnswer(
      profile.userId,
      'style',
      'Transparent'
    );

    const toolsInPackage = pkg.sections.toolsAccess.tools;
    const firstToolKey = buildToolAccessKey(
      toolsInPackage[0].category,
      toolsInPackage[0].tool
    );
    services.journey.setToolAccessForKeys(
      profile.userId,
      [firstToolKey],
      new Set([firstToolKey])
    );

    const [summary] = await buildManagerSummaries(
      {
        journey: services.journey,
        logger: createTestLogger(),
      },
      [pkg],
      new Date(Date.parse(pkg.publishedAt!) + 3 * 24 * 60 * 60 * 1000)
    );

    expect(summary.userId).toBe(profile.userId);
    expect(summary.firstName).toBe(profile.firstName);
    expect(summary.daysIn).toBe(3);
    expect(summary.checklistCompleted).toBe(2);
    expect(summary.checklistTotal).toBeGreaterThan(2);
    expect(summary.userGuideAnswered).toBe(2);
    expect(summary.userGuideTotal).toBe(8);
    expect(summary.toolsChecked).toBe(1);
    expect(summary.toolsTotal).toBe(toolsInPackage.length);
  });

  it('skips external lookups entirely when the package is still a draft', async () => {
    const {services, profile} = createTestServices();
    const managerUserId = profile.manager.slackUserId!;
    await services.onboardingPackages.createDraftPackage({
      profile,
      createdByUserId: managerUserId,
    });
    const pkg = services.onboardingPackages.getPackageForUser(profile.userId)!;

    const github = {
      isConfigured: vi.fn().mockReturnValue(true),
      findOpenPullRequestsForUser: vi
        .fn()
        .mockRejectedValue(new Error('should not be called')),
    } as unknown as GitHubService;
    const jira = {
      isConfigured: vi.fn().mockReturnValue(true),
      findAssignedToEmail: vi
        .fn()
        .mockRejectedValue(new Error('should not be called')),
    } as unknown as JiraService;

    const resolveHireEmail = vi.fn(async () => 'ada@webflow.com');

    const [summary] = await buildManagerSummaries(
      {
        journey: services.journey,
        logger: createTestLogger(),
        github,
        jira,
        resolveHireEmail,
      },
      [pkg]
    );

    expect(summary.userId).toBe(profile.userId);
    expect(summary.openPRs).toBeUndefined();
    expect(summary.openTickets).toBeUndefined();
    expect(resolveHireEmail).not.toHaveBeenCalled();
  });

  it('fetches GitHub and Jira counts for published hires using the resolved email', async () => {
    const {services, profile} = createTestServices();
    const managerUserId = profile.manager.slackUserId!;
    await services.onboardingPackages.createDraftPackage({
      profile,
      createdByUserId: managerUserId,
    });
    services.onboardingPackages.publishPackage(profile.userId, managerUserId);
    const pkg = services.onboardingPackages.getPackageForUser(profile.userId)!;

    const prs = [{number: 1}, {number: 2}];
    const issues = [{key: 'A-1'}, {key: 'A-2'}, {key: 'A-3'}];
    const github = {
      isConfigured: vi.fn().mockReturnValue(true),
      findOpenPullRequestsForUser: vi.fn().mockResolvedValue(prs),
    } as unknown as GitHubService;
    const jira = {
      isConfigured: vi.fn().mockReturnValue(true),
      findAssignedToEmail: vi.fn().mockResolvedValue(issues),
    } as unknown as JiraService;

    const resolveHireEmail = vi.fn(async () => 'ada.lovelace@webflow.com');

    const [summary] = await buildManagerSummaries(
      {
        journey: services.journey,
        logger: createTestLogger(),
        github,
        jira,
        resolveHireEmail,
      },
      [pkg]
    );

    expect(resolveHireEmail).toHaveBeenCalledWith(profile.userId);
    expect(github.findOpenPullRequestsForUser).toHaveBeenCalledWith(
      'ada-lovelace'
    );
    expect(jira.findAssignedToEmail).toHaveBeenCalledWith(
      'ada.lovelace@webflow.com'
    );
    expect(summary.openPRs).toBe(prs.length);
    expect(summary.openTickets).toBe(issues.length);
  });

  it('swallows GitHub/Jira failures and still returns a summary without those fields', async () => {
    const {services, profile} = createTestServices();
    const managerUserId = profile.manager.slackUserId!;
    await services.onboardingPackages.createDraftPackage({
      profile,
      createdByUserId: managerUserId,
    });
    services.onboardingPackages.publishPackage(profile.userId, managerUserId);
    const pkg = services.onboardingPackages.getPackageForUser(profile.userId)!;

    const github = {
      isConfigured: vi.fn().mockReturnValue(true),
      findOpenPullRequestsForUser: vi
        .fn()
        .mockRejectedValue(new Error('github boom')),
    } as unknown as GitHubService;
    const jira = {
      isConfigured: vi.fn().mockReturnValue(true),
      findAssignedToEmail: vi.fn().mockRejectedValue(new Error('jira boom')),
    } as unknown as JiraService;
    const logger = createTestLogger();
    const resolveHireEmail = vi.fn(async () => 'ada@webflow.com');

    const [summary] = await buildManagerSummaries(
      {
        journey: services.journey,
        logger,
        github,
        jira,
        resolveHireEmail,
      },
      [pkg]
    );

    expect(summary.openPRs).toBeUndefined();
    expect(summary.openTickets).toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });
});
