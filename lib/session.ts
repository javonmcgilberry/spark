import {cookies, headers} from 'next/headers';
import {inspectAccessHeaders} from './auth/cloudflareAccess';
import type {HandlerCtx} from './ctx';

/**
 * Resolves the acting manager for the current request. Source order:
 *
 *   1. Cloudflare Access JWT (Cf-Access-Jwt-Assertion / CF_Authorization)
 *      — present on every Webflow Inside request behind Webflow Okta SSO.
 *      The verified email comes off the JWT; we resolve it to a Slack
 *      user via `users.lookupByEmail`. If CF Access asserted an identity
 *      but Slack can't resolve it we return null rather than falling
 *      through — silent fallback would attribute actions to the wrong
 *      person.
 *
 *   2. Signed cookie `spark_manager_slack_id` — manual override useful
 *      for the dev sandbox.
 *
 *   3. `DEMO_MANAGER_SLACK_ID` env — local-dev escape hatch when no CF
 *      Access proxy sits in front of the Worker.
 */

export const SESSION_COOKIE_NAME = 'spark_manager_slack_id';

export interface ManagerSession {
  managerSlackId: string;
  email?: string;
  source: 'cloudflare-access' | 'cookie' | 'env';
}

export type SlackLookupOutcome =
  | 'ok'
  | 'user-not-found'
  | 'api-error'
  | 'not-attempted';

export interface AccessDiagnostic {
  hasAccessHeader: boolean;
  hasAccessCookie: boolean;
  /** Email off the CF Access JWT, if decode succeeded. */
  email: string | null;
  slackLookup: SlackLookupOutcome;
  /** Slack's `ok:false` error code or a network error message. */
  slackLookupError: string | null;
}

export interface SessionDetails {
  session: ManagerSession | null;
  access: AccessDiagnostic;
}

const EMPTY_ACCESS: AccessDiagnostic = {
  hasAccessHeader: false,
  hasAccessCookie: false,
  email: null,
  slackLookup: 'not-attempted',
  slackLookupError: null,
};

export async function getSessionDetails(
  ctx?: HandlerCtx
): Promise<SessionDetails> {
  let access: AccessDiagnostic = EMPTY_ACCESS;
  let resolvedSlackId: string | null = null;
  if (ctx) {
    const resolution = await resolveCloudflareAccess(ctx);
    access = resolution.diagnostic;
    resolvedSlackId = resolution.slackId;
  }

  // CF Access asserted an identity. Use the Slack-resolved session or
  // refuse — never fall through to cookie/env (that would attribute
  // actions to whoever set them, not the authenticated user).
  if (access.hasAccessHeader || access.hasAccessCookie) {
    if (resolvedSlackId && access.email) {
      return {
        session: {
          managerSlackId: resolvedSlackId,
          email: access.email,
          source: 'cloudflare-access',
        },
        access,
      };
    }
    return {session: null, access};
  }

  const cookieSession = await tryCookie();
  if (cookieSession) return {session: cookieSession, access};

  const env = ctx?.env ?? (process.env as unknown as CloudflareEnv);
  return {session: tryEnvFallback(env), access};
}

export async function getManagerSession(
  ctx?: HandlerCtx
): Promise<ManagerSession | null> {
  return (await getSessionDetails(ctx)).session;
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

interface AccessResolution {
  diagnostic: AccessDiagnostic;
  slackId: string | null;
}

async function resolveCloudflareAccess(
  ctx: HandlerCtx
): Promise<AccessResolution> {
  const h = await headers();
  const inspection = inspectAccessHeaders(h);
  const email = inspection.payload?.email ?? null;
  const base = {
    hasAccessHeader: inspection.hasHeader,
    hasAccessCookie: inspection.hasCookie,
  } as const;

  if (!email || !inspection.payload?.sub) {
    return {
      diagnostic: {
        ...base,
        email,
        slackLookup: 'not-attempted',
        slackLookupError: null,
      },
      slackId: null,
    };
  }

  try {
    const response = await ctx.slack.users.lookupByEmail({email});
    if (response.ok && response.user?.id) {
      return {
        diagnostic: {
          ...base,
          email,
          slackLookup: 'ok',
          slackLookupError: null,
        },
        slackId: response.user.id,
      };
    }
    ctx.logger.warn(
      `users.lookupByEmail for ${email} returned ok=false (${response.error ?? 'no-error-field'})`
    );
    return {
      diagnostic: {
        ...base,
        email,
        slackLookup: 'user-not-found',
        slackLookupError: response.error ?? null,
      },
      slackId: null,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.logger.warn(`users.lookupByEmail for ${email} threw: ${message}`);
    return {
      diagnostic: {
        ...base,
        email,
        slackLookup: 'api-error',
        slackLookupError: message,
      },
      slackId: null,
    };
  }
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
