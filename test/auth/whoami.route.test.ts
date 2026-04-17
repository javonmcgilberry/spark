import {describe, expect, it} from 'vitest';

function makeJwt(payload: Record<string, unknown>): string {
  const encode = (value: string) =>
    Buffer.from(value)
      .toString('base64')
      .replace(/=+$/, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  const header = encode(JSON.stringify({alg: 'RS256', typ: 'JWT'}));
  const body = encode(JSON.stringify(payload));
  return `${header}.${body}.sig`;
}

describe('GET /api/whoami', () => {
  it('reports authenticated=false with no CF Access headers', async () => {
    const {GET} = await import('../../app/api/whoami/route');
    const request = new Request('https://spark.wf.app/api/whoami');
    const res = await GET(request);
    const body = (await res.json()) as {
      summary: {
        authenticatedByCloudflareAccess: boolean;
        email: string | null;
      };
      probe: {hasCfAccessHeader: boolean; hasCfAuthorizationCookie: boolean};
    };
    expect(body.summary.authenticatedByCloudflareAccess).toBe(false);
    expect(body.summary.email).toBeNull();
    expect(body.probe.hasCfAccessHeader).toBe(false);
    expect(body.probe.hasCfAuthorizationCookie).toBe(false);
  });

  it('surfaces the decoded Cf-Access JWT when present', async () => {
    const {GET} = await import('../../app/api/whoami/route');
    const request = new Request('https://spark.wf.app/api/whoami', {
      headers: {
        'Cf-Access-Jwt-Assertion': makeJwt({
          email: 'javon@webflow.com',
          sub: 'abc-123',
          country: 'US',
          iss: 'https://webflow.cloudflareaccess.com',
        }),
        'CF-Ray': 'abc123',
        'User-Agent': 'Mozilla/5.0',
      },
    });
    const res = await GET(request);
    const body = (await res.json()) as {
      summary: {
        authenticatedByCloudflareAccess: boolean;
        email: string | null;
        tokenSource: string | null;
      };
      probe: {
        hasCfAccessHeader: boolean;
        jwtPreview: string | null;
      };
      headers: Record<string, string>;
    };
    expect(body.summary.authenticatedByCloudflareAccess).toBe(true);
    expect(body.summary.email).toBe('javon@webflow.com');
    expect(body.summary.tokenSource).toBe('header');
    expect(body.probe.hasCfAccessHeader).toBe(true);
    expect(body.probe.jwtPreview).toContain('…');
    expect(body.headers['user-agent']).toBe('Mozilla/5.0');
    expect(body.headers['cf-ray']).toBe('abc123');
  });

  it('redacts the raw Cookie header but still resolves CF_Authorization internally', async () => {
    const {GET} = await import('../../app/api/whoami/route');
    const request = new Request('https://spark.wf.app/api/whoami', {
      headers: {
        cookie: `CF_Authorization=${makeJwt({
          email: 'viewer@webflow.com',
          sub: 'xyz-789',
        })}; session=secret`,
      },
    });
    const res = await GET(request);
    const body = (await res.json()) as {
      summary: {
        authenticatedByCloudflareAccess: boolean;
        email: string | null;
        tokenSource: string | null;
      };
      headers: Record<string, string>;
    };
    expect(body.summary.authenticatedByCloudflareAccess).toBe(true);
    expect(body.summary.email).toBe('viewer@webflow.com');
    expect(body.summary.tokenSource).toBe('cookie');
    expect(body.headers.cookie).toBe('[redacted]');
  });

  it('sets Cache-Control: no-store so the probe output is never cached', async () => {
    const {GET} = await import('../../app/api/whoami/route');
    const res = await GET(new Request('https://spark.wf.app/api/whoami'));
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});
