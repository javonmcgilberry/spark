import {cookies, headers} from 'next/headers';
import {readAccessIdentity} from './auth/cloudflareAccess';
import type {HandlerCtx} from './ctx';

/**
 * Resolves the acting manager for the current request. Source order:
 *
 *   1. Cloudflare Access JWT (Cf-Access-Jwt-Assertion / CF_Authorization)
 *      — present on every Webflow Inside request behind Webflow Okta SSO.
 *      We pull the verified email off the JWT and resolve it to a Slack
 *      user via `users.lookupByEmail`. Requires ctx so we have a Slack
 *      client; when CF Access asserts an identity but Slack can't
 *      resolve it we 401 rather than falling through — we'd rather
 *      refuse than attribute actions to the wrong person.
 *
 *   2. Signed cookie `spark_manager_slack_id` — manual override useful
 *      for the dev sandbox and local testing.
 *
 *   3. `DEMO_MANAGER_SLACK_ID` env — local-dev escape hatch when no CF
 *      Access proxy sits in front of the Worker (e.g. `npm run dev`).
 *
 * Callers who only need the fallback paths (cookie / env) can skip the
 * ctx argument; production routes pass it so the CF Access path is tried
 * first.
 */

export const SESSION_COOKIE_NAME = 'spark_manager_slack_id';

export interface ManagerSession {
  managerSlackId: string;
  /** Present when we learned it from CF Access or looked it up on Slack. */
  email?: string;
  source: 'cloudflare-access' | 'cookie' | 'env';
}

export async function getManagerSession(
  ctx?: HandlerCtx
): Promise<ManagerSession | null> {
  if (ctx) {
    const access = await resolveCloudflareAccess(ctx);
    if (access) {
      // CF Access asserted an identity — return whatever it resolved
      // to (session or null). Never fall through to cookie/env.
      return access.session;
    }
  }

  const cookieSession = await tryCookie();
  if (cookieSession) return cookieSession;

  const env = ctx?.env ?? (process.env as unknown as CloudflareEnv);
  return tryEnvFallback(env);
}

export async function requireManagerSession(
  ctx?: HandlerCtx
): Promise<ManagerSession> {
  const session = await getManagerSession(ctx);
  if (!session) {
    throw new Response(JSON.stringify({error: 'no session'}), {
      status: 401,
      headers: {'Content-Type': 'application/json'},
    });
  }
  return session;
}

/**
 * Returns the CF Access-derived session, or null if CF Access didn't
 * identify anyone or Slack couldn't resolve the asserted email. When
 * CF Access IS present, the caller must not fall through to cookie/env
 * — that would attribute actions to the wrong user. Returning null
 * from here short-circuits the fallback chain in getManagerSession.
 */
async function resolveCloudflareAccess(
  ctx: HandlerCtx
): Promise<{status: 'identified'; session: ManagerSession | null} | null> {
  const h = await headers();
  const identity = readAccessIdentity(h);
  if (!identity) return null;

  const slackUser = await ctx.slack.users
    .lookupByEmail({email: identity.email})
    .catch((error: unknown) => {
      ctx.logger.warn(
        `users.lookupByEmail failed for ${identity.email}`,
        error
      );
      return null;
    });

  const slackId = slackUser?.user?.id;
  if (!slackId) {
    ctx.logger.warn(
      `Cloudflare Access identified ${identity.email} but Slack has no matching user`
    );
    return {status: 'identified', session: null};
  }

  return {
    status: 'identified',
    session: {
      managerSlackId: slackId,
      email: identity.email,
      source: 'cloudflare-access',
    },
  };
}

async function tryCookie(): Promise<ManagerSession | null> {
  const store = await cookies();
  const cookieValue = store.get(SESSION_COOKIE_NAME)?.value?.trim();
  if (cookieValue && isValidSlackId(cookieValue)) {
    return {managerSlackId: cookieValue, source: 'cookie'};
  }
  return null;
}

function tryEnvFallback(env: CloudflareEnv | undefined): ManagerSession | null {
  const raw = env?.DEMO_MANAGER_SLACK_ID?.trim();
  if (raw && isValidSlackId(raw)) {
    return {managerSlackId: raw, source: 'env'};
  }
  return null;
}

function isValidSlackId(value: string): boolean {
  return /^[A-Z0-9]+$/.test(value);
}
