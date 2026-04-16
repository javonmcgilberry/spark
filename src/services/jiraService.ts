import type {Logger} from '../app/logger.js';
import type {EnvConfig} from '../config/env.js';

const JIRA_REQUEST_TIMEOUT_MS = 8000;
const JIRA_CACHE_TTL_MS = 60 * 1000;

export interface JiraIssue {
  key: string;
  summary: string;
  status: string;
  url: string;
  priority?: string;
  assignee?: string;
  updated?: string;
}

interface JiraSearchResponse {
  issues?: RawIssue[];
}

interface RawIssue {
  key?: string;
  fields?: {
    summary?: string;
    status?: {name?: string};
    priority?: {name?: string};
    assignee?: {displayName?: string};
    updated?: string;
  };
}

/**
 * Thin Jira REST client used by the onboarding agent to surface the user's
 * own tickets or team sprint work. Uses Atlassian basic auth with an email
 * and API token (see https://id.atlassian.com/manage-profile/security/api-tokens).
 */
export class JiraService {
  private readonly cache = new Map<
    string,
    {value: JiraIssue[]; expiresAt: number}
  >();

  constructor(
    private readonly env: EnvConfig,
    private readonly logger: Logger
  ) {}

  isConfigured(): boolean {
    return Boolean(
      this.env.jiraBaseUrl && this.env.jiraApiEmail && this.env.jiraApiToken
    );
  }

  async findAssignedToEmail(email: string, limit = 10): Promise<JiraIssue[]> {
    if (!this.isConfigured() || !email) {
      return [];
    }

    const jql = `assignee = "${escapeJql(email)}" AND resolution = Unresolved ORDER BY updated DESC`;
    return this.searchCached(`assignee|${email}|${limit}`, jql, limit);
  }

  async findForTextQuery(query: string, limit = 8): Promise<JiraIssue[]> {
    if (!this.isConfigured() || !query.trim()) {
      return [];
    }

    const jql = `text ~ "${escapeJql(query.trim())}" ORDER BY updated DESC`;
    return this.searchCached(`text|${query}|${limit}`, jql, limit);
  }

  async findByKey(key: string): Promise<JiraIssue | null> {
    if (!this.isConfigured()) {
      return null;
    }
    const normalized = key.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9]+-\d+$/.test(normalized)) {
      return null;
    }

    const jql = `issuekey = ${normalized}`;
    const issues = await this.searchCached(`key|${normalized}`, jql, 1);
    return issues[0] ?? null;
  }

  private async searchCached(
    cacheKey: string,
    jql: string,
    limit: number
  ): Promise<JiraIssue[]> {
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const issues = await this.runSearch(jql, limit);
    this.cache.set(cacheKey, {
      value: issues,
      expiresAt: Date.now() + JIRA_CACHE_TTL_MS,
    });
    return issues;
  }

  private async runSearch(jql: string, limit: number): Promise<JiraIssue[]> {
    if (
      !this.env.jiraBaseUrl ||
      !this.env.jiraApiEmail ||
      !this.env.jiraApiToken
    ) {
      return [];
    }

    const url = new URL(
      'rest/api/3/search',
      ensureTrailingSlash(this.env.jiraBaseUrl)
    );
    url.searchParams.set('jql', jql);
    url.searchParams.set('maxResults', String(limit));
    url.searchParams.set('fields', 'summary,status,priority,assignee,updated');

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      JIRA_REQUEST_TIMEOUT_MS
    );

    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          Authorization: `Basic ${Buffer.from(
            `${this.env.jiraApiEmail}:${this.env.jiraApiToken}`
          ).toString('base64')}`,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.warn(
          `Jira search failed with HTTP ${response.status} for jql "${jql}".`
        );
        return [];
      }

      const payload = (await response.json()) as JiraSearchResponse;
      const baseUrl = ensureTrailingSlash(this.env.jiraBaseUrl);
      return (payload.issues ?? [])
        .map((issue) => toJiraIssue(issue, baseUrl))
        .filter((issue): issue is JiraIssue => issue !== null);
    } catch (error) {
      this.logger.warn('Jira request failed.', error);
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }
}

function toJiraIssue(raw: RawIssue, baseUrl: string): JiraIssue | null {
  if (!raw.key || !raw.fields?.summary) {
    return null;
  }

  return {
    key: raw.key,
    summary: raw.fields.summary,
    status: raw.fields.status?.name ?? 'Unknown',
    url: `${baseUrl}browse/${raw.key}`,
    priority: raw.fields.priority?.name,
    assignee: raw.fields.assignee?.displayName,
    updated: raw.fields.updated,
  };
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

function escapeJql(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}
