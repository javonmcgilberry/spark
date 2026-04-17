import {describe, expect, it} from 'vitest';
import {
  inspectAccessRequest,
  previewJwt,
  readAccessIdentity,
} from '../../lib/auth/cloudflareAccess';

/**
 * Build a JWT-shaped string whose payload is the supplied object.
 * Header + signature are stubbed — the helpers only base64-decode the
 * payload section, so the other two don't matter for these tests.
 */
function makeJwt(payload: Record<string, unknown>): string {
  const encode = (value: string) =>
    Buffer.from(value)
      .toString('base64')
      .replace(/=+$/, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  const header = encode(JSON.stringify({alg: 'RS256', typ: 'JWT'}));
  const body = encode(JSON.stringify(payload));
  return `${header}.${body}.stub-signature`;
}

const SAMPLE_PAYLOAD = {
  email: 'javon@webflow.com',
  sub: '7335d417-61da-459d-899c-0a01c76a2f94',
  country: 'US',
  iss: 'https://webflow.cloudflareaccess.com',
  aud: ['app-audience'],
  exp: 1_759_474_457,
  iat: 1_759_474_397,
};

describe('readAccessIdentity', () => {
  it('returns identity when the JWT is on the Cf-Access-Jwt-Assertion header', () => {
    const request = new Request('https://spark.wf.app/api/drafts', {
      headers: {'Cf-Access-Jwt-Assertion': makeJwt(SAMPLE_PAYLOAD)},
    });
    const id = readAccessIdentity(request);
    expect(id).toEqual({
      email: 'javon@webflow.com',
      sub: '7335d417-61da-459d-899c-0a01c76a2f94',
      country: 'US',
      iss: 'https://webflow.cloudflareaccess.com',
      source: 'header',
    });
  });

  it('falls back to the CF_Authorization cookie when no header is present', () => {
    const request = new Request('https://spark.wf.app/api/drafts', {
      headers: {
        cookie: `something=else; CF_Authorization=${makeJwt(SAMPLE_PAYLOAD)}; other=xyz`,
      },
    });
    const id = readAccessIdentity(request);
    expect(id?.email).toBe('javon@webflow.com');
    expect(id?.source).toBe('cookie');
  });

  it('prefers the header over the cookie when both are present', () => {
    const headerPayload = {...SAMPLE_PAYLOAD, email: 'from-header@webflow.com'};
    const cookiePayload = {...SAMPLE_PAYLOAD, email: 'from-cookie@webflow.com'};
    const request = new Request('https://spark.wf.app/api/drafts', {
      headers: {
        'Cf-Access-Jwt-Assertion': makeJwt(headerPayload),
        cookie: `CF_Authorization=${makeJwt(cookiePayload)}`,
      },
    });
    expect(readAccessIdentity(request)?.email).toBe('from-header@webflow.com');
  });

  it('returns null when no JWT is present', () => {
    const request = new Request('https://spark.wf.app/api/drafts');
    expect(readAccessIdentity(request)).toBeNull();
  });

  it('returns null for a malformed JWT (not three segments)', () => {
    const request = new Request('https://spark.wf.app/api/drafts', {
      headers: {'Cf-Access-Jwt-Assertion': 'not-a-jwt'},
    });
    expect(readAccessIdentity(request)).toBeNull();
  });

  it('returns null when the payload is missing email or sub', () => {
    const request = new Request('https://spark.wf.app/api/drafts', {
      headers: {
        'Cf-Access-Jwt-Assertion': makeJwt({country: 'US'}),
      },
    });
    expect(readAccessIdentity(request)).toBeNull();
  });
});

describe('inspectAccessRequest', () => {
  it('reports all signals for a request with header + cookie', () => {
    const jwt = makeJwt(SAMPLE_PAYLOAD);
    const request = new Request('https://spark.wf.app/api/whoami', {
      headers: {
        'Cf-Access-Jwt-Assertion': jwt,
        cookie: `CF_Authorization=${jwt}`,
      },
    });
    const result = inspectAccessRequest(request);
    expect(result.hasHeader).toBe(true);
    expect(result.hasCookie).toBe(true);
    expect(result.source).toBe('header');
    expect(result.payload?.email).toBe('javon@webflow.com');
    expect(result.jwtPreview).toContain('…');
  });

  it('reports empty signals when no Access headers are present', () => {
    const request = new Request('https://spark.wf.app/api/whoami');
    const result = inspectAccessRequest(request);
    expect(result).toEqual({
      hasHeader: false,
      hasCookie: false,
      source: null,
      payload: null,
      jwtPreview: null,
    });
  });
});

describe('previewJwt', () => {
  it('returns the input unchanged for short strings', () => {
    expect(previewJwt('short')).toBe('short');
  });
  it('preserves first 12 and last 4 chars for long strings', () => {
    const value = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature';
    expect(previewJwt(value)).toBe('eyJhbGciOiJS…ture');
  });
});
