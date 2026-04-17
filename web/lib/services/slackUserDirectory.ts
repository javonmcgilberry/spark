/**
 * slackUserDirectory — in-process cache of the Slack workspace's user
 * list with a prefix-ranked search over it. One pagination pass per
 * cache refresh; 10-minute TTL.
 *
 * Cache lives on ctx.scratch so one Worker invocation shares the cache
 * across route handlers; cold starts re-pull. Tests pass a recording
 * Slack client via ctx.slack and prime the cache directly.
 */

import type {HandlerCtx} from '../ctx';

export interface SlackUserHit {
  slackUserId: string;
  name: string;
  displayName: string;
  email?: string;
  title?: string;
  avatarUrl?: string;
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const PAGE_LIMIT = 200;
const MAX_PAGES = 100;

interface Cache {
  users: SlackUserHit[];
  expiresAt: number;
}

function getCache(ctx: HandlerCtx): {
  current: Cache | null;
  inFlight: Promise<SlackUserHit[]> | null;
} {
  const existing = ctx.scratch.slackDirectory as
    | {current: Cache | null; inFlight: Promise<SlackUserHit[]> | null}
    | undefined;
  if (existing) return existing;
  const created = {current: null as Cache | null, inFlight: null};
  ctx.scratch.slackDirectory = created;
  return created;
}

export async function searchUsers(
  ctx: HandlerCtx,
  query: string,
  limit = 10,
  options: {seedSlackUserIds?: string[]} = {}
): Promise<SlackUserHit[]> {
  const users = await getAll(ctx);
  const cache = getCache(ctx);

  const missing = (options.seedSlackUserIds ?? []).filter(
    (id) => !users.some((u) => u.slackUserId === id)
  );
  if (missing.length > 0) {
    await seedByIds(ctx, cache, missing);
  }

  const pool = cache.current?.users ?? users;
  const needle = query.trim().toLowerCase();
  if (!needle) return pool.slice(0, limit);

  const scored: Array<{hit: SlackUserHit; score: number}> = [];
  for (const user of pool) {
    const score = rank(user, needle);
    if (score > 0) scored.push({hit: user, score});
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.hit);
}

async function getAll(ctx: HandlerCtx): Promise<SlackUserHit[]> {
  const cache = getCache(ctx);
  const now = Date.now();
  if (cache.current && cache.current.expiresAt > now) {
    return cache.current.users;
  }
  if (cache.inFlight) return cache.inFlight;

  const promise = refresh(ctx).finally(() => {
    cache.inFlight = null;
  });
  cache.inFlight = promise;
  return promise;
}

async function refresh(ctx: HandlerCtx): Promise<SlackUserHit[]> {
  const cache = getCache(ctx);
  const hits: SlackUserHit[] = [];
  let cursor: string | undefined;
  let pagesUsed = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    pagesUsed = page + 1;
    const res = await ctx.slack.users.list({limit: PAGE_LIMIT, cursor});
    for (const member of res.members ?? []) {
      if (member.deleted || member.is_bot) continue;
      if (member.id === 'USLACKBOT' || !member.id) continue;
      const profile = member.profile ?? {};
      const realName =
        profile.real_name_normalized ??
        profile.real_name ??
        member.real_name ??
        member.name ??
        'Unknown';
      const displayName =
        profile.display_name_normalized ?? profile.display_name ?? realName;
      hits.push({
        slackUserId: member.id,
        name: realName,
        displayName: displayName || realName,
        email: profile.email?.trim() || undefined,
        title: profile.title?.trim() || undefined,
        avatarUrl: profile.image_192 ?? profile.image_72 ?? undefined,
      });
    }
    cursor = res.response_metadata?.next_cursor;
    if (!cursor) break;
  }

  hits.sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, {
      sensitivity: 'base',
    })
  );

  cache.current = {users: hits, expiresAt: Date.now() + CACHE_TTL_MS};
  ctx.logger.info(
    `Slack user directory refreshed: ${hits.length} users across ${pagesUsed} page(s)`
  );
  if (pagesUsed >= MAX_PAGES && cursor) {
    ctx.logger.warn(
      `Slack user directory: pagination cap (${MAX_PAGES} pages) hit, some users may be missing.`
    );
  }
  return hits;
}

async function seedByIds(
  ctx: HandlerCtx,
  cache: ReturnType<typeof getCache>,
  ids: string[]
): Promise<void> {
  if (!cache.current) return;
  for (const id of ids) {
    try {
      const res = await ctx.slack.users.info({user: id});
      const member = res.user;
      if (!member?.id || member.deleted || member.is_bot) continue;
      const profile = member.profile ?? {};
      const realName =
        profile.real_name_normalized ??
        profile.real_name ??
        member.real_name ??
        member.name ??
        'Unknown';
      const displayName =
        profile.display_name_normalized ?? profile.display_name ?? realName;
      cache.current.users.push({
        slackUserId: member.id,
        name: realName,
        displayName: displayName || realName,
        email: profile.email?.trim() || undefined,
        title: profile.title?.trim() || undefined,
        avatarUrl: profile.image_192 ?? profile.image_72 ?? undefined,
      });
    } catch (error) {
      ctx.logger.warn(
        `Slack user directory: seed-by-id failed for ${id}`,
        error
      );
    }
  }
  cache.current.users.sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, {
      sensitivity: 'base',
    })
  );
}

function rank(user: SlackUserHit, needle: string): number {
  const name = user.name.toLowerCase();
  const display = user.displayName.toLowerCase();
  const email = user.email?.toLowerCase() ?? '';
  if (name.startsWith(needle) || display.startsWith(needle)) return 100;
  if (email && email.startsWith(needle)) return 90;
  if (name.includes(needle) || display.includes(needle)) return 50;
  if (email && email.includes(needle)) return 40;
  return 0;
}

/** Test-only: prime the cache without making any Slack calls. */
export function primeDirectoryForTests(
  ctx: HandlerCtx,
  users: SlackUserHit[]
): void {
  const cache = getCache(ctx);
  cache.current = {users, expiresAt: Date.now() + CACHE_TTL_MS};
}
