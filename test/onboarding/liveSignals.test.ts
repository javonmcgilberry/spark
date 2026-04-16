import {describe, expect, it, vi} from 'vitest';
import type {GitHubService} from '../../src/services/githubService.js';
import type {JiraService} from '../../src/services/jiraService.js';
import {
  computeLiveSignals,
  type LiveSignalContext,
} from '../../src/onboarding/liveSignals.js';
import type {
  JourneyState,
  OnboardingPackage,
  TeamProfile,
} from '../../src/onboarding/types.js';
import {createTestLogger} from '../helpers/createTestLogger.js';

function buildProfile(overrides: Partial<TeamProfile> = {}): TeamProfile {
  return {
    userId: 'U1',
    firstName: 'Ada',
    displayName: 'Ada',
    email: 'ada.lovelace@webflow.com',
    teamName: 'Frontend',
    roleTrack: 'frontend',
    githubTeamSlug: 'frontend-eng',
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
    ...overrides,
  };
}

function buildState(overrides: Partial<JourneyState> = {}): JourneyState {
  return {
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
    ...overrides,
  };
}

function buildPackage(
  overrides: {
    channels?: Array<{
      category: string;
      channel: string;
      description: string;
    }>;
    tools?: Array<{category: string; tool: string; description: string}>;
    checklistSections?: Array<{
      id: string;
      title: string;
      goal: string;
      items: Array<{label: string; notes: string; kind: 'task'}>;
    }>;
  } = {}
): OnboardingPackage {
  return {
    status: 'published',
    publishedAt: '2026-04-01T00:00:00Z',
    sections: {
      slack: {
        title: 'Slack channels',
        intro: '',
        channels: overrides.channels ?? [],
      },
      toolsAccess: {
        title: 'Tools access',
        intro: '',
        tools: overrides.tools ?? [],
      },
      onboardingChecklist: {
        title: 'Checklist',
        intro: '',
        sections: overrides.checklistSections ?? [],
      },
    },
  } as unknown as OnboardingPackage;
}

function buildContext(
  overrides: Partial<LiveSignalContext> = {}
): LiveSignalContext {
  return {
    profile: buildProfile(),
    state: buildState(),
    onboardingPackage: undefined,
    stage: {weekKey: 'week1', daysSince: 0},
    joinedSlackChannels: undefined,
    github: undefined,
    jira: undefined,
    logger: createTestLogger(),
    ...overrides,
  };
}

function signalById(
  signals: Awaited<ReturnType<typeof computeLiveSignals>>,
  id: string
) {
  return signals.find((s) => s.id === id);
}

describe('computeLiveSignals / user-guide signal', () => {
  it('emits "Draft my User Guide" at priority 9 when no sections are answered', async () => {
    const signals = await computeLiveSignals(buildContext());
    const signal = signalById(signals, 'user-guide-start');
    expect(signal).toBeDefined();
    expect(signal?.title).toBe('Draft my User Guide');
    expect(signal?.priority).toBe(9);
  });

  it('emits a resume pill with the current progress count when partially answered', async () => {
    const state = buildState({
      userGuideIntake: {
        answers: {schedule: '9-5', values: 'Transparency', feedback: 'Async'},
      },
    });
    const signals = await computeLiveSignals(buildContext({state}));

    expect(signalById(signals, 'user-guide-start')).toBeUndefined();
    const resume = signalById(signals, 'user-guide-resume');
    expect(resume).toBeDefined();
    expect(resume?.title).toContain('3/8');
    expect(resume?.priority).toBe(8);
  });

  it('emits nothing when the intake is fully complete', async () => {
    const allAnswers = {
      schedule: 'a',
      style: 'b',
      values: 'c',
      'pet-peeves': 'd',
      communication: 'e',
      'help-me': 'f',
      feedback: 'g',
      decisions: 'h',
    };
    const state = buildState({
      userGuideIntake: {
        answers: allAnswers,
        completedAt: '2026-04-10T00:00:00Z',
      },
    });
    const signals = await computeLiveSignals(buildContext({state}));
    expect(signalById(signals, 'user-guide-start')).toBeUndefined();
    expect(signalById(signals, 'user-guide-resume')).toBeUndefined();
  });
});

