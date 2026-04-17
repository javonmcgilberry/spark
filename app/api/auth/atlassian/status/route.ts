/**
 * GET /api/auth/atlassian/status
 *
 * Connect button polls this on mount to decide whether to show
 * "Connect Jira" (200 with connected:false) or "Jira connected ✓"
 * (200 with connected:true and the site metadata).
 *
 * Does NOT touch the refresh endpoint — we just look at the stored
 * row. The refresh-on-read lives in the service layer (lib/auth/
 * atlassianSession.ts). If the stored token has passed its expiry by
 * a lot, `connected` is still true here; the UI treats that as
 * "attempt anyway, service will refresh or clear."
 */

import {NextResponse} from 'next/server';
import {buildRouteCtx} from '../../../../../lib/routeCtx';
import {getSessionDetails} from '../../../../../lib/session';
import {resolveStore} from '../../../../../lib/auth/atlassianSession';

export const dynamic = 'force-dynamic';

export async function GET() {
  const {ctx, env} = await buildRouteCtx();
  const {session} = await getSessionDetails(ctx);
  if (!session?.email) {
    return NextResponse.json(
      {connected: false, reason: 'no-session'},
      {
        status: 200,
        headers: {'Cache-Control': 'no-store'},
      }
    );
  }
  const store = resolveStore(ctx);
  if (!store) {
    return NextResponse.json(
      {connected: false, reason: 'storage-unavailable'},
      {status: 200, headers: {'Cache-Control': 'no-store'}}
    );
  }
  if (!env.ATLASSIAN_OAUTH_CLIENT_ID) {
    return NextResponse.json(
      {connected: false, reason: 'oauth-not-configured'},
      {status: 200, headers: {'Cache-Control': 'no-store'}}
    );
  }

  const record = await store.get(session.email);
  if (!record) {
    return NextResponse.json(
      {connected: false, reason: 'not-connected'},
      {status: 200, headers: {'Cache-Control': 'no-store'}}
    );
  }

  return NextResponse.json(
    {
      connected: true,
      email: record.userEmail,
      site: {
        cloudId: record.cloudId,
        url: record.cloudUrl,
        name: record.cloudName,
      },
      scope: record.scope,
      expiresAt: record.expiresAt,
    },
    {status: 200, headers: {'Cache-Control': 'no-store'}}
  );
}
