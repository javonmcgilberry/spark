import type { Logger } from "../logger";

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

export interface GitHubClient {
  isConfigured(): boolean;
  findOpenPullRequestsForUser(
    githubUsername: string,
    limit?: number,
  ): Promise<GitHubPullRequest[]>;
  findPullRequestsAwaitingReview(
    githubUsername: string,
    limit?: number,
  ): Promise<GitHubPullRequest[]>;
  findRecentPullRequestsForTeam(
    teamSlug: string,
    limit?: number,
  ): Promise<GitHubPullRequest[]>;
  fetchCodeowners(): Promise<string | null>;
}

export interface GitHubEnv {
  GITHUB_TOKEN?: string;
  /** Optional org override; defaults to 'webflow'. */
  GITHUB_ORG?: string;
  /** Optional monorepo override for CODEOWNERS fetch. Defaults to 'webflow/webflow'. */
  GITHUB_CODEOWNERS_REPO?: string;
}

const GITHUB_CACHE_TTL_MS = 60 * 1000;
const GITHUB_REQUEST_TIMEOUT_MS = 8000;
const REPO_API_PREFIX = "https://api.github.com/repos/";

/**
 * Best-guess mapping from a Webflow email to a GitHub handle. The local
 * part of the email becomes the handle, with dots turned into dashes.
 */
export function inferGithubUsername(
  email: string | undefined,
): string | undefined {
  if (!email) return undefined;
  const local = email.split("@")[0];
  return local ? local.replace(/\./g, "-").toLowerCase() : undefined;
}

export function makeGitHubClient(env: GitHubEnv, logger: Logger): GitHubClient {
  const configured = Boolean(env.GITHUB_TOKEN);
  const org = env.GITHUB_ORG ?? "webflow";
  const codeownersRepo = env.GITHUB_CODEOWNERS_REPO ?? "webflow/webflow";
  const cache = new Map<
    string,
    { value: GitHubPullRequest[]; expiresAt: number }
  >();

  const searchIssues = async (
    query: string,
    limit: number,
  ): Promise<GitHubPullRequest[]> => {
    if (!configured) return [];
    const url = new URL("https://api.github.com/search/issues");
    url.searchParams.set("q", query);
    url.searchParams.set("per_page", String(limit));
    url.searchParams.set("sort", "updated");
    url.searchParams.set("order", "desc");
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      GITHUB_REQUEST_TIMEOUT_MS,
    );
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        signal: controller.signal,
      });
      if (!res.ok) {
        logger.warn(
          `GitHub search failed with HTTP ${res.status} for query "${query}".`,
        );
        return [];
      }
      const body = (await res.json()) as { items?: unknown[] };
      return (body.items ?? []).map((raw) => toPr(raw as RawIssue));
    } catch (error) {
      logger.warn(`GitHub search failed for query "${query}".`, error);
      return [];
    } finally {
      clearTimeout(timeout);
    }
  };

  const searchCached = async (
    cacheKey: string,
    query: string,
    limit: number,
  ): Promise<GitHubPullRequest[]> => {
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const issues = await searchIssues(query, limit);
    cache.set(cacheKey, {
      value: issues,
      expiresAt: Date.now() + GITHUB_CACHE_TTL_MS,
    });
    return issues;
  };

  return {
    isConfigured: () => configured,
    async findOpenPullRequestsForUser(username, limit = 10) {
      if (!configured || !username) return [];
      const query = `is:pr is:open author:${username} org:${org}`;
      return searchCached(`author|${username}|${limit}`, query, limit);
    },
    async findPullRequestsAwaitingReview(username, limit = 10) {
      if (!configured || !username) return [];
      const query = `is:pr is:open review-requested:${username} org:${org}`;
      return searchCached(`review|${username}|${limit}`, query, limit);
    },
    async findRecentPullRequestsForTeam(teamSlug, limit = 10) {
      if (!configured || !teamSlug) return [];
      const query = `is:pr is:open team-review-requested:${org}/${teamSlug} org:${org}`;
      return searchCached(`team|${teamSlug}|${limit}`, query, limit);
    },
    async fetchCodeowners() {
      if (!configured) return null;
      const url = `https://api.github.com/repos/${codeownersRepo}/contents/.github/CODEOWNERS`;
      try {
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${env.GITHUB_TOKEN}`,
            Accept: "application/vnd.github.raw",
          },
        });
        if (!res.ok) {
          logger.warn(
            `CODEOWNERS fetch failed with HTTP ${res.status} for ${codeownersRepo}`,
          );
          return null;
        }
        return await res.text();
      } catch (error) {
        logger.warn("CODEOWNERS fetch failed.", error);
        return null;
      }
    },
  };
}

export interface GitHubStubOverrides {
  configured?: boolean;
  openForUser?: Record<string, GitHubPullRequest[]>;
  awaitingReview?: Record<string, GitHubPullRequest[]>;
  forTeam?: Record<string, GitHubPullRequest[]>;
  codeowners?: string | null;
}

export function makeStubGitHub(
  overrides: GitHubStubOverrides = {},
): GitHubClient {
  return {
    isConfigured: () => overrides.configured ?? false,
    async findOpenPullRequestsForUser(username) {
      return overrides.openForUser?.[username] ?? [];
    },
    async findPullRequestsAwaitingReview(username) {
      return overrides.awaitingReview?.[username] ?? [];
    },
    async findRecentPullRequestsForTeam(team) {
      return overrides.forTeam?.[team] ?? [];
    },
    async fetchCodeowners() {
      return overrides.codeowners ?? null;
    },
  };
}

interface RawIssue {
  number?: number;
  title?: string;
  html_url?: string;
  state?: string;
  user?: { login?: string };
  repository_url?: string;
  updated_at?: string;
  draft?: boolean;
}

function toPr(raw: RawIssue): GitHubPullRequest {
  return {
    number: raw.number ?? 0,
    title: raw.title ?? "",
    url: raw.html_url ?? "",
    state: raw.state ?? "open",
    author: raw.user?.login ?? "unknown",
    repository: extractRepo(raw.repository_url ?? ""),
    updatedAt: raw.updated_at ?? "",
    draft: Boolean(raw.draft),
  };
}

function extractRepo(url: string): string {
  return url.startsWith(REPO_API_PREFIX)
    ? url.slice(REPO_API_PREFIX.length)
    : url;
}
