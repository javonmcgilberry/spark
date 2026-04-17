import type {Logger} from '../app/logger.js';
import type {InsightAttempt, OnboardingPerson} from '../onboarding/types.js';
import {
  inferGithubUsername,
  type GitHubPullRequest,
  type GitHubService,
} from './githubService.js';
import type {JiraIssue, JiraService} from './jiraService.js';
import type {LlmService} from './llmService.js';

const INSIGHT_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_TICKETS_PER_PERSON = 3;
const MAX_PRS_PER_PERSON = 3;

export interface PersonInsight {
  askMeAbout: string | null;
  recentTickets: JiraIssue[];
  recentPRs: GitHubPullRequest[];
  dataStarved: boolean;
  attempts: InsightAttempt[];
}

export interface InsightHints {
  email?: string;
  githubUsername?: string;
  jiraTicketKey?: string;
}

interface CacheEntry {
  value: PersonInsight;
  expiresAt: number;
}

interface FetchResult<T> {
  items: T[];
  attempt: InsightAttempt;
}

/**
 * Produces a short, conversational "Ask me about" blurb per person by
 * pulling their most recent Jira tickets and GitHub pull requests and
 * feeding both into the LLM.
 *
 * Results are cached for 10 minutes per person so opening the Home tab
 * multiple times does not refire external requests.
 */
export class PeopleInsightsService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly llm: LlmService,
    private readonly jira: JiraService | undefined,
    private readonly github: GitHubService | undefined,
    private readonly logger: Logger
  ) {}

  async getInsight(
    person: OnboardingPerson,
    teamName: string
  ): Promise<PersonInsight> {
    const cacheKey = personCacheKey(person);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const [ticketsResult, prsResult] = await Promise.all([
      this.fetchTickets(person.email),
      this.fetchPullRequests(person.email),
    ]);

    return this.writeInsight(person, teamName, cacheKey, {
      ticketsResult,
      prsResult,
    });
  }

  /**
   * Bypass-the-cache retry that applies manager-provided hints before
   * hitting Jira + GitHub. Writes the fresh result through to the
   * existing cache key so subsequent reads see the hinted blurb.
   */
  async getInsightWithHints(
    person: OnboardingPerson,
    teamName: string,
    hints: InsightHints
  ): Promise<PersonInsight> {
    const cacheKey = personCacheKey(person);
    const effectiveEmail = hints.email?.trim() || person.email;
    const overrideHandle = hints.githubUsername?.trim();

    const ticketsResultPromise = this.fetchTickets(effectiveEmail);
    const prsResultPromise = overrideHandle
      ? this.fetchPullRequestsForHandle(overrideHandle)
      : this.fetchPullRequests(effectiveEmail);
    const extraTicketPromise = hints.jiraTicketKey?.trim()
      ? this.fetchTicketByKey(hints.jiraTicketKey.trim())
      : Promise.resolve<JiraIssue | null>(null);

    const [ticketsResult, prsResult, extraTicket] = await Promise.all([
      ticketsResultPromise,
      prsResultPromise,
      extraTicketPromise,
    ]);

    const mergedTickets: FetchResult<JiraIssue> = extraTicket
      ? {
          items: [extraTicket, ...ticketsResult.items],
          attempt: ticketsResult.attempt,
        }
      : ticketsResult;

    return this.writeInsight(person, teamName, cacheKey, {
      ticketsResult: mergedTickets,
      prsResult,
    });
  }

  getCachedInsight(person: OnboardingPerson): PersonInsight | undefined {
    const cacheKey = personCacheKey(person);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
    return undefined;
  }

  async getInsightsForPeople(
    people: OnboardingPerson[],
    teamName: string
  ): Promise<Record<string, PersonInsight>> {
    const entries = await Promise.all(
      people.map(async (person) => {
        const insight = await this.getInsight(person, teamName);
        return [personCacheKey(person), insight] as const;
      })
    );
    return Object.fromEntries(entries);
  }

  private async writeInsight(
    person: OnboardingPerson,
    teamName: string,
    cacheKey: string,
    results: {
      ticketsResult: FetchResult<JiraIssue>;
      prsResult: FetchResult<GitHubPullRequest>;
    }
  ): Promise<PersonInsight> {
    const {ticketsResult, prsResult} = results;
    const tickets = ticketsResult.items;
    const prs = prsResult.items;
    const askMeAbout = await this.llm
      .writePersonBlurb({person, teamName, tickets, prs})
      .catch((error) => {
        this.logger.warn('Person insight blurb failed.', error);
        return null;
      });

    const insight: PersonInsight = {
      askMeAbout,
      recentTickets: tickets.slice(0, MAX_TICKETS_PER_PERSON),
      recentPRs: prs.slice(0, MAX_PRS_PER_PERSON),
      dataStarved: tickets.length === 0 && prs.length === 0,
      attempts: [ticketsResult.attempt, prsResult.attempt],
    };

    this.cache.set(cacheKey, {
      value: insight,
      expiresAt: Date.now() + INSIGHT_CACHE_TTL_MS,
    });

    return insight;
  }

  private async fetchTickets(
    email: string | undefined
  ): Promise<FetchResult<JiraIssue>> {
    if (!this.jira?.isConfigured()) {
      return {
        items: [],
        attempt: {kind: 'jira', input: '', count: 0, reason: 'not_configured'},
      };
    }
    if (!email) {
      return {
        items: [],
        attempt: {kind: 'jira', input: '', count: 0, reason: 'no_email'},
      };
    }
    try {
      const items = await this.jira.findAssignedToEmail(email);
      return {
        items,
        attempt: {kind: 'jira', input: email, count: items.length},
      };
    } catch (error) {
      this.logger.warn(`Jira lookup failed for ${email}.`, error);
      return {
        items: [],
        attempt: {
          kind: 'jira',
          input: email,
          count: 0,
          reason: 'lookup_failed',
        },
      };
    }
  }

  private async fetchTicketByKey(key: string): Promise<JiraIssue | null> {
    if (!this.jira?.isConfigured()) return null;
    try {
      return await this.jira.findByKey(key);
    } catch (error) {
      this.logger.warn(`Jira getIssue failed for ${key}.`, error);
      return null;
    }
  }

  private async fetchPullRequests(
    email: string | undefined
  ): Promise<FetchResult<GitHubPullRequest>> {
    if (!this.github?.isConfigured()) {
      return {
        items: [],
        attempt: {
          kind: 'github',
          input: '',
          count: 0,
          reason: 'not_configured',
        },
      };
    }
    const handle = inferGithubUsername(email);
    if (!handle) {
      return {
        items: [],
        attempt: {kind: 'github', input: '', count: 0, reason: 'no_email'},
      };
    }
    return this.fetchPullRequestsForHandle(handle);
  }

  private async fetchPullRequestsForHandle(
    handle: string
  ): Promise<FetchResult<GitHubPullRequest>> {
    if (!this.github?.isConfigured()) {
      return {
        items: [],
        attempt: {
          kind: 'github',
          input: handle,
          count: 0,
          reason: 'not_configured',
        },
      };
    }
    try {
      const items = await this.github.findOpenPullRequestsForUser(handle);
      return {
        items,
        attempt: {kind: 'github', input: handle, count: items.length},
      };
    } catch (error) {
      this.logger.warn(`GitHub lookup failed for ${handle}.`, error);
      return {
        items: [],
        attempt: {
          kind: 'github',
          input: handle,
          count: 0,
          reason: 'lookup_failed',
        },
      };
    }
  }
}

export function personCacheKey(person: OnboardingPerson): string {
  return (person.slackUserId || person.email || person.name).toLowerCase();
}