describe('computeLiveSignals / unjoined-channels signal', () => {
  it('is omitted when the joined set is unknown', async () => {
    const pkg = buildPackage({
      channels: [
        {category: 'Core', channel: '#eng-general', description: ''},
        {category: 'Core', channel: '#eng-frontend', description: ''},
      ],
    });
    const signals = await computeLiveSignals(
      buildContext({onboardingPackage: pkg})
    );
    expect(signalById(signals, 'unjoined-channels')).toBeUndefined();
  });

  it('is omitted when every recommended channel is already joined', async () => {
    const pkg = buildPackage({
      channels: [
        {category: 'Core', channel: '#eng-general', description: ''},
        {category: 'Core', channel: '#eng-frontend', description: ''},
      ],
    });
    const signals = await computeLiveSignals(
      buildContext({
        onboardingPackage: pkg,
        joinedSlackChannels: new Set(['eng-general', 'eng-frontend']),
      })
    );
    expect(signalById(signals, 'unjoined-channels')).toBeUndefined();
  });

  it('counts only the channels the user has NOT joined', async () => {
    const pkg = buildPackage({
      channels: [
        {category: 'Core', channel: '#eng-general', description: ''},
        {category: 'Core', channel: '#eng-frontend', description: ''},
        {category: 'Fun', channel: '#dogs', description: ''},
      ],
    });
    const signals = await computeLiveSignals(
      buildContext({
        onboardingPackage: pkg,
        joinedSlackChannels: new Set(['eng-general']),
      })
    );
    const signal = signalById(signals, 'unjoined-channels');
    expect(signal?.title).toContain('2 channels');
  });
});

describe('computeLiveSignals / checklist-pending signal', () => {
  it('is omitted when every checklist item is already completed', async () => {
    const pkg = buildPackage({
      checklistSections: [
        {
          id: 'week1-setup',
          title: 'Week 1',
          goal: '',
          items: [
            {label: 'A', notes: '', kind: 'task'},
            {label: 'B', notes: '', kind: 'task'},
          ],
        },
      ],
    });
    const state = buildState({
      itemStatuses: {
        'week1-setup:0': 'completed',
        'week1-setup:1': 'completed',
      },
    });
    const signals = await computeLiveSignals(
      buildContext({onboardingPackage: pkg, state})
    );
    expect(signalById(signals, 'checklist-pending')).toBeUndefined();
  });

  it('counts items that are not marked completed (includes in-progress and not-started)', async () => {
    const pkg = buildPackage({
      checklistSections: [
        {
          id: 'week1-setup',
          title: 'Week 1',
          goal: '',
          items: [
            {label: 'A', notes: '', kind: 'task'},
            {label: 'B', notes: '', kind: 'task'},
            {label: 'C', notes: '', kind: 'task'},
          ],
        },
      ],
    });
    const state = buildState({
      itemStatuses: {
        'week1-setup:0': 'completed',
        'week1-setup:1': 'in-progress',
        // :2 left untouched (not-started)
      },
    });
    const signals = await computeLiveSignals(
      buildContext({onboardingPackage: pkg, state})
    );
    const signal = signalById(signals, 'checklist-pending');
    expect(signal?.title).toContain('2 checklist items');
  });
});

