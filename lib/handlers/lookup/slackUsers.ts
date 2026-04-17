import type {HandlerCtx} from '../../ctx';
import type {ManagerSession} from '../../session';
import type {OrgPerson} from '../../services/orgGraph';
import type {SlackUserHit} from '../../services/slackUserDirectory';
import {searchUsersWithState} from '../../services/slackUserDirectory';

/**
 * Picker search endpoint.
 *
 * Fast path: the DX warehouse. One SQL round-trip returns ranked
 * name/email matches for the whole org in <50ms, then we hydrate Slack
 * identity (slackUserId + avatar) in parallel via users.lookupByEmail
 * (Tier 4 — 100+ req/min, so N hydration calls for a picker limit of
 * ≤25 is trivial).
 *
 * Slow path: Slack users.list pagination (Tier 2 — 20 req/min, eats
 * the limiter on any workspace with a few hundred members). We only
 * touch this path when the warehouse is unconfigured OR errors out.
 * A zero-row warehouse response is treated as an authoritative "no
 * matches" — we DO NOT silently re-query Slack, because the Slack
 * fallback is strictly worse and would serve rate-limited / partial
 * results to hide what is actually a correct empty answer.
 */
export async function handleLookupSlackUsers(
  request: Request,
  ctx: HandlerCtx,
  _session: ManagerSession
): Promise<Response> {
  const url = new URL(request.url);
  const q = url.searchParams.get('q') ?? '';
  const rawLimit = Number(url.searchParams.get('limit') ?? '10');
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(25, Math.floor(rawLimit)))
    : 10;

  if (ctx.org.isConfigured() && q.trim()) {
    const warehouse = await searchWarehouse(ctx, q, limit);
    if (warehouse !== null) {
      // Warehouse query succeeded — this IS the answer, even if empty.
      return Response.json({users: warehouse, partial: false});
    }
    // searchWarehouse returned null → warehouse threw. Fall through to
    // the Slack crawl as transient resilience.
  }

  const {users, partial} = await searchUsersWithState(ctx, q, limit);
  return Response.json({users, partial});
}

/**
 * Returns:
 *   - `null` when the warehouse threw (caller should fall back)
 *   - `[]` when the warehouse returned 0 rows or every row failed
 *     hydration (caller should surface "no matches")
 *   - `[hit, ...]` when warehouse rows hydrated successfully
 *
 * The null/empty distinction is intentional: an empty result is an
 * authoritative answer, not a reason to try a slower path.
 */
async function searchWarehouse(
  ctx: HandlerCtx,
  query: string,
  limit: number
): Promise<SlackUserHit[] | null> {
  let rows: OrgPerson[];
  try {
    rows = await ctx.org.searchByName(query, limit);
  } catch (error) {
    ctx.logger.warn('picker warehouse search threw; falling back', error);
    return null;
  }
  if (rows.length === 0) return [];

  const hydrated = await Promise.all(rows.map((row) => hydrateHit(ctx, row)));
  return hydrated.filter((hit): hit is SlackUserHit => hit !== null);
}

async function hydrateHit(
  ctx: HandlerCtx,
  row: OrgPerson
): Promise<SlackUserHit | null> {
  try {
    const res = await ctx.slack.users.lookupByEmail({email: row.email});
    const user = res.user;
    if (!res.ok || !user?.id) return null;
    const profile = user.profile ?? {};
    const slackUserId = user.id;
    const realName =
      profile.real_name_normalized ??
      profile.real_name ??
      user.real_name ??
      row.name;
    const displayName =
      profile.display_name_normalized ?? profile.display_name ?? realName;
    return {
      slackUserId,
      name: realName,
      displayName: displayName || realName,
      email: profile.email?.trim() || row.email,
      title: profile.title?.trim() || row.title,
      avatarUrl: profile.image_192 ?? profile.image_72 ?? undefined,
    };
  } catch (error) {
    ctx.logger.warn(`picker hydrate failed for ${row.email}`, error);
    return null;
  }
}
