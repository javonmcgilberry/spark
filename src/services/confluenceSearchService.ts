import type {Logger} from '../app/logger.js';
import type {EnvConfig} from '../config/env.js';
import type {
  ConfluenceLink,
  OnboardingPerson,
  OnboardingReferences,
  TeamProfile,
} from '../onboarding/types.js';

const CONFLUENCE_CACHE_TTL_MS = 10 * 60 * 1000;
const CONFLUENCE_REQUEST_TIMEOUT_MS = 8000;

interface ConfluenceSearchResponse {
  results?: ConfluenceSearchResult[];
}

interface ConfluenceSearchResult {
  title?: string;
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
  phrases: string[];
  summary: string;
}

export class ConfluenceSearchService {
  private readonly cache = new Map<
    string,
    {value: ConfluenceLink | undefined; expiresAt: number}
  >();

  constructor(
    private readonly env: EnvConfig,
    private readonly logger: Logger
  ) {}

  async findOnboardingReferences(
    profile: TeamProfile
  ): Promise<OnboardingReferences> {
    if (!this.env.confluenceApiToken || !this.env.confluenceBaseUrl) {
      return {};
    }

    const email = profile.email;
    if (!email) {
      return {};
    }

    const [teamPage, pillarPage, newHireGuide] = await Promise.all([
      this.searchFirst(
        {
          phrases: [
            `${profile.teamName} team`,
            `${profile.teamName} onboarding`,
          ],
          summary: `Canonical team page for ${profile.teamName}.`,
        },
        email
      ),
      profile.pillarName
        ? this.searchFirst(
            {
              phrases: [
                `${profile.pillarName} engineering`,
                `${profile.pillarName} pillar`,
              ],
              summary: `Canonical pillar page for ${profile.pillarName}.`,
            },
            email
          )
        : Promise.resolve(undefined),
      this.searchFirst(
        {
          phrases: [`${profile.displayName} user guide`],
          summary: `User guide for ${profile.displayName}.`,
        },
        email
      ),
    ]);

    return {teamPage, pillarPage, newHireGuide};
  }

  async findPeopleGuides(
    profile: TeamProfile,
    people: OnboardingPerson[]
  ): Promise<Record<string, ConfluenceLink>> {
    if (!this.env.confluenceApiToken || !this.env.confluenceBaseUrl) {
      return {};
    }

    const email = profile.email;
    if (!email) {
      return {};
    }

    const relevantPeople = people
      .filter((person) => person.name && !person.name.startsWith('Your '))
      .slice(0, 8);

    const entries = await Promise.all(
      relevantPeople.map(async (person) => {
        const guide = await this.searchFirst(
          {
            phrases: [`${person.name} user guide`],
            summary: `User guide for ${person.name}.`,
          },
          email
        );

        return guide ? [personKey(person), guide] : undefined;
      })
    );

    return Object.fromEntries(
      entries.filter((entry): entry is [string, ConfluenceLink] =>
        Array.isArray(entry)
      )
    );
  }

  async findOnboardingPages(profile: TeamProfile): Promise<ConfluenceLink[]> {
    const references = await this.findOnboardingReferences(profile);
    return [
      references.teamPage,
      references.pillarPage,
      references.newHireGuide,
    ].filter((link): link is ConfluenceLink => Boolean(link));
  }

  private async searchFirst(
    query: ConfluenceQuery,
    email: string
  ): Promise<ConfluenceLink | undefined> {
    for (const phrase of query.phrases) {
      const cacheKey = `${email}|${phrase}`.toLowerCase();
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        if (cached.value) {
          return cached.value;
        }
        continue;
      }

      const match = await this.searchPhrase(phrase, query.summary, email);
      this.cache.set(cacheKey, {
        value: match,
        expiresAt: Date.now() + CONFLUENCE_CACHE_TTL_MS,
      });
      if (match) {
        return match;
      }
    }

    return undefined;
  }

  private async searchPhrase(
    phrase: string,
    summary: string,
    email: string
  ): Promise<ConfluenceLink | undefined> {
    const {confluenceApiToken, confluenceBaseUrl} = this.env;
    if (!confluenceApiToken || !confluenceBaseUrl) {
      return undefined;
    }

    const requestUrl = new URL(
      'rest/api/content/search',
      ensureTrailingSlash(confluenceBaseUrl)
    );
    requestUrl.searchParams.set(
      'cql',
      `type = page AND siteSearch ~ "\\\"${escapeCqlPhrase(phrase)}\\\"" ORDER BY lastmodified DESC`
    );
    requestUrl.searchParams.set('limit', '1');

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
          `Confluence search failed for "${phrase}" (${response.status}).`
        );
        return undefined;
      }

      const payload: ConfluenceSearchResponse = await response.json();
      const first = payload.results?.[0];
      return first
        ? (toConfluenceLink(first, summary, this.env) ?? undefined)
        : undefined;
    } catch (error) {
      this.logger.warn(
        `Confluence lookup failed for "${phrase}", continuing without enrichment.`,
        error
      );
      return undefined;
    } finally {
      clearTimeout(timeout);
    }
  }
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

function personKey(person: OnboardingPerson): string {
  return (person.slackUserId || person.email || person.name).toLowerCase();
}