describe('computeLiveSignals / tool-access-gap signal', () => {
  it('is omitted when every tool is marked accessed', async () => {
    const pkg = buildPackage({
      tools: [
        {category: 'general', tool: 'okta', description: ''},
        {category: 'general', tool: 'slack', description: ''},
      ],
    });
    const state = buildState({
      toolAccess: {
        'general::okta': true,
        'general::slack': true,
      },
    });
    const signals = await computeLiveSignals(
      buildContext({onboardingPackage: pkg, state})
    );
    expect(signalById(signals, 'tool-access-gap')).toBeUndefined();
  });

  it('counts tools still unchecked', async () => {
    const pkg = buildPackage({
      tools: [
        {category: 'general', tool: 'okta', description: ''},
        {category: 'general', tool: 'slack', description: ''},
        {category: 'engineering', tool: 'datadog', description: ''},
      ],
    });
    const state = buildState({
      toolAccess: {'general::okta': true},
    });
    const signals = await computeLiveSignals(
      buildContext({onboardingPackage: pkg, state})
    );
    const signal = signalById(signals, 'tool-access-gap');
    expect(signal?.title).toContain('2 tools');
  });
});

describe('computeLiveSignals / admin-panel-access signal', () => {
  it('fires when the package includes an "Admin Panel" tool and it is unchecked', async () => {
    const pkg = buildPackage({
      tools: [{category: 'engineering', tool: 'Admin Panel', description: ''}],
    });
    const signals = await computeLiveSignals(
      buildContext({onboardingPackage: pkg, state: buildState()})
    );
    const signal = signalById(signals, 'admin-panel-access');
    expect(signal).toBeDefined();
    expect(signal?.priority).toBe(8);
  });

  it('fires for the "Webflow Admin" phrasing too', async () => {
    const pkg = buildPackage({
      tools: [
        {category: 'engineering', tool: 'Webflow Admin', description: ''},
      ],
    });
    const signals = await computeLiveSignals(
      buildContext({onboardingPackage: pkg, state: buildState()})
    );
    expect(signalById(signals, 'admin-panel-access')).toBeDefined();
  });

  it('matches case-insensitively (lowercase "admin panel")', async () => {
    const pkg = buildPackage({
      tools: [{category: 'engineering', tool: 'admin panel', description: ''}],
    });
    const signals = await computeLiveSignals(
      buildContext({onboardingPackage: pkg, state: buildState()})
    );
    expect(signalById(signals, 'admin-panel-access')).toBeDefined();
  });

  it('does not fire when the Admin Panel tool is checked off', async () => {
    const pkg = buildPackage({
      tools: [{category: 'engineering', tool: 'Admin Panel', description: ''}],
    });
    const state = buildState({
      toolAccess: {
        [`engineering::${'Admin Panel'.toLowerCase()}`]: true,
      },
    });
    const signals = await computeLiveSignals(
      buildContext({onboardingPackage: pkg, state})
    );
    expect(signalById(signals, 'admin-panel-access')).toBeUndefined();
  });

  it('does not fire when the package has no Admin Panel tool', async () => {
    const pkg = buildPackage({
      tools: [
        {category: 'general', tool: 'okta', description: ''},
        {category: 'engineering', tool: 'datadog', description: ''},
      ],
    });
    const signals = await computeLiveSignals(
      buildContext({onboardingPackage: pkg, state: buildState()})
    );
    expect(signalById(signals, 'admin-panel-access')).toBeUndefined();
  });

  it('outranks the generic tool-access-gap signal when both fire', async () => {
    const pkg = buildPackage({
      tools: [
        {category: 'engineering', tool: 'Admin Panel', description: ''},
        {category: 'general', tool: 'okta', description: ''},
      ],
    });
    const signals = await computeLiveSignals(
      buildContext({onboardingPackage: pkg, state: buildState()})
    );
    const admin = signalById(signals, 'admin-panel-access');
    const gap = signalById(signals, 'tool-access-gap');
    expect(admin).toBeDefined();
    expect(gap).toBeDefined();
    const adminIndex = signals.findIndex((s) => s.id === 'admin-panel-access');
    const gapIndex = signals.findIndex((s) => s.id === 'tool-access-gap');
    expect(adminIndex).toBeLessThan(gapIndex);
    expect(admin!.priority).toBeGreaterThan(gap!.priority);
  });
});

