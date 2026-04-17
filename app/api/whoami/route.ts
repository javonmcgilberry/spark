/**
 * GET /api/whoami
 *
 * Debug probe for verifying Cloudflare Access identity headers reach
 * the Worker. Hit this from a browser (or curl) after deploying to
 * Webflow Inside — if `authenticatedByCloudflareAccess` is true and
 * `email` is populated, session.ts can derive the manager identity
 * from the request with zero env vars.
 *
 * Safe to leave enabled — the endpoint only tells the authenticated
 * user their own identity (which they already know) and redacts the
 * full JWT so it can't be captured and replayed from the response.
 */

import {NextResponse} from 'next/server';
import {
  inspectAccessHeaders,
  previewJwt,
} from '../../../lib/auth/cloudflareAccess';

export const dynamic = 'force-dynamic';

const DUMPED_HEADER_PREFIXES = ['cf-', 'x-forwarded-'];
const DUMPED_HEADER_NAMES = new Set(['user-agent', 'host']);
const REDACTED_HEADER_NAMES = new Set(['cookie', 'authorization']);

export async function GET(request: Request) {
  const access = inspectAccessHeaders(request.headers);

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
      headers: collectDebugHeaders(request),
    },
    {headers: {'Cache-Control': 'no-store'}}
  );
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
