import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {GitHubService} from '../../src/services/githubService.js';
import type {JiraService} from '../../src/services/jiraService.js';
import type {LlmService} from '../../src/services/llmService.js';
import {PeopleInsightsService} from '../../src/services/peopleInsightsService.js';
import type {OnboardingPerson} from '../../src/onboarding/types.js';
import {
  createTestLogger,
  type TestLogger,
} from '../helpers/createTestLogger.js';

function buildPerson(
  overrides: Partial<OnboardingPerson> = {}
): OnboardingPerson {
  return {
    name: 'Grace Hopper',
    role: 'Engineering Manager',
    discussionPoints: 'First-month priorities',
    kind: 'manager',
    weekBucket: 'week1-2',
    email: 'grace.hopper@webflow.com',
    ...overrides,
  };
}

interface Harness {
  service: PeopleInsightsService;
  logger: TestLogger;
  jira: {
    isConfigured: ReturnType<typeof vi.fn>;
    findAssignedToEmail: ReturnType<typeof vi.fn>;
  };
  github: {
    isConfigured: ReturnType<typeof vi.fn>;
    findOpenPullRequestsForUser: ReturnType<typeof vi.fn>;
  };
  llm: {writePersonBlurb: ReturnType<typeof vi.fn>};
}

function buildHarness(
  overrides: {
    jiraConfigured?: boolean;
    githubConfigured?: boolean;
    llmResponse?: string | null;
  } = {}
): Harness {
  const logger = createTestLogger();
  const jira = {
    isConfigured: vi.fn().mockReturnValue(overrides.jiraConfigured ?? true),
    findAssignedToEmail: vi.fn().mockResolvedValue([]),
  };
  const github = {
    isConfigured: vi.fn().mockReturnValue(overrides.githubConfigured ?? true),
    findOpenPullRequestsForUser: vi.fn().mockResolvedValue([]),
  };
  const defaultBlurb = 'Ask me about shipping onboarding.';
  const blurb =
    'llmResponse' in overrides ? overrides.llmResponse : defaultBlurb;
  const llm = {
    writePersonBlurb: vi.fn().mockResolvedValue(blurb),
  };

  const service = new PeopleInsightsService(
    llm as unknown as LlmService,
    jira as unknown as JiraService,
    github as unknown as GitHubService,
    logger
  );

  return {service, logger, jira, github, llm};
}

describe('PeopleInsightsService', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('returns a blurb grounded in Jira and GitHub results', async () => {
    const {service, jira, github, llm} = buildHarness();
    jira.findAssignedToEmail.mockResolvedValueOnce([
      {
        key: 'ABC-1',
        summary: 'Fix login bug',
        status: 'In Progress',
        url: 'https://jira/ABC-1',
      },
    ]);
    github.findOpenPullRequestsForUser.mockResolvedValueOnce([
      {
        number: 101,
        title: 'Docs update',
        url: 'https://github/101',
        state: 'open',
        author: 'grace-hopper',
        repository: 'webflow/webflow',
        updatedAt: '2026-04-14T00:00:00Z',
        draft: false,
      },
    ]);

    const insight = await service.getInsight(
      buildPerson(),
      'Frontend Engineering'
    );

    expect(insight.askMeAbout).toBe('Ask me about shipping onboarding.');
    expect(insight.recentTickets).toHaveLength(1);
    expect(insight.recentPRs).toHaveLength(1);
    expect(llm.writePersonBlurb).toHaveBeenCalledWith(
      expect.objectContaining({
        teamName: 'Frontend Engineering',
        tickets: expect.any(Array),
        prs: expect.any(Array),
      })
    );
    expect(github.findOpenPullRequestsForUser).toHaveBeenCalledWith(
      'grace-hopper'
    );
  });

  it('skips Jira and GitHub calls when neither is configured', async () => {
    const {service, jira, github} = buildHarness({
      jiraConfigured: false,
      githubConfigured: false,
    });

    const insight = await service.getInsight(
      buildPerson(),
      'Frontend Engineering'
    );

    expect(jira.findAssignedToEmail).not.toHaveBeenCalled();
    expect(github.findOpenPullRequestsForUser).not.toHaveBeenCalled();
    expect(insight.recentTickets).toEqual([]);
    expect(insight.recentPRs).toEqual([]);
  });

  it('caches results per person within the TTL', async () => {
    const {service, jira, github, llm} = buildHarness();

    const person = buildPerson();
    await service.getInsight(person, 'Frontend');
    await service.getInsight(person, 'Frontend');

    expect(jira.findAssignedToEmail).toHaveBeenCalledTimes(1);
    expect(github.findOpenPullRequestsForUser).toHaveBeenCalledTimes(1);
    expect(llm.writePersonBlurb).toHaveBeenCalledTimes(1);
  });

  it('returns null askMeAbout when the LLM is unconfigured', async () => {
    const {service} = buildHarness({llmResponse: null});

    const insight = await service.getInsight(
      buildPerson(),
      'Frontend Engineering'
    );

    expect(insight.askMeAbout).toBeNull();
  });

  it('logs and recovers when Jira throws', async () => {
    const {service, jira, logger} = buildHarness();
    jira.findAssignedToEmail.mockRejectedValueOnce(new Error('jira down'));

    const insight = await service.getInsight(
      buildPerson(),
      'Frontend Engineering'
    );

    expect(insight.recentTickets).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Jira lookup failed'),
      expect.any(Error)
    );
  });
});