describe('computeLiveSignals / GitHub signals', () => {
  function buildGitHubMock(overrides: {
    team?: Array<{author: string}>;
    awaitingReview?: number;
    openAuthored?: number;
  }): GitHubService {
    return {
      isConfigured: () => true,
      findRecentPullRequestsForTeam: vi
        .fn()
        .mockResolvedValue(overrides.team ?? []),
      findPullRequestsAwaitingReview: vi
        .fn()
        .mockResolvedValue(new Array(overrides.awaitingReview ?? 0).fill({})),
      findOpenPullRequestsForUser: vi
        .fn()
        .mockResolvedValue(new Array(overrides.openAuthored ?? 0).fill({})),
    } as unknown as GitHubService;
  }

  it('omits teammate-shipping when GitHub is not configured', async () => {
    const github = {
      isConfigured: () => false,
    } as unknown as GitHubService;
    const signals = await computeLiveSignals(buildContext({github}));
    expect(signalById(signals, 'teammate-shipping')).toBeUndefined();
  });

  it('omits teammate-shipping when no team PRs are returned', async () => {
    const github = buildGitHubMock({team: []});
    const signals = await computeLiveSignals(buildContext({github}));
    expect(signalById(signals, 'teammate-shipping')).toBeUndefined();
  });

  it('reports distinct teammate authors in the teammate-shipping pill', async () => {
    const github = buildGitHubMock({
      team: [{author: 'grace'}, {author: 'lin'}, {author: 'grace'}],
    });
    const signals = await computeLiveSignals(buildContext({github}));
    const signal = signalById(signals, 'teammate-shipping');
    expect(signal?.title).toBe('2 teammates shipping');
  });

  it('singularizes when only one teammate shipped', async () => {
    const github = buildGitHubMock({team: [{author: 'grace'}]});
    const signals = await computeLiveSignals(buildContext({github}));
    const signal = signalById(signals, 'teammate-shipping');
    expect(signal?.title).toBe('1 teammate shipping');
  });

  it('emits prs-awaiting-review only when count > 0', async () => {
    const none = await computeLiveSignals(
      buildContext({github: buildGitHubMock({awaitingReview: 0})})
    );
    expect(signalById(none, 'prs-awaiting-review')).toBeUndefined();

    const some = await computeLiveSignals(
      buildContext({github: buildGitHubMock({awaitingReview: 3})})
    );
    const signal = signalById(some, 'prs-awaiting-review');
    expect(signal?.title).toBe('3 PRs need my review');
  });

  it('emits open-authored-prs only when the user has open PRs', async () => {
    const none = await computeLiveSignals(
      buildContext({github: buildGitHubMock({openAuthored: 0})})
    );
    expect(signalById(none, 'open-authored-prs')).toBeUndefined();

    const some = await computeLiveSignals(
      buildContext({github: buildGitHubMock({openAuthored: 1})})
    );
    const signal = signalById(some, 'open-authored-prs');
    expect(signal?.title).toBe('1 of my PRs open');
  });

  it('survives a GitHub throw and keeps other signals', async () => {
    const github = {
      isConfigured: () => true,
      findRecentPullRequestsForTeam: vi
        .fn()
        .mockRejectedValue(new Error('boom')),
      findPullRequestsAwaitingReview: vi.fn().mockResolvedValue([]),
      findOpenPullRequestsForUser: vi.fn().mockResolvedValue([]),
    } as unknown as GitHubService;
    const signals = await computeLiveSignals(buildContext({github}));
    expect(signalById(signals, 'teammate-shipping')).toBeUndefined();
    // The evergreen user-guide + stage signals should still be present.
    expect(signalById(signals, 'user-guide-start')).toBeDefined();
  });
});

