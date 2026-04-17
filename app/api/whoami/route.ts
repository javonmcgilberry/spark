/**
 * GET /api/whoami
 *
 * Debug probe for a Webflow Cloud deploy. Surfaces three things:
 *
 *   1. Cloudflare Access identity — whether the Okta JWT is reaching
 *      the Worker on `Cf-Access-Jwt-Assertion` / `CF_Authorization`.
 *   2. Worker env — which of the vars set in the Webflow Cloud
 *      dashboard are actually visible to the Worker at runtime.
 *      Never returns secret values, just presence and length.
 *   3. A narrow allowlist of incoming request headers.
 *
 * Safe to leave enabled: the endpoint only tells the authenticated
 * viewer information about their own request. Everything behind
 * `spark.wf.app` is already gated by Webflow Okta SSO.
 */

import {getCloudflareContext} from '@opennextjs/cloudflare';
import {NextResponse} from 'next/server';
import {
  inspectAccessHeaders,
  previewJwt,
} from '../../../lib/auth/cloudflareAccess';

export const dynamic = 'force-dynamic';

const DUMPED_HEADER_PREFIXES = ['cf-', 'x-forwarded-'];
const DUMPED_HEADER_NAMES = new Set(['user-agent', 'host']);
const REDACTED_HEADER_NAMES = new Set(['cookie', 'authorization']);

// Vars whose values are sensitive — the probe reports length only.
const SECRET_ENV_KEYS = [
  'SLACK_BOT_TOKEN',
  'SLACK_SIGNING_SECRET',
  'ANTHROPIC_API_KEY',
  'GITHUB_TOKEN',
  'JIRA_API_EMAIL',
  'JIRA_API_TOKEN',
  'CONFLUENCE_API_TOKEN',
] as const;

// Vars whose values are non-sensitive config — the probe shows them
// verbatim so we can verify typos and environment-spec parity.
const VISIBLE_ENV_KEYS = [
  'ANTHROPIC_MODEL',
  'JIRA_BASE_URL',
  'CONFLUENCE_BASE_URL',
  'GITHUB_ORG',
  'GITHUB_CODEOWNERS_REPO',
  'DEMO_MANAGER_SLACK_ID',
  'SLACK_MOCK_MODE',
  'ANTHROPIC_MOCK_MODE',
] as const;

export async function GET(request: Request) {
  const access = inspectAccessHeaders(request.headers);
  const workerEnv = await collectWorkerEnv();

  return NextResponse.json(
    {
      summary: {
        authenticatedByCloudflareAccess: Boolean(access.payload?.email),
        email: access.payload?.email ?? null,
        sub: access.payload?.sub ?? null,
        country: access.payload?.country ?? null,
        issuer: access.payload?.iss ?? null,
        tokenSource: access.source,
      },
      probe: {
        hasCfAccessHeader: access.hasHeader,
        hasCfAuthorizationCookie: access.hasCookie,
        jwtPreview: access.jwtPreview,
        payload: access.payload,
      },
      workerEnv,
      headers: collectDebugHeaders(request),
    },
    {headers: {'Cache-Control': 'no-store'}}
  );
}

interface WorkerEnvReport {
  cloudflareContextAvailable: boolean;
  cloudflareContextError: string | null;
  secrets: Record<string, {set: boolean; length: number}>;
  values: Record<string, {set: boolean; value: string | null}>;
  bindings: Record<string, {present: boolean; kind: string}>;
}

async function collectWorkerEnv(): Promise<WorkerEnvReport> {
  let env: CloudflareEnv | null = null;
  let contextError: string | null = null;
  try {
    const cfCtx = await getCloudflareContext({async: true});
    env = cfCtx.env;
  } catch (error: unknown) {
    contextError = error instanceof Error ? error.message : String(error);
  }

  const record = (env ?? {}) as Record<string, unknown>;

  const secrets: WorkerEnvReport['secrets'] = {};
  for (const key of SECRET_ENV_KEYS) {
    const value = record[key];
    secrets[key] =
      typeof value === 'string' && value.length > 0
        ? {set: true, length: value.length}
        : {set: false, length: 0};
  }

  const values: WorkerEnvReport['values'] = {};
  for (const key of VISIBLE_ENV_KEYS) {
    const value = record[key];
    values[key] =
      typeof value === 'string' && value.length > 0
        ? {set: true, value}
        : {set: false, value: null};
  }

  const bindings: WorkerEnvReport['bindings'] = {};
  const draftsDb = record.DRAFTS_DB;
  bindings.DRAFTS_DB = {
    present:
      typeof draftsDb === 'object' &&
      draftsDb !== null &&
      typeof (draftsDb as {prepare?: unknown}).prepare === 'function',
    kind: typeof draftsDb,
  };

  return {
    cloudflareContextAvailable: env !== null,
    cloudflareContextError: contextError,
    secrets,
    values,
    bindings,
  };
}

function collectDebugHeaders(request: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of request.headers.entries()) {
    const lower = key.toLowerCase();
    if (REDACTED_HEADER_NAMES.has(lower)) {
      out[key] = '[redacted]';
      continue;
    }
    const interesting =
      DUMPED_HEADER_NAMES.has(lower) ||
      DUMPED_HEADER_PREFIXES.some((prefix) => lower.startsWith(prefix));
    if (!interesting) continue;
    out[key] = lower === 'cf-access-jwt-assertion' ? previewJwt(value) : value;
  }
  return out;
}
