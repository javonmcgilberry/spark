/**
 * Reads the authenticated user's identity out of a Cloudflare Access
 * JWT. Webflow Cloud puts every Webflow Inside app behind Okta via
 * Cloudflare Access, which attaches the JWT to every authenticated
 * request in two places:
 *
 *   - `Cf-Access-Jwt-Assertion` HTTP header
 *   - `CF_Authorization` cookie
 *
 * See developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/application-token/
 *
 * IMPORTANT: these helpers only *decode* the JWT payload — they do not
 * verify the signature. The base64-decoded payload is trusted because
 * Cloudflare Access strips any client-set `Cf-Access-Jwt-Assertion`
 * before the request reaches the origin and replaces it with one it
 * signed itself. For extra defense-in-depth (spoofed header if the CF
 * Access proxy is ever bypassed — e.g. hitting the Worker directly over
 * a preview URL) add signature verification against the team's JWKS at
 * https://<team>.cloudflareaccess.com/cdn-cgi/access/certs and enforce
 * the `aud` claim. That's a follow-up.
 */

export interface AccessIdentity {
  /** The authenticated user's email, verified by the identity provider. */
  email: string;
  /** Unique user id from Cloudflare Access (stable per email per account). */
  sub: string;
  /** ISO country code Cloudflare saw the request from, when available. */
  country?: string;
  /** Issuer URL — useful for asserting which CF Access org signed this. */
  iss?: string;
  /** Where we found the JWT — header or cookie. */
  source: 'header' | 'cookie';
}

const HEADER = 'Cf-Access-Jwt-Assertion';
const COOKIE = 'CF_Authorization';

export function readAccessIdentity(request: Request): AccessIdentity | null {
  const headerJwt = request.headers.get(HEADER);
  if (headerJwt) {
    const payload = decodeJwtPayload(headerJwt);
    if (payload?.email && payload.sub) {
      return {
        email: payload.email,
        sub: payload.sub,
        country: payload.country,
        iss: payload.iss,
        source: 'header',
      };
    }
  }
  const cookieJwt = readAccessCookie(request.headers.get('cookie'));
  if (cookieJwt) {
    const payload = decodeJwtPayload(cookieJwt);
    if (payload?.email && payload.sub) {
      return {
        email: payload.email,
        sub: payload.sub,
        country: payload.country,
        iss: payload.iss,
        source: 'cookie',
      };
    }
  }
  return null;
}

/**
 * Same as readAccessIdentity but returns raw signals so a debug probe
 * can surface the full picture — which headers exist, whether decode
 * failed, where the token came from. Not for session code.
 */
export function inspectAccessRequest(request: Request) {
  const headerJwt = request.headers.get(HEADER);
  const cookieJwt = readAccessCookie(request.headers.get('cookie'));
  const jwt = headerJwt ?? cookieJwt;
  const source: AccessIdentity['source'] | null = headerJwt
    ? 'header'
    : cookieJwt
      ? 'cookie'
      : null;
  const payload = jwt ? decodeJwtPayload(jwt) : null;
  return {
    hasHeader: Boolean(headerJwt),
    hasCookie: Boolean(cookieJwt),
    source,
    payload,
    jwtPreview: jwt ? previewJwt(jwt) : null,
  };
}

interface AccessJwtPayload {
  email?: string;
  sub?: string;
  country?: string;
  iss?: string;
  aud?: string[];
  exp?: number;
  iat?: number;
  nbf?: number;
  type?: string;
  identity_nonce?: string;
}

function decodeJwtPayload(jwt: string): AccessJwtPayload | null {
  const parts = jwt.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = decodeBase64Url(parts[1]);
    const parsed = JSON.parse(json);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as AccessJwtPayload)
      : null;
  } catch {
    return null;
  }
}

function decodeBase64Url(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - (base64.length % 4)) % 4;
  const padded = base64 + '='.repeat(pad);
  if (typeof atob === 'function') {
    return atob(padded);
  }
  return Buffer.from(padded, 'base64').toString('utf8');
}

function readAccessCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(`${COOKIE}=`)) continue;
    return trimmed.slice(COOKIE.length + 1);
  }
  return null;
}

/** First 12 + last 4 chars — enough to eyeball the value, not enough to replay. */
export function previewJwt(value: string): string {
  if (value.length <= 16) return value;
  return `${value.slice(0, 12)}…${value.slice(-4)}`;
}