describe('computeLiveSignals / Jira signal', () => {
  it('omits assigned-jira when the user has no email', async () => {
    const jira = {
      isConfigured: () => true,
      findAssignedToEmail: vi.fn(),
    } as unknown as JiraService;
    const signals = await computeLiveSignals(
      buildContext({jira, profile: buildProfile({email: undefined})})
    );
    expect(signalById(signals, 'assigned-jira')).toBeUndefined();
  });

  it('omits assigned-jira when zero tickets are assigned', async () => {
    const jira = {
      isConfigured: () => true,
      findAssignedToEmail: vi.fn().mockResolvedValue([]),
    } as unknown as JiraService;
    const signals = await computeLiveSignals(buildContext({jira}));
    expect(signalById(signals, 'assigned-jira')).toBeUndefined();
  });

  it('emits assigned-jira with the ticket count', async () => {
    const jira = {
      isConfigured: () => true,
      findAssignedToEmail: vi
        .fn()
        .mockResolvedValue([{key: 'ABC-1'}, {key: 'ABC-2'}]),
    } as unknown as JiraService;
    const signals = await computeLiveSignals(buildContext({jira}));
    const signal = signalById(signals, 'assigned-jira');
    expect(signal?.title).toBe('2 tickets assigned');
  });
});

describe('computeLiveSignals / milestone-prep signal', () => {
  function contextAtDay(daysSince: number): LiveSignalContext {
    return buildContext({
      stage: {weekKey: 'week1', daysSince},
    });
  }

  it('is silent on day 26 (one day before the month-1 window opens)', async () => {
    const signals = await computeLiveSignals(contextAtDay(26));
    expect(signalById(signals, 'milestone-prep')).toBeUndefined();
  });

  it('emits "in 3d" on day 27, the first day of the month-1 window', async () => {
    const signals = await computeLiveSignals(contextAtDay(27));
    const signal = signalById(signals, 'milestone-prep');
    expect(signal).toBeDefined();
    expect(signal?.title).toBe('Milestone 1:1 in 3d');
    expect(signal?.priority).toBe(7);
  });

  it('emits "today" on day 30, the month-1 deadline', async () => {
    const signals = await computeLiveSignals(contextAtDay(30));
    const signal = signalById(signals, 'milestone-prep');
    expect(signal).toBeDefined();
    expect(signal?.title).toBe('Milestone 1:1 today');
    expect(signal?.priority).toBe(7);
  });

  it('is silent on day 31 (the gap between month-1 and the month-2 window)', async () => {
    const signals = await computeLiveSignals(contextAtDay(31));
    expect(signalById(signals, 'milestone-prep')).toBeUndefined();
  });

  it('emits "in 3d" on day 57, the first day of the month-2 window', async () => {
    const signals = await computeLiveSignals(contextAtDay(57));
    const signal = signalById(signals, 'milestone-prep');
    expect(signal?.title).toBe('Milestone 1:1 in 3d');
    expect(signal?.priority).toBe(7);
  });

  it('emits "today" on day 60, the month-2 deadline', async () => {
    const signals = await computeLiveSignals(contextAtDay(60));
    const signal = signalById(signals, 'milestone-prep');
    expect(signal?.title).toBe('Milestone 1:1 today');
    expect(signal?.priority).toBe(7);
  });

  it('emits "in 3d" on day 87, the first day of the month-3 window', async () => {
    const signals = await computeLiveSignals(contextAtDay(87));
    const signal = signalById(signals, 'milestone-prep');
    expect(signal?.title).toBe('Milestone 1:1 in 3d');
    expect(signal?.priority).toBe(7);
  });

  it('emits "today" on day 90, the month-3 deadline', async () => {
    const signals = await computeLiveSignals(contextAtDay(90));
    const signal = signalById(signals, 'milestone-prep');
    expect(signal?.title).toBe('Milestone 1:1 today');
    expect(signal?.priority).toBe(7);
  });

  it('is silent on day 91 (past every milestone window)', async () => {
    const signals = await computeLiveSignals(contextAtDay(91));
    expect(signalById(signals, 'milestone-prep')).toBeUndefined();
  });

  it('shares priority 7 with teammate-shipping so both can fire together on day 90', async () => {
    const github = {
      isConfigured: () => true,
      findRecentPullRequestsForTeam: vi
        .fn()
        .mockResolvedValue([{author: 'grace'}]),
      findPullRequestsAwaitingReview: vi.fn().mockResolvedValue([]),
      findOpenPullRequestsForUser: vi.fn().mockResolvedValue([]),
    } as unknown as GitHubService;

    const signals = await computeLiveSignals(
      buildContext({
        stage: {weekKey: 'stretch90', daysSince: 90},
        github,
      })
    );

    const milestone = signalById(signals, 'milestone-prep');
    const teammate = signalById(signals, 'teammate-shipping');
    expect(milestone).toBeDefined();
    expect(teammate).toBeDefined();
    expect(milestone?.priority).toBe(7);
    expect(teammate?.priority).toBe(7);
  });
});

