import type {Logger} from '../app/logger.js';
import type {OnboardingPerson} from '../onboarding/types.js';
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
}

interface CacheEntry {
  value: PersonInsight;
  expiresAt: number;
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

    const [tickets, prs] = await Promise.all([
      this.fetchTickets(person),
      this.fetchPullRequests(person),
    ]);

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
    };

    this.cache.set(cacheKey, {
      value: insight,
      expiresAt: Date.now() + INSIGHT_CACHE_TTL_MS,
    });

    return insight;
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

  private async fetchTickets(person: OnboardingPerson): Promise<JiraIssue[]> {
    if (!this.jira?.isConfigured() || !person.email) {
      return [];
    }
    try {
      return await this.jira.findAssignedToEmail(person.email);
    } catch (error) {
      this.logger.warn(
        `Jira lookup failed for ${personCacheKey(person)}.`,
        error
      );
      return [];
    }
  }

  private async fetchPullRequests(
    person: OnboardingPerson
  ): Promise<GitHubPullRequest[]> {
    if (!this.github?.isConfigured()) {
      return [];
    }
    const handle = inferGithubUsername(person.email);
    if (!handle) {
      return [];
    }
    try {
      return await this.github.findOpenPullRequestsForUser(handle);
    } catch (error) {
      this.logger.warn(
        `GitHub lookup failed for ${personCacheKey(person)}.`,
        error
      );
      return [];
    }
  }
}

export function personCacheKey(person: OnboardingPerson): string {
  return (person.slackUserId || person.email || person.name).toLowerCase();
}
