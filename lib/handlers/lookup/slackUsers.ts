import type {HandlerCtx} from '../../ctx';
import type {ManagerSession} from '../../session';
import type {OrgPerson} from '../../services/orgGraph';
import type {SlackUserHit} from '../../services/slackUserDirectory';
import {searchUsersWithState} from '../../services/slackUserDirectory';

/**
 * Picker search endpoint.
 *
 * Fast path: the DX warehouse. One SQL round-trip returns ranked
 * name/email matches for the whole org in <50ms. Slack identity
 * (slackUserId + avatar) is hydrated in parallel via users.lookupByEmail
 * — Tier 4 rate limit, so the N hydration calls are cheap.
 *
 * Slow path: Slack users.list pagination. Tier 2 rate limit, hits the
 * limiter on any workspace bigger than a few hundred people, and the
 * cache is cold every Worker invocation. Kept as a fallback when the
 * warehouse is unconfigured or unreachable.
 */
export async function handleLookupSlackUsers(
  request: Request,
  ctx: HandlerCtx,
  session: ManagerSession
): Promise<Response> {
  const url = new URL(request.url);
  const q = url.searchParams.get('q') ?? '';
  const rawLimit = Number(url.searchParams.get('limit') ?? '10');
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(25, Math.floor(rawLimit)))
    : 10;

  if (ctx.org.isConfigured() && q.trim()) {
    const warehouse = await searchWarehouse(ctx, q, limit);
    if (warehouse && warehouse.length > 0) {
      return Response.json({users: warehouse, partial: false});
    }
  }

  const {users, partial} = await searchUsersWithState(ctx, q, limit, {
    seedSlackUserIds: [session.managerSlackId],
  });
  return Response.json({users, partial});
}

async function searchWarehouse(
  ctx: HandlerCtx,
  query: string,
  limit: number
): Promise<SlackUserHit[] | null> {
  let rows: OrgPerson[];
  try {
    rows = await ctx.org.searchByName(query, limit);
  } catch (error) {
    ctx.logger.warn('picker warehouse search failed; falling back', error);
    return null;
  }
  if (rows.length === 0) return null;

  // Hydrate Slack identity for each row in parallel. users.lookupByEmail
  // is Tier 4 (100+ req/min) so this is safe at the picker's limit of
  // 10-25 results per request. Falls back to users.info when the
  // directory cache has the email.
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