describe('computeLiveSignals / ranking', () => {
  it('returns at most 4 pills sorted by priority descending', async () => {
    // Build a context that will fire many signals at once.
    const pkg = buildPackage({
      channels: [
        {category: 'Core', channel: '#eng-general', description: ''},
        {category: 'Core', channel: '#eng-frontend', description: ''},
      ],
      tools: [
        {category: 'general', tool: 'okta', description: ''},
        {category: 'general', tool: 'slack', description: ''},
      ],
      checklistSections: [
        {
          id: 'week1-setup',
          title: 'Week 1',
          goal: '',
          items: [
            {label: 'A', notes: '', kind: 'task'},
            {label: 'B', notes: '', kind: 'task'},
          ],
        },
      ],
    });
    const github = {
      isConfigured: () => true,
      findRecentPullRequestsForTeam: vi
        .fn()
        .mockResolvedValue([{author: 'grace'}]),
      findPullRequestsAwaitingReview: vi.fn().mockResolvedValue([{}]),
      findOpenPullRequestsForUser: vi.fn().mockResolvedValue([{}]),
    } as unknown as GitHubService;
    const jira = {
      isConfigured: () => true,
      findAssignedToEmail: vi.fn().mockResolvedValue([{key: 'ABC-1'}]),
    } as unknown as JiraService;

    const signals = await computeLiveSignals(
      buildContext({
        onboardingPackage: pkg,
        joinedSlackChannels: new Set(), // nothing joined → unjoined fires
        github,
        jira,
      })
    );

    expect(signals).toHaveLength(4);

    // Confirm descending priority order.
    const priorities = signals.map((s) => s.priority);
    for (let i = 1; i < priorities.length; i += 1) {
      expect(priorities[i - 1]).toBeGreaterThanOrEqual(priorities[i]);
    }

    // User-guide (priority 9) is highest, so it must be first.
    expect(signals[0].id).toBe('user-guide-start');
  });

  it('stage-checkpoint acts as a low-priority evergreen fallback', async () => {
    // Minimal context → only user-guide (9) + stage-checkpoint (2) fire.
    const signals = await computeLiveSignals(buildContext());
    const ids = signals.map((s) => s.id);
    expect(ids).toContain('stage-checkpoint');
    // With priority 2, stage-checkpoint should never beat user-guide.
    const stageIndex = ids.indexOf('stage-checkpoint');
    const guideIndex = ids.indexOf('user-guide-start');
    expect(stageIndex).toBeGreaterThan(guideIndex);
  });
});

