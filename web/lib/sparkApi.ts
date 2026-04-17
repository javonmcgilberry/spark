import type {
  CreateDraftBody,
  DraftFieldPatch,
  OnboardingPackage,
  TeamProfile,
  ContributionTask,
  OnboardingPerson,
  ConfluenceLink,
} from './types';

// Typed fetch wrapper for the Spark bot's /api/* surface. Every request
// carries the bearer token and the acting manager's Slack id.
export interface SparkApiEnv {
  SPARK_API_BASE_URL: string;
  SPARK_API_TOKEN: string;
}

export interface SparkApiContext {
  env: SparkApiEnv;
  managerSlackId: string;
  signal?: AbortSignal;
}

async function sparkFetch(
  ctx: SparkApiContext,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const url = `${ctx.env.SPARK_API_BASE_URL.replace(/\/$/, '')}${path}`;
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${ctx.env.SPARK_API_TOKEN}`);
  headers.set('X-Spark-Manager-Slack-Id', ctx.managerSlackId);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(url, {...init, headers, signal: ctx.signal});
  return res;
}

async function sparkJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message: string;
    try {
      const body = (await res.json()) as {error?: string};
      message = body.error ?? res.statusText;
    } catch {
      message = res.statusText;
    }
    throw new SparkApiError(res.status, message);
  }
  return (await res.json()) as T;
}

export class SparkApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'SparkApiError';
  }
}

export async function getMe(ctx: SparkApiContext): Promise<TeamProfile> {
  const res = await sparkFetch(ctx, '/api/me');
  const body = await sparkJson<{profile: TeamProfile}>(res);
  return body.profile;
}

export async function listDrafts(ctx: SparkApiContext): Promise<{
  drafts: OnboardingPackage[];
  publishedPackages: OnboardingPackage[];
}> {
  const res = await sparkFetch(ctx, '/api/drafts');
  return sparkJson(res);
}

export async function getDraft(
  ctx: SparkApiContext,
  userId: string
): Promise<OnboardingPackage> {
  const res = await sparkFetch(
    ctx,
    `/api/drafts/${encodeURIComponent(userId)}`
  );
  const body = await sparkJson<{pkg: OnboardingPackage}>(res);
  return body.pkg;
}

export async function createDraft(
  ctx: SparkApiContext,
  body: CreateDraftBody
): Promise<OnboardingPackage> {
  const res = await sparkFetch(ctx, '/api/drafts', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const parsed = await sparkJson<{pkg: OnboardingPackage}>(res);
  return parsed.pkg;
}

export async function patchDraft(
  ctx: SparkApiContext,
  userId: string,
  patch: DraftFieldPatch
): Promise<OnboardingPackage> {
  const res = await sparkFetch(
    ctx,
    `/api/drafts/${encodeURIComponent(userId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }
  );
  const body = await sparkJson<{pkg: OnboardingPackage}>(res);
  return body.pkg;
}

export async function refreshInsights(
  ctx: SparkApiContext,
  userId: string
): Promise<OnboardingPackage> {
  const res = await sparkFetch(
    ctx,
    `/api/drafts/${encodeURIComponent(userId)}/refresh-insights`,
    {method: 'POST'}
  );
  const body = await sparkJson<{pkg: OnboardingPackage}>(res);
  return body.pkg;
}

export async function publishDraft(
  ctx: SparkApiContext,
  userId: string
): Promise<OnboardingPackage> {
  const res = await sparkFetch(
    ctx,
    `/api/drafts/${encodeURIComponent(userId)}/publish`,
    {method: 'POST'}
  );
  const body = await sparkJson<{pkg: OnboardingPackage}>(res);
  return body.pkg;
}

export async function hydrateSlackWorkspace(
  ctx: SparkApiContext,
  userId: string
): Promise<{pkg: OnboardingPackage; alreadyHydrated: boolean}> {
  const res = await sparkFetch(
    ctx,
    `/api/drafts/${encodeURIComponent(userId)}/hydrate-slack`,
    {method: 'POST'}
  );
  return sparkJson(res);
}

export interface TeamLookupResult {
  teamName: string;
  pillarName?: string;
  githubTeamSlug?: string;
  roleTrack: string;
  manager: OnboardingPerson;
  buddy: OnboardingPerson;
}

export async function lookupTeam(
  ctx: SparkApiContext,
  hint: string
): Promise<TeamLookupResult> {
  const res = await sparkFetch(
    ctx,
    `/api/lookup/team?hint=${encodeURIComponent(hint)}`
  );
  return sparkJson(res);
}

export async function lookupTeammates(
  ctx: SparkApiContext,
  opts: {team?: string; emailSeed?: string}
): Promise<{
  teamName: string;
  teammates: OnboardingPerson[];
  insights: Record<string, unknown>;
}> {
  const qs = new URLSearchParams();
  if (opts.team) qs.set('team', opts.team);
  if (opts.emailSeed) qs.set('emailSeed', opts.emailSeed);
  const res = await sparkFetch(ctx, `/api/lookup/teammates?${qs.toString()}`);
  return sparkJson(res);
}

export async function lookupConfluencePeople(
  ctx: SparkApiContext,
  email: string
): Promise<{guides: Record<string, ConfluenceLink>}> {
  const res = await sparkFetch(
    ctx,
    `/api/lookup/confluence-people?email=${encodeURIComponent(email)}`
  );
  return sparkJson(res);
}

export interface SlackUserHit {
  slackUserId: string;
  name: string;
  displayName: string;
  email?: string;
  title?: string;
  avatarUrl?: string;
}

export async function lookupSlackUsers(
  ctx: SparkApiContext,
  query: string,
  limit = 10
): Promise<{users: SlackUserHit[]}> {
  const qs = new URLSearchParams({q: query, limit: String(limit)});
  const res = await sparkFetch(ctx, `/api/lookup/slack-users?${qs}`);
  return sparkJson(res);
}

export async function lookupContributionTasks(
  ctx: SparkApiContext,
  email: string
): Promise<{tasks: ContributionTask[]}> {
  const res = await sparkFetch(
    ctx,
    `/api/lookup/contribution-tasks?email=${encodeURIComponent(email)}`
  );
  return sparkJson(res);
}
