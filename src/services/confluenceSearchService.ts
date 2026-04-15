import type {Logger} from '../app/logger.js';
import type {EnvConfig} from '../config/env.js';
import type {ConfluenceLink, TeamProfile} from '../onboarding/types.js';

const CONFLUENCE_CACHE_TTL_MS = 10 * 60 * 1000;
const CONFLUENCE_REQUEST_TIMEOUT_MS = 8000;
const MAX_RESULTS = 6;

interface ConfluenceSearchResponse {
  results?: ConfluenceSearchResult[];
}

interface ConfluenceSearchResult {
  title?: string;
  url?: string;
  excerpt?: string;
  _links?: {
    base?: string;
    webui?: string;
  };
  content?: {
    title?: string;
    _links?: {
      base?: string;
      webui?: string;
    };
  };
}

interface ConfluenceQuery {
  phrase: string;
  summary: string;
}

export class ConfluenceSearchService {
  private readonly cache = new Map<
    string,
    {links: ConfluenceLink[]; expiresAt: number}
  >();

  constructor(
    private readonly env: EnvConfig,
    private readonly logger: Logger
  ) {}

  async findOnboardingPages(profile: TeamProfile): Promise<ConfluenceLink[]> {
    if (
      !this.env.confluenceApiToken ||
      !this.env.confluenceBaseUrl ||
      !profile.email
    ) {
      return [];
    }
    const email = profile.email;

    const cacheKey = [
      profile.teamName,
      profile.pillarName ?? '',
      profile.displayName,
    ]
      .join('|')
      .toLowerCase();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.links;
    }

    const links: ConfluenceLink[] = [];
    const seenUrls = new Set<string>();
    const queryMatches = await Promise.all(
      buildQueries(profile).map((query) => this.search(query, email))
    );

    for (const matches of queryMatches) {
      for (const match of matches) {
        if (seenUrls.has(match.url)) {
          continue;
        }
        seenUrls.add(match.url);
        links.push(match);
        if (links.length >= MAX_RESULTS) {
          break;
        }
      }
      if (links.length >= MAX_RESULTS) {
        break;
      }
    }

    this.cache.set(cacheKey, {
      links,
      expiresAt: Date.now() + CONFLUENCE_CACHE_TTL_MS,
    });

    return links;
  }

  private async search(
    query: ConfluenceQuery,
    email: string
  ): Promise<ConfluenceLink[]> {
    const {confluenceApiToken, confluenceBaseUrl} = this.env;
    if (!confluenceApiToken || !confluenceBaseUrl) {
      return [];
    }

    const requestUrl = new URL(
      'rest/api/content/search',
      ensureTrailingSlash(confluenceBaseUrl)
    );
    requestUrl.searchParams.set(
      'cql',
      `type = page AND siteSearch ~ "\\\"${escapeCqlPhrase(query.phrase)}\\\"" ORDER BY lastmodified DESC`
    );
    requestUrl.searchParams.set('limit', '3');

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      CONFLUENCE_REQUEST_TIMEOUT_MS
    );

    try {
      const response = await fetch(requestUrl, {
        headers: {
          Accept: 'application/json',
          Authorization: `Basic ${Buffer.from(
            `${email}:${confluenceApiToken}`
          ).toString('base64')}`,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.warn(
          `Confluence search failed for "${query.phrase}" (${response.status}).`
        );
        return [];
      }

      const payload: ConfluenceSearchResponse = await response.json();
      return (payload.results ?? [])
        .map((result) => toConfluenceLink(result, query.summary, this.env))
        .filter((link): link is ConfluenceLink => Boolean(link));
    } catch (error) {
      this.logger.warn(
        `Confluence lookup failed for "${query.phrase}", continuing without enrichment.`,
        error
      );
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }
}

function buildQueries(profile: TeamProfile): ConfluenceQuery[] {
  return [
    {
      phrase: `${profile.teamName} onboarding`,
      summary: `Potential onboarding page for ${profile.teamName}.`,
    },
    {
      phrase: `${profile.teamName} team`,
      summary: `Potential team overview for ${profile.teamName}.`,
    },
    ...(profile.pillarName
      ? [
          {
            phrase: `${profile.pillarName} engineering`,
            summary: `Potential pillar context for ${profile.pillarName}.`,
          },
        ]
      : []),
    {
      phrase: `${profile.displayName} user guide`,
      summary: `Potential personal user guide related to ${profile.displayName}.`,
    },
    {
      phrase: `${profile.displayName} onboarding`,
      summary: `Potential personal onboarding notes related to ${profile.displayName}.`,
    },
  ];
}

function toConfluenceLink(
  result: ConfluenceSearchResult,
  fallbackSummary: string,
  env: EnvConfig
): ConfluenceLink | null {
  const title = result.title ?? result.content?.title;
  const webUiPath = result._links?.webui ?? result.content?._links?.webui;
  if (!title || !webUiPath) {
    return null;
  }

  const baseUrl =
    result._links?.base ??
    result.content?._links?.base ??
    env.confluenceBaseUrl;
  if (!baseUrl) {
    return null;
  }

  return {
    title,
    url: new URL(webUiPath, ensureTrailingSlash(baseUrl)).toString(),
    summary: stripHtml(result.excerpt) || fallbackSummary,
  };
}

function escapeCqlPhrase(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

function stripHtml(value?: string): string {
  return (value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
