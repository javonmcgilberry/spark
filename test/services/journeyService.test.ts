import {beforeEach, describe, expect, it, vi} from 'vitest';
import {JourneyService} from '../../src/services/journeyService.js';
import type {GitHubService} from '../../src/services/githubService.js';
import type {JiraService} from '../../src/services/jiraService.js';
import type {ContributionGuideService} from '../../src/services/contributionGuideService.js';
import type {LlmService} from '../../src/services/llmService.js';
import type {OnboardingPackageService} from '../../src/services/onboardingPackageService.js';
import type {TaskScannerService} from '../../src/services/taskScannerService.js';
import type {TeamProfile} from '../../src/onboarding/types.js';
import {collectTextContent} from '../helpers/collectTextContent.js';
import {createTestServices} from '../helpers/createTestServices.js';

function buildProfile(overrides: Partial<TeamProfile> = {}): TeamProfile {
  return {
    userId: 'UADA123',
    firstName: 'Ada',
    displayName: 'Ada Lovelace',
    email: 'ada@webflow.com',
    teamName: 'Frontend Engineering',
    pillarName: 'Core Experience',
    githubTeamSlug: 'frontend-eng',
    roleTrack: 'frontend',
    manager: {
      name: 'Grace Hopper',
      role: 'Engineering Manager',
      discussionPoints: 'first-month priorities',
      kind: 'manager',
      weekBucket: 'week1-2',
    },
    buddy: {
      name: 'Lin Clark',
      role: 'Onboarding Buddy',
      discussionPoints: 'codebase context',
      kind: 'buddy',
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

function buildJourneyService(
  overrides: {
    jira?: Partial<JiraService>;
    github?: Partial<GitHubService>;
  } = {}
): JourneyService {
  const taskScanner = {} as TaskScannerService;
  const llmService = {} as LlmService;
  const contributionGuide = {} as ContributionGuideService;
  const onboardingPackages = {
    getPackageForUser: vi.fn().mockReturnValue(undefined),
  } as unknown as OnboardingPackageService;

  return new JourneyService(
    taskScanner,
    llmService,
    contributionGuide,
    onboardingPackages,
    {
      jira: overrides.jira as JiraService | undefined,
      github: overrides.github as GitHubService | undefined,
    }
  );
}

describe('JourneyService.setToolAccessForKeys', () => {
  it('returns a default state with an empty tool-access map for new users', () => {
    const {services} = createTestServices();

    const state = services.journey.setToolAccessForKeys(
      'user-1',
      ['general::okta'],
      new Set()
    );

    expect(state.toolAccess).toEqual({});
  });

  it('marks only the selected keys as true and keeps unrelated keys intact', () => {
    const {services} = createTestServices();

    services.journey.setToolAccessForKeys(
      'user-1',
      ['general::okta', 'general::slack'],
      new Set(['general::okta', 'general::slack'])
    );
    const state = services.journey.setToolAccessForKeys(
      'user-1',
      ['engineering::datadog'],
      new Set(['engineering::datadog'])
    );

    expect(state.toolAccess).toEqual({
      'general::okta': true,
      'general::slack': true,
      'engineering::datadog': true,
    });
  });

  it('prunes keys that were previously selected but are now unchecked', () => {
    const {services} = createTestServices();

    services.journey.setToolAccessForKeys(
      'user-1',
      ['general::okta', 'general::slack'],
      new Set(['general::okta', 'general::slack'])
    );
    const state = services.journey.setToolAccessForKeys(
      'user-1',
      ['general::okta', 'general::slack'],
      new Set(['general::slack'])
    );

    expect(state.toolAccess).toEqual({'general::slack': true});
  });

  it('refreshes updatedAt each time access is toggled', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-14T00:00:00Z'));
    const {services} = createTestServices();

    const firstUpdatedAt = services.journey.setToolAccessForKeys(
      'user-1',
      ['general::okta'],
      new Set(['general::okta'])
    ).updatedAt;
    vi.setSystemTime(new Date('2026-04-14T00:05:00Z'));
    const secondUpdatedAt = services.journey.setToolAccessForKeys(
      'user-1',
      ['general::okta'],
      new Set()
    ).updatedAt;

    expect(secondUpdatedAt).not.toBe(firstUpdatedAt);
    vi.useRealTimers();
  });
});

describe('JourneyService.showJiraTickets', () => {
  it('returns a setup hint when jira is not configured', async () => {
    const journey = buildJourneyService({
      jira: {isConfigured: () => false},
    });

    const reply = await journey.showJiraTickets(buildProfile());

    expect(collectTextContent(reply.blocks)).toContain(
      "Jira search isn't configured yet"
    );
  });

  it('looks up a specific ticket when an issue key is provided', async () => {
    const findByKey = vi.fn().mockResolvedValue({
      key: 'ABC-1',
      summary: 'Fix login bug',
      status: 'In Progress',
      url: 'https://webflow.atlassian.net/browse/ABC-1',
    });
    const journey = buildJourneyService({
      jira: {
        isConfigured: () => true,
        findByKey,
      },
    });

    const reply = await journey.showJiraTickets(buildProfile(), {
      issueKey: 'ABC-1',
    });

    expect(findByKey).toHaveBeenCalledWith('ABC-1');
    expect(reply.text).toBe('ABC-1: Fix login bug');
    expect(collectTextContent(reply.blocks)).toContain('ABC-1');
  });

  it('returns a "not found" reply when the key lookup returns null', async () => {
    const journey = buildJourneyService({
      jira: {
        isConfigured: () => true,
        findByKey: vi.fn().mockResolvedValue(null),
      },
    });

    const reply = await journey.showJiraTickets(buildProfile(), {
      issueKey: 'ABC-404',
    });

    expect(reply.text).toContain('ABC-404');
    expect(collectTextContent(reply.blocks)).toContain(
      "I couldn't find `ABC-404`"
    );
  });

  it('asks for the email when no issue key or query is given and profile has no email', async () => {
    const journey = buildJourneyService({
      jira: {
        isConfigured: () => true,
        findAssignedToEmail: vi.fn(),
      },
    });

    const reply = await journey.showJiraTickets(
      buildProfile({email: undefined})
    );

    expect(collectTextContent(reply.blocks)).toContain(
      "I couldn't find your Webflow email"
    );
  });

  it('lists assigned tickets when only the profile email is available', async () => {
    const findAssignedToEmail = vi.fn().mockResolvedValue([
      {
        key: 'ABC-1',
        summary: 'First ticket',
        status: 'Open',
        url: 'https://webflow.atlassian.net/browse/ABC-1',
      },
      {
        key: 'ABC-2',
        summary: 'Second ticket',
        status: 'Open',
        url: 'https://webflow.atlassian.net/browse/ABC-2',
      },
    ]);
    const journey = buildJourneyService({
      jira: {
        isConfigured: () => true,
        findAssignedToEmail,
      },
    });

    const reply = await journey.showJiraTickets(buildProfile());

    expect(findAssignedToEmail).toHaveBeenCalledWith('ada@webflow.com');
    expect(reply.text).toBe('You have 2 open Jira tickets.');
  });
});

describe('JourneyService.showGitHubPullRequests', () => {
  it('returns a setup hint when github is not configured', async () => {
    const journey = buildJourneyService({
      github: {isConfigured: () => false},
    });

    const reply = await journey.showGitHubPullRequests(buildProfile());

    expect(collectTextContent(reply.blocks)).toContain(
      "GitHub search isn't configured yet"
    );
  });

  it('uses the team slug when mode is "team"', async () => {
    const findTeam = vi.fn().mockResolvedValue([]);
    const journey = buildJourneyService({
      github: {
        isConfigured: () => true,
        findRecentPullRequestsForTeam: findTeam,
      },
    });

    await journey.showGitHubPullRequests(buildProfile(), {mode: 'team'});

    expect(findTeam).toHaveBeenCalledWith('frontend-eng');
  });

  it('inferrs a GitHub username from the user email for "mine" mode', async () => {
    const findMine = vi.fn().mockResolvedValue([]);
    const journey = buildJourneyService({
      github: {
        isConfigured: () => true,
        findOpenPullRequestsForUser: findMine,
      },
    });

    await journey.showGitHubPullRequests(
      buildProfile({email: 'ada.lovelace@webflow.com'})
    );

    // `.` in email local-part becomes `-` in the inferred handle.
    expect(findMine).toHaveBeenCalledWith('ada-lovelace');
  });

  it('asks for a username when review mode has no inferrable handle', async () => {
    const findReview = vi.fn().mockResolvedValue([]);
    const journey = buildJourneyService({
      github: {
        isConfigured: () => true,
        findPullRequestsAwaitingReview: findReview,
      },
    });

    const reply = await journey.showGitHubPullRequests(
      buildProfile({email: undefined}),
      {mode: 'review'}
    );

    expect(findReview).not.toHaveBeenCalled();
    expect(collectTextContent(reply.blocks)).toContain(
      "I couldn't detect your GitHub username"
    );
  });

  it('renders PR items when the search returns results', async () => {
    const findMine = vi.fn().mockResolvedValue([
      {
        number: 101,
        title: 'Docs update',
        url: 'https://github.com/webflow/webflow/pull/101',
        state: 'open',
        author: 'ada',
        repository: 'webflow/webflow',
        updatedAt: '2026-04-14T08:00:00Z',
        draft: false,
      },
    ]);
    const journey = buildJourneyService({
      github: {
        isConfigured: () => true,
        findOpenPullRequestsForUser: findMine,
      },
    });

    const reply = await journey.showGitHubPullRequests(buildProfile());

    const text = collectTextContent(reply.blocks);
    expect(text).toContain('#101 Docs update');
    expect(text).toContain('Your open pull requests');
  });
});
