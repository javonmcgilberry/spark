import type { Logger } from "../logger";

export interface JiraIssue {
  key: string;
  summary: string;
  status: string;
  url: string;
  priority?: string;
  assignee?: string;
  updated?: string;
}

export interface JiraClient {
  isConfigured(): boolean;
  findAssignedToEmail(email: string, limit?: number): Promise<JiraIssue[]>;
  findForTextQuery(query: string, limit?: number): Promise<JiraIssue[]>;
  findByKey(key: string): Promise<JiraIssue | null>;
}

export interface JiraEnv {
  JIRA_BASE_URL?: string;
  JIRA_API_EMAIL?: string;
  JIRA_API_TOKEN?: string;
}

const JIRA_REQUEST_TIMEOUT_MS = 8000;
const JIRA_CACHE_TTL_MS = 60 * 1000;

export function makeJiraClient(env: JiraEnv, logger: Logger): JiraClient {
  const configured = Boolean(
    env.JIRA_BASE_URL && env.JIRA_API_EMAIL && env.JIRA_API_TOKEN,
  );
  const cache = new Map<string, { value: JiraIssue[]; expiresAt: number }>();

  const runSearch = async (
    jql: string,
    limit: number,
  ): Promise<JiraIssue[]> => {
    if (
      !configured ||
      !env.JIRA_BASE_URL ||
      !env.JIRA_API_EMAIL ||
      !env.JIRA_API_TOKEN
    ) {
      return [];
    }

    const base = ensureTrailingSlash(env.JIRA_BASE_URL);
    const url = new URL("rest/api/3/search", base);
    url.searchParams.set("jql", jql);
    url.searchParams.set("maxResults", String(limit));
    url.searchParams.set("fields", "summary,status,priority,assignee,updated");

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      JIRA_REQUEST_TIMEOUT_MS,
    );

    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${base64Encode(
            `${env.JIRA_API_EMAIL}:${env.JIRA_API_TOKEN}`,
          )}`,
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        logger.warn(
          `Jira search failed with HTTP ${response.status} for jql "${jql}".`,
        );
        return [];
      }
      const payload = (await response.json()) as { issues?: unknown[] };
      return (payload.issues ?? [])
        .map((issue) => toJiraIssue(issue as RawIssue, base))
        .filter((issue): issue is JiraIssue => issue !== null);
    } catch (error) {
      logger.warn("Jira request failed.", error);
      return [];
    } finally {
      clearTimeout(timeout);
    }
  };

  const searchCached = async (
    cacheKey: string,
    jql: string,
    limit: number,
  ): Promise<JiraIssue[]> => {
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
    const issues = await runSearch(jql, limit);
    cache.set(cacheKey, {
      value: issues,
      expiresAt: Date.now() + JIRA_CACHE_TTL_MS,
    });
    return issues;
  };

  return {
    isConfigured: () => configured,
    async findAssignedToEmail(email, limit = 10) {
      if (!configured || !email) return [];
      const jql = `assignee = "${escapeJql(email)}" AND resolution = Unresolved ORDER BY updated DESC`;
      return searchCached(`assignee|${email}|${limit}`, jql, limit);
    },
    async findForTextQuery(query, limit = 8) {
      if (!configured || !query.trim()) return [];
      const jql = `text ~ "${escapeJql(query.trim())}" ORDER BY updated DESC`;
      return searchCached(`text|${query}|${limit}`, jql, limit);
    },
    async findByKey(key) {
      if (!configured) return null;
      const normalized = key.trim().toUpperCase();
      if (!/^[A-Z][A-Z0-9]+-\d+$/.test(normalized)) return null;
      const jql = `issuekey = ${normalized}`;
      const issues = await searchCached(`key|${normalized}`, jql, 1);
      return issues[0] ?? null;
    },
  };
}

export interface JiraStubOverrides {
  configured?: boolean;
  assignedToEmail?: Record<string, JiraIssue[]>;
  textQuery?: Record<string, JiraIssue[]>;
  byKey?: Record<string, JiraIssue>;
}

export function makeStubJira(overrides: JiraStubOverrides = {}): JiraClient {
  return {
    isConfigured: () => overrides.configured ?? false,
    async findAssignedToEmail(email) {
      return overrides.assignedToEmail?.[email] ?? [];
    },
    async findForTextQuery(query) {
      return overrides.textQuery?.[query] ?? [];
    },
    async findByKey(key) {
      return overrides.byKey?.[key.toUpperCase()] ?? null;
    },
  };
}

interface RawIssue {
  key?: string;
  fields?: {
    summary?: string;
    status?: { name?: string };
    priority?: { name?: string };
    assignee?: { displayName?: string };
    updated?: string;
  };
}

function toJiraIssue(raw: RawIssue, baseUrl: string): JiraIssue | null {
  if (!raw.key || !raw.fields?.summary) return null;
  return {
    key: raw.key,
    summary: raw.fields.summary,
    status: raw.fields.status?.name ?? "Unknown",
    url: `${baseUrl}browse/${raw.key}`,
    priority: raw.fields.priority?.name,
    assignee: raw.fields.assignee?.displayName,
    updated: raw.fields.updated,
  };
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function escapeJql(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

/**
 * Workers-friendly Base64 encoder. `btoa` is globally available on Workers
 * and in modern Node (>=20) runtimes.
 */
function base64Encode(value: string): string {
  if (typeof btoa !== "undefined") return btoa(value);
  // Fallback for environments without btoa (rare on Next + Workers).
  const g = globalThis as unknown as {
    Buffer?: { from: (v: string) => { toString: (enc: string) => string } };
  };
  if (g.Buffer) return g.Buffer.from(value).toString("base64");
  throw new Error("No base64 encoder available");
}
