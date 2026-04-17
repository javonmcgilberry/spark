/**
 * GET /api/auth/atlassian/callback
 *
 * Atlassian redirects back here after the user grants (or denies)
 * consent. Expected query params: `code`, `state`. We:
 *
 *   1. Verify the `state` matches the value we stashed in the
 *      `spark_atlassian_oauth_state` cookie during /start, and that
 *      the cookie's bound email matches the current viewer (to
 *      prevent cookie-theft flow-completion attacks).
 *   2. Exchange the code for access + refresh tokens.
 *   3. Hit accessible-resources to learn which Atlassian site (cloudId)
 *      the token is scoped to. The first accessible site wins; managers
 *      with multiple sites can rewire via a disconnect + reconnect.
 *   4. Persist the full record in the atlassian_tokens D1 table keyed
 *      on the viewer's email.
 *   5. 302 back to the home page.
 */

import {NextResponse} from 'next/server';
import {buildRouteCtx} from '../../../../../lib/routeCtx';
import {getSessionDetails} from '../../../../../lib/session';
import {
  exchangeCode,
  fetchAccessibleResources,
} from '../../../../../lib/auth/atlassianOAuth';
import {resolveStore} from '../../../../../lib/auth/atlassianSession';

export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'spark_atlassian_oauth_state';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const error = url.searchParams.get('error');
  if (error) {
    return redirectWithFlash(
      request,
      'error',
      url.searchParams.get('error_description') ?? error
    );
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) {
    return redirectWithFlash(request, 'error', 'missing code or state');
  }

  const {ctx, env} = await buildRouteCtx();
  const {session} = await getSessionDetails(ctx);
  if (!session?.email) {
    return NextResponse.json({error: 'no-session'}, {status: 401});
  }

  const clientId = env.ATLASSIAN_OAUTH_CLIENT_ID;
  const clientSecret = env.ATLASSIAN_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return redirectWithFlash(
      request,
      'error',
      'ATLASSIAN_OAUTH_CLIENT_ID / SECRET not configured.'
    );
  }

  const stateCookie = request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${STATE_COOKIE}=`));
  if (!stateCookie) {
    return redirectWithFlash(request, 'error', 'state cookie missing');
  }
  const rawCookieValue = stateCookie.slice(STATE_COOKIE.length + 1);
  const [cookieState, cookieEmail] = rawCookieValue.split('.');
  if (cookieState !== state) {
    return redirectWithFlash(request, 'error', 'state mismatch');
  }
  if (cookieEmail !== session.email) {
    return redirectWithFlash(
      request,
      'error',
      'state cookie bound to a different viewer.'
    );
  }

  const redirectUri = resolveRedirectUri(request, env);

  let tokens;
  try {
    tokens = await exchangeCode({
      clientId,
      clientSecret,
      code,
      redirectUri,
    });
  } catch (err) {
    ctx.logger.warn('Atlassian code exchange failed', err);
    return redirectWithFlash(
      request,
      'error',
      err instanceof Error ? err.message : 'code exchange failed'
    );
  }

  let resources;
  try {
    resources = await fetchAccessibleResources({
      accessToken: tokens.accessToken,
    });
  } catch (err) {
    ctx.logger.warn('Atlassian accessible-resources lookup failed', err);
    return redirectWithFlash(
      request,
      'error',
      'could not list Atlassian sites'
    );
  }

  if (resources.length === 0) {
    return redirectWithFlash(
      request,
      'error',
      'token did not authorize any Atlassian sites'
    );
  }

  const site = resources[0];

  const store = resolveStore(ctx);
  if (!store) {
    return redirectWithFlash(
      request,
      'error',
      'atlassian_tokens storage unavailable (DRAFTS_DB binding missing)'
    );
  }

  const now = Date.now();
  await store.save({
    userEmail: session.email,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    cloudId: site.id,
    cloudUrl: site.url,
    cloudName: site.name,
    scope: tokens.scope,
    expiresAt: now + tokens.expiresIn * 1000,
    createdAt: now,
    updatedAt: now,
  });

  const response = redirectWithFlash(request, 'connected', site.name);
  // Burn the one-time state cookie.
  response.cookies.set(STATE_COOKIE, '', {
    path: '/api/auth/atlassian',
    maxAge: 0,
  });
  return response;
}

function resolveRedirectUri(request: Request, env: CloudflareEnv): string {
  const override = env.ATLASSIAN_OAUTH_REDIRECT_BASE?.trim();
  const base =
    override && override.length > 0 ? override : new URL(request.url).origin;
  return `${base.replace(/\/$/, '')}/api/auth/atlassian/callback`;
}

function redirectWithFlash(
  request: Request,
  key: 'connected' | 'error',
  value: string
): NextResponse {
  const origin = new URL(request.url).origin;
  const target = new URL('/', origin);
  target.searchParams.set(
    key === 'connected' ? 'atlassian_connected' : 'atlassian_error',
    value
  );
  return NextResponse.redirect(target.toString(), 302);
}