describe('computeLiveSignals / survey-due signal', () => {
  it('is null on day 10 (one day before the week 1+2 window opens)', async () => {
    const signals = await computeLiveSignals(
      buildContext({stage: {weekKey: 'week2', daysSince: 10}})
    );
    expect(signalById(signals, 'survey-due')).toBeUndefined();
  });

  it('emits on day 11 with a 3-day countdown (window opens)', async () => {
    const signals = await computeLiveSignals(
      buildContext({stage: {weekKey: 'week2', daysSince: 11}})
    );
    const signal = signalById(signals, 'survey-due');
    expect(signal).toBeDefined();
    expect(signal?.title).toBe('Survey due in 3 days');
    expect(signal?.priority).toBe(7);
  });

  it('emits "Survey due today" on day 14 (the week 1+2 deadline)', async () => {
    const signals = await computeLiveSignals(
      buildContext({stage: {weekKey: 'week2', daysSince: 14}})
    );
    const signal = signalById(signals, 'survey-due');
    expect(signal?.title).toBe('Survey due today');
  });

  it('is null on day 15 (past the week 1+2 deadline, before the week 5 window)', async () => {
    const signals = await computeLiveSignals(
      buildContext({stage: {weekKey: 'week3', daysSince: 15}})
    );
    expect(signalById(signals, 'survey-due')).toBeUndefined();
  });

  it('emits "Survey due today" on day 35 (week 5 deadline)', async () => {
    const signals = await computeLiveSignals(
      buildContext({stage: {weekKey: 'stretch60', daysSince: 35}})
    );
    const signal = signalById(signals, 'survey-due');
    expect(signal?.title).toBe('Survey due today');
  });

  it('is null on day 36 (past the week 5 deadline)', async () => {
    const signals = await computeLiveSignals(
      buildContext({stage: {weekKey: 'stretch60', daysSince: 36}})
    );
    expect(signalById(signals, 'survey-due')).toBeUndefined();
  });

  it('counts down correctly across the 90-day window (days 87 → 90)', async () => {
    const titles: Array<string | undefined> = [];
    for (const daysSince of [87, 88, 89, 90]) {
      const signals = await computeLiveSignals(
        buildContext({stage: {weekKey: 'stretch90', daysSince}})
      );
      titles.push(signalById(signals, 'survey-due')?.title);
    }
    expect(titles).toEqual([
      'Survey due in 3 days',
      'Survey due in 2 days',
      'Survey due in 1 day',
      'Survey due today',
    ]);
  });

  it('is null on day 91 (one day past the 90-day deadline)', async () => {
    const signals = await computeLiveSignals(
      buildContext({stage: {weekKey: 'beyond90', daysSince: 91}})
    );
    expect(signalById(signals, 'survey-due')).toBeUndefined();
  });

  it('outranks stage-checkpoint (priority 2) and tool-access-gap (priority 3) in the sorted output', async () => {
    // Clear the user-guide and user-guide-resume so MAX_PILLS doesn't crowd
    // the mid-priority signals out.
    const completedIntake = {
      answers: {
        schedule: 'a',
        style: 'b',
        values: 'c',
        'pet-peeves': 'd',
        communication: 'e',
        'help-me': 'f',
        feedback: 'g',
        decisions: 'h',
      },
      completedAt: '2026-04-10T00:00:00Z',
    };
    const state = buildState({userGuideIntake: completedIntake});
    const pkg = buildPackage({
      tools: [
        {category: 'general', tool: 'okta', description: ''},
        {category: 'engineering', tool: 'datadog', description: ''},
      ],
    });
    const signals = await computeLiveSignals(
      buildContext({
        state,
        onboardingPackage: pkg,
        stage: {weekKey: 'week2', daysSince: 12},
      })
    );
    const ids = signals.map((s) => s.id);
    const surveyIndex = ids.indexOf('survey-due');
    const stageIndex = ids.indexOf('stage-checkpoint');
    const toolIndex = ids.indexOf('tool-access-gap');

    expect(surveyIndex).toBeGreaterThanOrEqual(0);
    expect(stageIndex).toBeGreaterThanOrEqual(0);
    expect(toolIndex).toBeGreaterThanOrEqual(0);
    expect(surveyIndex).toBeLessThan(toolIndex);
    expect(surveyIndex).toBeLessThan(stageIndex);
  });

  it('loses to user-guide-start (priority 9) in the sorted output', async () => {
    const signals = await computeLiveSignals(
      buildContext({stage: {weekKey: 'week2', daysSince: 12}})
    );
    const ids = signals.map((s) => s.id);
    const surveyIndex = ids.indexOf('survey-due');
    const guideIndex = ids.indexOf('user-guide-start');

    expect(surveyIndex).toBeGreaterThanOrEqual(0);
    expect(guideIndex).toBeGreaterThanOrEqual(0);
    expect(guideIndex).toBeLessThan(surveyIndex);
  });
});
