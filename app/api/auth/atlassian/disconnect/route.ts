/**
 * POST /api/auth/atlassian/disconnect
 *
 * Deletes the viewer's stored Atlassian OAuth record. Does NOT revoke
 * the token at Atlassian (their API for that is best-effort and
 * mostly useful for refresh-token rotation, not session invalidation).
 * A future "Connect Jira" click will walk the full consent flow again.
 */

import {NextResponse} from 'next/server';
import {buildRouteCtx} from '../../../../../lib/routeCtx';
import {getSessionDetails} from '../../../../../lib/session';
import {resolveStore} from '../../../../../lib/auth/atlassianSession';

export const dynamic = 'force-dynamic';

export async function POST() {
  const {ctx} = await buildRouteCtx();
  const {session} = await getSessionDetails(ctx);
  if (!session?.email) {
    return NextResponse.json({error: 'no-session'}, {status: 401});
  }
  const store = resolveStore(ctx);
  if (!store) {
    return NextResponse.json({error: 'storage-unavailable'}, {status: 500});
  }
  await store.delete(session.email);
  return NextResponse.json(
    {ok: true},
    {status: 200, headers: {'Cache-Control': 'no-store'}}
  );
}
