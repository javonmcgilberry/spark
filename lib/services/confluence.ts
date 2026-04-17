import type {Logger} from '../logger';
import type {ConfluenceLink} from '../types';

/**
 * Confluence client. Combines search + doc-page-id lookup in a single
 * narrow interface so HandlerCtx stays flat.
 */

export interface ConfluenceClient {
  isConfigured(): boolean;
  /**
   * Search Confluence for a phrase, returning the first matching page.
   * Returns undefined on miss, misconfig, or network failure.
   */
  searchFirst(
    phrase: string,
    fallbackSummary: string,
    authEmail: string,
    options?: {excludeTitlePrefixes?: string[]}
  ): Promise<ConfluenceLink | undefined>;
  /** Build a canonical URL for a known page id. */
  urlForPageId(spaceKey: string, pageId: string): string | null;
  /** Base URL (trailing slash), or null if unconfigured. */
  baseUrl(): string | null;
}

export interface ConfluenceEnv {
  CONFLUENCE_API_TOKEN?: string;
  CONFLUENCE_BASE_URL?: string;
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;

export function makeConfluenceClient(
  env: ConfluenceEnv,
  logger: Logger
): ConfluenceClient {
  const configured = Boolean(
    env.CONFLUENCE_API_TOKEN && env.CONFLUENCE_BASE_URL
  );
  const cache = new Map<
    string,
    {value: ConfluenceLink | undefined; expiresAt: number}
  >();

  const baseUrl = () =>
    env.CONFLUENCE_BASE_URL
      ? ensureTrailingSlash(env.CONFLUENCE_BASE_URL)
      : null;

  const searchPhrase = async (
    phrase: string,
    summary: string,
    authEmail: string
  ): Promise<ConfluenceLink | undefined> => {
    if (!configured || !env.CONFLUENCE_BASE_URL || !env.CONFLUENCE_API_TOKEN) {
      return undefined;
    }
    const url = new URL(
      'rest/api/content/search',
      ensureTrailingSlash(env.CONFLUENCE_BASE_URL)
    );
    url.searchParams.set(
      'cql',
      `type = page AND siteSearch ~ "\\\"${escapeCql(phrase)}\\\"" ORDER BY lastmodified DESC`
    );
    url.searchParams.set('limit', '1');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          Authorization: `Basic ${base64Encode(
            `${authEmail}:${env.CONFLUENCE_API_TOKEN}`
          )}`,
        },
        signal: controller.signal,
      });
      if (!res.ok) {
        logger.warn(
          `Confluence search failed for "${phrase}" (${res.status}).`
        );
        return undefined;
      }
      const body = (await res.json()) as {
        results?: Array<{
          title?: string;
          excerpt?: string;
          _links?: {base?: string; webui?: string};
          content?: {
            title?: string;
            _links?: {base?: string; webui?: string};
          };
        }>;
      };
      const first = body.results?.[0];
      if (!first) return undefined;
      const title = first.title ?? first.content?.title;
      const webui = first._links?.webui ?? first.content?._links?.webui;
      const linkBase =
        first._links?.base ??
        first.content?._links?.base ??
        env.CONFLUENCE_BASE_URL;
      if (!title || !webui || !linkBase) return undefined;
      return {
        title,
        url: new URL(webui, ensureTrailingSlash(linkBase)).toString(),
        summary: stripHtml(first.excerpt) || summary,
      };
    } catch (error) {
      logger.warn(
        `Confluence lookup failed for "${phrase}", continuing without enrichment.`,
        error
      );
      return undefined;
    } finally {
      clearTimeout(timeout);
    }
  };

  return {
    isConfigured: () => configured,
    baseUrl,
    urlForPageId(spaceKey, pageId) {
      const base = baseUrl();
      if (!base) return null;
      return `${base}spaces/${spaceKey}/pages/${pageId}`;
    },
    async searchFirst(phrase, summary, authEmail, options = {}) {
      const exclude = options.excludeTitlePrefixes ?? [];
      const cacheKey = `${authEmail}|${phrase}`.toLowerCase();
      const cached = cache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        if (cached.value && !isExcluded(cached.value, exclude)) {
          return cached.value;
        }
        if (!cached.value) return undefined;
      }
      const match = await searchPhrase(phrase, summary, authEmail);
      cache.set(cacheKey, {
        value: match,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
      if (match && !isExcluded(match, exclude)) return match;
      return undefined;
    },
  };
}

export interface ConfluenceStubOverrides {
  configured?: boolean;
  baseUrl?: string;
  results?: Record<string, ConfluenceLink>;
}

export function makeStubConfluence(
  overrides: ConfluenceStubOverrides = {}
): ConfluenceClient {
  return {
    isConfigured: () => overrides.configured ?? false,
    baseUrl: () =>
      overrides.baseUrl ? ensureTrailingSlash(overrides.baseUrl) : null,
    urlForPageId(spaceKey, pageId) {
      const base = overrides.baseUrl
        ? ensureTrailingSlash(overrides.baseUrl)
        : null;
      return base ? `${base}spaces/${spaceKey}/pages/${pageId}` : null;
    },
    async searchFirst(phrase) {
      return overrides.results?.[phrase.toLowerCase()];
    },
  };
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

function escapeCql(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function stripHtml(value?: string): string {
  return (value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isExcluded(link: ConfluenceLink, excludes: string[]): boolean {
  if (excludes.length === 0) return false;
  const normalized = link.title.toLowerCase();
  return excludes.some((prefix) => normalized.startsWith(prefix.toLowerCase()));
}

function base64Encode(value: string): string {
  if (typeof btoa !== 'undefined') return btoa(value);
  const g = globalThis as unknown as {
    Buffer?: {from: (v: string) => {toString: (enc: string) => string}};
  };
  if (g.Buffer) return g.Buffer.from(value).toString('base64');
  throw new Error('No base64 encoder available');
}
