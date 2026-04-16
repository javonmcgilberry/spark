import {Octokit} from '@octokit/rest';
import type {Logger} from '../app/logger.js';
import type {EnvConfig} from '../config/env.js';

const GITHUB_CACHE_TTL_MS = 60 * 1000;
const GITHUB_REQUEST_TIMEOUT_MS = 8000;
const DEFAULT_ORG = 'webflow';
const REPO_API_PREFIX = 'https://api.github.com/repos/';

export interface GitHubPullRequest {
  number: number;
  title: string;
  url: string;
  state: string;
  author: string;
  repository: string;
  updatedAt: string;
  draft: boolean;
}

interface SearchCacheEntry {
  value: GitHubPullRequest[];
  expiresAt: number;
}

/**
 * Best-guess mapping from a Webflow email to a GitHub handle. The local
 * part of the email becomes the handle, with dots turned into dashes.
 */
export function inferGithubUsername(
  email: string | undefined
): string | undefined {
  if (!email) {
    return undefined;
  }
  const local = email.split('@')[0];
  return local ? local.replace(/\./g, '-').toLowerCase() : undefined;
}

/**
 * Lightweight GitHub client used by the onboarding agent to surface PRs
 * authored by, assigned to, or requested-for-review from the user, plus
 * recent activity for a team.
 *
 * Uses the `GITHUB_TOKEN` env var. If no token is configured, all lookups
 * return an empty list so the agent can gracefully fall back.
 */
export class GitHubService {
  private readonly client: Octokit | null;
  private readonly cache = new Map<string, SearchCacheEntry>();

  constructor(
    private readonly env: EnvConfig,
    private readonly logger: Logger
  ) {
    this.client = env.githubToken
      ? new Octokit({
          auth: env.githubToken,
          request: {timeout: GITHUB_REQUEST_TIMEOUT_MS},
        })
      : null;
  }

  isConfigured(): boolean {
    return Boolean(this.client);
  }

  async findOpenPullRequestsForUser(
    githubUsername: string,
    limit = 10
  ): Promise<GitHubPullRequest[]> {
    if (!this.client || !githubUsername) {
      return [];
    }

    const query = `is:pr is:open author:${githubUsername} org:${DEFAULT_ORG}`;
    return this.searchCached(`author|${githubUsername}|${limit}`, query, limit);
  }

  async findPullRequestsAwaitingReview(
    githubUsername: string,
    limit = 10
  ): Promise<GitHubPullRequest[]> {
    if (!this.client || !githubUsername) {
      return [];
    }

    const query = `is:pr is:open review-requested:${githubUsername} org:${DEFAULT_ORG}`;
    return this.searchCached(`review|${githubUsername}|${limit}`, query, limit);
  }

  async findRecentPullRequestsForTeam(
    teamSlug: string,
    limit = 10
  ): Promise<GitHubPullRequest[]> {
    if (!this.client || !teamSlug) {
      return [];
    }

    const query = `is:pr is:open team-review-requested:${DEFAULT_ORG}/${teamSlug} org:${DEFAULT_ORG}`;
    return this.searchCached(`team|${teamSlug}|${limit}`, query, limit);
  }

  private async searchCached(
    cacheKey: string,
    query: string,
    limit: number
  ): Promise<GitHubPullRequest[]> {
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    if (!this.client) {
      return [];
    }

    try {
      const response = await this.client.search.issuesAndPullRequests({
        q: query,
        per_page: limit,
        sort: 'updated',
        order: 'desc',
      });

      const prs: GitHubPullRequest[] = response.data.items.map((item) => ({
        number: item.number,
        title: item.title,
        url: item.html_url,
        state: item.state,
        author: item.user?.login ?? 'unknown',
        repository: extractRepo(item.repository_url),
        updatedAt: item.updated_at,
        draft: Boolean(item.draft),
      }));

      this.cache.set(cacheKey, {
        value: prs,
        expiresAt: Date.now() + GITHUB_CACHE_TTL_MS,
      });
      return prs;
    } catch (error) {
      this.logger.warn(`GitHub search failed for query "${query}".`, error);
      return [];
    }
  }
}

function extractRepo(url: string): string {
  return url.startsWith(REPO_API_PREFIX)
    ? url.slice(REPO_API_PREFIX.length)
    : url;
}
