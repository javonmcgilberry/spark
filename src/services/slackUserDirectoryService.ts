import type {App} from '@slack/bolt';
import type {UsersListResponse} from '@slack/web-api';
import type {Logger} from '../app/logger.js';

export interface SlackUserHit {
  slackUserId: string;
  name: string;
  displayName: string;
  // Optional: Slack may redact the email for some users (restricted guests,
  // missing `users:read.email` scope, privacy settings). slackUserId alone
  // is enough for the onboarding flow.
  email?: string;
  title?: string;
  avatarUrl?: string;
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const PAGE_LIMIT = 200;
// 100 pages * 200/page = up to 20,000 users. Webflow is ~3-4k so this has
// plenty of headroom. One cold-start refresh is ~15 Slack API calls at most
// for the real workspace; Tier 2 budget is ~20/min so still safe.
const MAX_PAGES = 100;

/**
 * In-process cache of the Slack workspace's user list, refreshed every
 * 10 minutes. One `users.list` pagination per cache refresh.
 */
export class SlackUserDirectoryService {
  private cache: {users: SlackUserHit[]; expiresAt: number} | null = null;
  private inFlight: Promise<SlackUserHit[]> | null = null;

  constructor(private readonly logger: Logger) {}

  async search(
    client: App['client'],
    query: string,
    limit = 10,
    options: {seedSlackUserIds?: string[]} = {}
  ): Promise<SlackUserHit[]> {
    const users = await this.getAll(client);
    // Demo-mode safety net: if the manager's own id isn't in the cached
    // directory (Enterprise Grid cross-workspace, or pagination cap),
    // fetch them via users.info and merge in. One-shot per missing id.
    const missing = (options.seedSlackUserIds ?? []).filter(
      (id) => !users.some((u) => u.slackUserId === id)
    );
    if (missing.length > 0) {
      await this.seedByIds(client, missing);
    }
    const pool = this.cache?.users ?? users;
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return pool.slice(0, limit);
    }
    const scored: Array<{hit: SlackUserHit; score: number}> = [];
    for (const user of pool) {
      const score = rank(user, needle);
      if (score > 0) scored.push({hit: user, score});
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.hit);
  }

  private async seedByIds(client: App['client'], ids: string[]): Promise<void> {
    if (!this.cache) return;
    for (const id of ids) {
      try {
        const res = await client.users.info({user: id});
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
        this.cache.users.push({
          slackUserId: member.id,
          name: realName,
          displayName: displayName || realName,
          email: profile.email?.trim() || undefined,
          title: profile.title?.trim() || undefined,
          avatarUrl: profile.image_192 ?? profile.image_72 ?? undefined,
        });
        this.logger.info(
          `Slack user directory: seeded ${member.id} (${realName}) via users.info`
        );
      } catch (error) {
        this.logger.warn(
          `Slack user directory: seed-by-id failed for ${id}`,
          error
        );
      }
    }
    // Maintain alphabetical sort after any injections.
    this.cache.users.sort((a, b) =>
      a.displayName.localeCompare(b.displayName, undefined, {
        sensitivity: 'base',
      })
    );
  }

  private async getAll(client: App['client']): Promise<SlackUserHit[]> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) {
      return this.cache.users;
    }
    if (this.inFlight) {
      return this.inFlight;
    }
    this.inFlight = this.refresh(client).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async refresh(client: App['client']): Promise<SlackUserHit[]> {
    const hits: SlackUserHit[] = [];
    let cursor: string | undefined;
    let pagesUsed = 0;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      pagesUsed = page + 1;
      const res: UsersListResponse = await client.users.list({
        limit: PAGE_LIMIT,
        cursor,
      });
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
        const email = profile.email?.trim();
        hits.push({
          slackUserId: member.id,
          name: realName,
          displayName: displayName || realName,
          email: email || undefined,
          title: profile.title?.trim() || undefined,
          avatarUrl: profile.image_192 ?? profile.image_72 ?? undefined,
        });
      }
      cursor = res.response_metadata?.next_cursor;
      if (!cursor) break;
    }
    // Slack returns users in account-creation order. Sort alphabetically by
    // displayName (case-insensitive, locale-aware) so empty-query results
    // and ties in rank() scoring are predictable + scannable.
    hits.sort((a, b) =>
      a.displayName.localeCompare(b.displayName, undefined, {
        sensitivity: 'base',
      })
    );
    this.cache = {users: hits, expiresAt: Date.now() + CACHE_TTL_MS};
    this.logger.info(
      `Slack user directory refreshed: ${hits.length} users across ${pagesUsed} page(s)`
    );
    if (pagesUsed >= MAX_PAGES && cursor) {
      this.logger.warn(
        `Slack user directory: pagination cap (${MAX_PAGES} pages) hit, some users may be missing. Bump MAX_PAGES in slackUserDirectoryService.ts.`
      );
    }
    return hits;
  }

  /** Test-only: inject a fixed user list and skip Slack calls. */
  _primeForTests(users: SlackUserHit[]): void {
    this.cache = {users, expiresAt: Date.now() + CACHE_TTL_MS};
  }
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
