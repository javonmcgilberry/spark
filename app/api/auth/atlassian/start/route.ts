/**
 * GET /api/auth/atlassian/start
 *
 * Kicks off the Atlassian OAuth 2.0 (3LO) flow. Generates a one-time
 * CSRF state value, stashes it (along with the viewer's email) in a
 * short-lived httpOnly cookie, and 302s the browser to Atlassian's
 * consent screen. The callback route verifies the cookie matches the
 * `state` query param Atlassian returns.
 *
 * The viewer must be authenticated via Cloudflare Access (Okta SSO)
 * first — we need their email to key the stored token on. Returns
 * 401 otherwise so nobody accidentally grants a bot an OAuth token
 * bound to a null identity.
 */

import {NextResponse} from 'next/server';
import {buildRouteCtx} from '../../../../../lib/routeCtx';
import {getSessionDetails} from '../../../../../lib/session';
import {buildAuthorizeUrl} from '../../../../../lib/auth/atlassianOAuth';

export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'spark_atlassian_oauth_state';
const STATE_MAX_AGE_SECONDS = 10 * 60; // 10 min window to complete consent

export async function GET(request: Request) {
  const {ctx, env} = await buildRouteCtx();
  const {session} = await getSessionDetails(ctx);
  if (!session?.email) {
    return NextResponse.json(
      {error: 'no-session', message: 'Sign in first.'},
      {status: 401}
    );
  }

  const clientId = env.ATLASSIAN_OAUTH_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      {
        error: 'not-configured',
        message:
          'ATLASSIAN_OAUTH_CLIENT_ID is not set. Register an OAuth 2.0 app at https://developer.atlassian.com/console/myapps/ and set the env var in Webflow Cloud.',
      },
      {status: 500}
    );
  }

  const redirectUri = resolveRedirectUri(request, env);
  const state = randomState();

  const authorizeUrl = buildAuthorizeUrl({
    clientId,
    redirectUri,
    state,
  });

  const response = NextResponse.redirect(authorizeUrl, 302);
  response.cookies.set(STATE_COOKIE, `${state}.${session.email}`, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/api/auth/atlassian',
    maxAge: STATE_MAX_AGE_SECONDS,
  });
  return response;
}

function resolveRedirectUri(request: Request, env: CloudflareEnv): string {
  // Prefer an explicit override (set when tunneling local dev), then
  // fall back to the request origin, which on Webflow Cloud is the
  // app's canonical URL.
  const override = env.ATLASSIAN_OAUTH_REDIRECT_BASE?.trim();
  const base =
    override && override.length > 0 ? override : new URL(request.url).origin;
  return `${base.replace(/\/$/, '')}/api/auth/atlassian/callback`;
}

function randomState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, '0');
  }
  return out;
}
