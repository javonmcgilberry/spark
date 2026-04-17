import type {HandlerCtx} from '../../ctx';
import type {ManagerSession} from '../../session';
import {searchUsersWithState} from '../../services/slackUserDirectory';

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
  const {users, partial} = await searchUsersWithState(ctx, q, limit, {
    seedSlackUserIds: [session.managerSlackId],
  });
  return Response.json({users, partial});
}
