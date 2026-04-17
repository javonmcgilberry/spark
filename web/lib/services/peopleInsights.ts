/**
 * peopleInsights — "Ask me about …" blurbs for each person in a draft.
 *
 * Pulls recent Jira tickets + GitHub PRs and feeds both to the LLM to
 * produce a warm, specific one-liner. Ported from spark/src/services/
 * peopleInsightsService.ts — fn-module shape instead of class so the
 * DI ctx is explicit.
 *
 * Cache is held on ctx.scratch so multiple tools in one agent turn
 * share the insights. Each Worker invocation starts with a fresh
 * cache; cross-invocation caching via KV can come later if needed.
 */

import type { HandlerCtx } from "../ctx";
import type { InsightAttempt, OnboardingPerson } from "../types";
import type { GitHubPullRequest } from "./github";
import { inferGithubUsername } from "./github";
import type { JiraIssue } from "./jira";
import { writePersonBlurb } from "./llmBlurbs";

const CACHE_TTL_MS = 10 * 60 * 1000;
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

interface FetchResult<T> {
  items: T[];
  attempt: InsightAttempt;
}

interface CacheEntry {
  value: PersonInsight;
  expiresAt: number;
}

function getCache(ctx: HandlerCtx): Map<string, CacheEntry> {
  const existing = ctx.scratch.peopleInsightsCache as
    | Map<string, CacheEntry>
    | undefined;
  if (existing) return existing;
  const created = new Map<string, CacheEntry>();
  ctx.scratch.peopleInsightsCache = created;
  return created;
}

export function personCacheKey(person: OnboardingPerson): string {
  return (person.slackUserId || person.email || person.name).toLowerCase();
}

export async function getInsight(
  ctx: HandlerCtx,
  person: OnboardingPerson,
  teamName: string,
): Promise<PersonInsight> {
  const cache = getCache(ctx);
  const key = personCacheKey(person);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const [tickets, prs] = await Promise.all([
    fetchTickets(ctx, person.email),
    fetchPullRequests(ctx, person.email),
  ]);
  return writeInsight(ctx, person, teamName, key, { tickets, prs });
}

export async function getInsightWithHints(
  ctx: HandlerCtx,
  person: OnboardingPerson,
  teamName: string,
  hints: InsightHints,
): Promise<PersonInsight> {
  const cache = getCache(ctx);
  const key = personCacheKey(person);
  const effectiveEmail = hints.email?.trim() || person.email;
  const overrideHandle = hints.githubUsername?.trim();

  const ticketsPromise = fetchTickets(ctx, effectiveEmail);
  const prsPromise = overrideHandle
    ? fetchPullRequestsForHandle(ctx, overrideHandle)
    : fetchPullRequests(ctx, effectiveEmail);
  const extraTicketPromise = hints.jiraTicketKey?.trim()
    ? fetchTicketByKey(ctx, hints.jiraTicketKey.trim())
    : Promise.resolve<JiraIssue | null>(null);

  const [tickets, prs, extraTicket] = await Promise.all([
    ticketsPromise,
    prsPromise,
    extraTicketPromise,
  ]);

  const mergedTickets: FetchResult<JiraIssue> = extraTicket
    ? { items: [extraTicket, ...tickets.items], attempt: tickets.attempt }
    : tickets;

  return writeInsight(ctx, person, teamName, key, {
    tickets: mergedTickets,
    prs,
  });
}

export function getCachedInsight(
  ctx: HandlerCtx,
  person: OnboardingPerson,
): PersonInsight | undefined {
  const cached = getCache(ctx).get(personCacheKey(person));
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  return undefined;
}

export async function getInsightsForPeople(
  ctx: HandlerCtx,
  people: OnboardingPerson[],
  teamName: string,
): Promise<Record<string, PersonInsight>> {
  const entries = await Promise.all(
    people.map(async (person) => {
      const insight = await getInsight(ctx, person, teamName);
      return [personCacheKey(person), insight] as const;
    }),
  );
  return Object.fromEntries(entries);
}

async function writeInsight(
  ctx: HandlerCtx,
  person: OnboardingPerson,
  teamName: string,
  cacheKey: string,
  results: {
    tickets: FetchResult<JiraIssue>;
    prs: FetchResult<GitHubPullRequest>;
  },
): Promise<PersonInsight> {
  const { tickets, prs } = results;
  const askMeAbout = await writePersonBlurb(ctx, {
    person,
    teamName,
    tickets: tickets.items,
    prs: prs.items,
  }).catch((error) => {
    ctx.logger.warn("Person insight blurb failed.", error);
    return null;
  });

  const insight: PersonInsight = {
    askMeAbout,
    recentTickets: tickets.items.slice(0, MAX_TICKETS_PER_PERSON),
    recentPRs: prs.items.slice(0, MAX_PRS_PER_PERSON),
    dataStarved: tickets.items.length === 0 && prs.items.length === 0,
    attempts: [tickets.attempt, prs.attempt],
  };

  getCache(ctx).set(cacheKey, {
    value: insight,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return insight;
}

async function fetchTickets(
  ctx: HandlerCtx,
  email: string | undefined,
): Promise<FetchResult<JiraIssue>> {
  if (!ctx.jira.isConfigured()) {
    return {
      items: [],
      attempt: { kind: "jira", input: "", count: 0, reason: "not_configured" },
    };
  }
  if (!email) {
    return {
      items: [],
      attempt: { kind: "jira", input: "", count: 0, reason: "no_email" },
    };
  }
  try {
    const items = await ctx.jira.findAssignedToEmail(email);
    return {
      items,
      attempt: { kind: "jira", input: email, count: items.length },
    };
  } catch (error) {
    ctx.logger.warn(`Jira lookup failed for ${email}.`, error);
    return {
      items: [],
      attempt: {
        kind: "jira",
        input: email,
        count: 0,
        reason: "lookup_failed",
      },
    };
  }
}

async function fetchTicketByKey(
  ctx: HandlerCtx,
  key: string,
): Promise<JiraIssue | null> {
  if (!ctx.jira.isConfigured()) return null;
  try {
    return await ctx.jira.findByKey(key);
  } catch (error) {
    ctx.logger.warn(`Jira getIssue failed for ${key}.`, error);
    return null;
  }
}

async function fetchPullRequests(
  ctx: HandlerCtx,
  email: string | undefined,
): Promise<FetchResult<GitHubPullRequest>> {
  if (!ctx.github.isConfigured()) {
    return {
      items: [],
      attempt: {
        kind: "github",
        input: "",
        count: 0,
        reason: "not_configured",
      },
    };
  }
  const handle = inferGithubUsername(email);
  if (!handle) {
    return {
      items: [],
      attempt: { kind: "github", input: "", count: 0, reason: "no_email" },
    };
  }
  return fetchPullRequestsForHandle(ctx, handle);
}

async function fetchPullRequestsForHandle(
  ctx: HandlerCtx,
  handle: string,
): Promise<FetchResult<GitHubPullRequest>> {
  if (!ctx.github.isConfigured()) {
    return {
      items: [],
      attempt: {
        kind: "github",
        input: handle,
        count: 0,
        reason: "not_configured",
      },
    };
  }
  try {
    const items = await ctx.github.findOpenPullRequestsForUser(handle);
    return {
      items,
      attempt: { kind: "github", input: handle, count: items.length },
    };
  } catch (error) {
    ctx.logger.warn(`GitHub lookup failed for ${handle}.`, error);
    return {
      items: [],
      attempt: {
        kind: "github",
        input: handle,
        count: 0,
        reason: "lookup_failed",
      },
    };
  }
}
