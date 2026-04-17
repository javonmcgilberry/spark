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
   * Returns undefined on miss, misconfig, or network failure. Basic
   * auth uses the viewer's email (from CF Access) paired with
   * CONFLUENCE_API_TOKEN — no per-call email argument.
   */
  searchFirst(
    phrase: string,
    fallbackSummary: string,
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

export interface ConfluenceClientConfig {
  env: ConfluenceEnv;
  logger: Logger;
  /**
   * Returns the Atlassian account email that owns CONFLUENCE_API_TOKEN
   * for the current request. Populated from the Cloudflare Access JWT
   * via HandlerCtx.viewerEmail.
   */
  getAuthEmail: () => string | undefined;
  /**
   * Returns the viewer's Atlassian OAuth handle if they've connected.
   * When present, we hit https://api.atlassian.com/ex/confluence/{cloudId}/wiki/...
   * with a Bearer token; null means fall back to Basic auth.
   */
  getOAuthToken?: () => Promise<{
    accessToken: string;
    cloudId: string;
  } | null>;
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;

export function makeConfluenceClient(
  config: ConfluenceClientConfig
): ConfluenceClient {
  const {env, logger, getAuthEmail, getOAuthToken} = config;
  const envConfigured = Boolean(
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

  const resolveAuth = async (): Promise<
    | {mode: 'oauth'; searchBase: string; authorization: string}
    | {mode: 'basic'; searchBase: string; authorization: string}
    | null
  > => {
    const oauth = await getOAuthToken?.();
    if (oauth) {
      return {
        mode: 'oauth',
        searchBase: `https://api.atlassian.com/ex/confluence/${oauth.cloudId}/wiki/`,
        authorization: `Bearer ${oauth.accessToken}`,
      };
    }
    const authEmail = getAuthEmail();
    if (
      !envConfigured ||
      !authEmail ||
      !env.CONFLUENCE_BASE_URL ||
      !env.CONFLUENCE_API_TOKEN
    ) {
      return null;
    }
    return {
      mode: 'basic',
      searchBase: ensureTrailingSlash(env.CONFLUENCE_BASE_URL),
      authorization: `Basic ${base64Encode(`${authEmail}:${env.CONFLUENCE_API_TOKEN}`)}`,
    };
  };

  const searchPhrase = async (
    phrase: string,
    summary: string
  ): Promise<ConfluenceLink | undefined> => {
    const auth = await resolveAuth();
    if (!auth) return undefined;
    const url = new URL('rest/api/content/search', auth.searchBase);
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
          Authorization: auth.authorization,
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
    // OAuth path can authenticate without env — report true
    // optimistically when OAuth is wired. searchFirst still bails
    // cleanly via resolveAuth() when nothing resolves.
    isConfigured: () =>
      Boolean(getOAuthToken) || (envConfigured && Boolean(getAuthEmail())),
    baseUrl,
    urlForPageId(spaceKey, pageId) {
      const base = baseUrl();
      if (!base) return null;
      return `${base}spaces/${spaceKey}/pages/${pageId}`;
    },
    async searchFirst(phrase, summary, options = {}) {
      const exclude = options.excludeTitlePrefixes ?? [];
      // Cache key needs an identity dimension so OAuth results from one
      // viewer don't leak to a Basic-auth fallback for another. Prefer
      // the viewer email; falling back to a static marker for pure
      // OAuth-no-email case (rare, only if CF Access weren't present).
      const identity = getAuthEmail() ?? '__oauth__';
      const cacheKey = `${identity}|${phrase}`.toLowerCase();
      const cached = cache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        if (cached.value && !isExcluded(cached.value, exclude)) {
          return cached.value;
        }
        if (!cached.value) return undefined;
      }
      const match = await searchPhrase(phrase, summary);
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
