import {beforeEach, describe, expect, it, vi} from 'vitest';
import {makeTestCtx} from '../helpers/makeTestCtx';
import type {HandlerCtx} from '../../lib/ctx';
import {resolveStore} from '../../lib/auth/atlassianSession';

/**
 * Mocks for the session + route-ctx layers. Every test seeds
 * sessionRef.value before importing the route under test; the shared
 * mock reads from there. Modeled after test/slack/route.test.ts.
 */

const sessionRef = vi.hoisted(() => ({
  value: null as {managerSlackId: string; email?: string} | null,
  ctx: null as HandlerCtx | null,
  env: {} as CloudflareEnv,
}));

vi.mock('../../lib/routeCtx', () => ({
  buildRouteCtx: vi.fn(async () => ({
    ctx: sessionRef.ctx,
    env: sessionRef.env,
  })),
}));

vi.mock('../../lib/session', () => ({
  getSessionDetails: vi.fn(async () => ({
    session: sessionRef.value,
    access: {
      hasAccessHeader: false,
      hasAccessCookie: false,
      email: sessionRef.value?.email ?? null,
      slackLookup: 'not-attempted' as const,
      slackLookupError: null,
    },
  })),
}));

function seed({
  email = 'javon@webflow.com',
  oauthConfigured = true,
}: {email?: string; oauthConfigured?: boolean} = {}) {
  const ctx = makeTestCtx();
  ctx.viewerEmail = email;
  if (oauthConfigured) {
    ctx.env = {
      ...ctx.env,
      ATLASSIAN_OAUTH_CLIENT_ID: 'client-id',
      ATLASSIAN_OAUTH_CLIENT_SECRET: 'client-secret',
    } as CloudflareEnv;
  }
  sessionRef.value = {managerSlackId: 'U1', email};
  sessionRef.ctx = ctx;
  sessionRef.env = ctx.env;
  return ctx;
}

function seedNoSession() {
  const ctx = makeTestCtx();
  sessionRef.value = null;
  sessionRef.ctx = ctx;
  sessionRef.env = ctx.env;
  return ctx;
}

describe('/api/auth/atlassian/status', () => {
  beforeEach(() => {
    sessionRef.value = null;
    sessionRef.ctx = null;
  });

  it('reports connected:false + no-session when the viewer is anonymous', async () => {
    seedNoSession();
    const {GET} = await import('../../app/api/auth/atlassian/status/route');
    const res = await GET();
    const body = (await res.json()) as {connected: boolean; reason?: string};
    expect(body.connected).toBe(false);
    expect(body.reason).toBe('no-session');
  });

  it('reports connected:false + oauth-not-configured when client id is missing', async () => {
    seed({oauthConfigured: false});
    const {GET} = await import('../../app/api/auth/atlassian/status/route');
    const res = await GET();
    const body = (await res.json()) as {connected: boolean; reason?: string};
    expect(body.connected).toBe(false);
    expect(body.reason).toBe('oauth-not-configured');
  });

  it('reports connected:false + not-connected when no row exists in the token store', async () => {
    seed();
    const {GET} = await import('../../app/api/auth/atlassian/status/route');
    const res = await GET();
    const body = (await res.json()) as {connected: boolean; reason?: string};
    expect(body.connected).toBe(false);
    expect(body.reason).toBe('not-connected');
  });

  it('reports connected:true with the stored site metadata', async () => {
    const ctx = seed();
    const store = resolveStore(ctx)!;
    const now = Date.now();
    await store.save({
      userEmail: 'javon@webflow.com',
      accessToken: 'at',
      refreshToken: 'rt',
      cloudId: 'cloud-42',
      cloudUrl: 'https://webflow.atlassian.net',
      cloudName: 'Webflow',
      scope: 'read:jira-work offline_access',
      expiresAt: now + 3_600_000,
      createdAt: now,
      updatedAt: now,
    });
    const {GET} = await import('../../app/api/auth/atlassian/status/route');
    const res = await GET();
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = (await res.json()) as {
      connected: boolean;
      email?: string;
      site?: {cloudId: string; url: string; name: string};
    };
    expect(body.connected).toBe(true);
    expect(body.email).toBe('javon@webflow.com');
    expect(body.site).toEqual({
      cloudId: 'cloud-42',
      url: 'https://webflow.atlassian.net',
      name: 'Webflow',
    });
  });
});

describe('/api/auth/atlassian/disconnect', () => {
  beforeEach(() => {
    sessionRef.value = null;
    sessionRef.ctx = null;
  });

  it('deletes the stored token for the current viewer', async () => {
    const ctx = seed();
    const store = resolveStore(ctx)!;
    const now = Date.now();
    await store.save({
      userEmail: 'javon@webflow.com',
      accessToken: 'at',
      refreshToken: 'rt',
      cloudId: 'cloud-42',
      cloudUrl: 'https://webflow.atlassian.net',
      cloudName: 'Webflow',
      scope: 'read:jira-work',
      expiresAt: now + 3_600_000,
      createdAt: now,
      updatedAt: now,
    });

    const {POST} =
      await import('../../app/api/auth/atlassian/disconnect/route');
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await store.get('javon@webflow.com')).toBeNull();
  });

  it('returns 401 with no session', async () => {
    seedNoSession();
    const {POST} =
      await import('../../app/api/auth/atlassian/disconnect/route');
    const res = await POST();
    expect(res.status).toBe(401);
  });
});

describe('/api/auth/atlassian/start', () => {
  beforeEach(() => {
    sessionRef.value = null;
    sessionRef.ctx = null;
  });

  it('401s when the viewer has no session', async () => {
    seedNoSession();
    const {GET} = await import('../../app/api/auth/atlassian/start/route');
    const res = await GET(
      new Request('https://spark.wf.app/api/auth/atlassian/start')
    );
    expect(res.status).toBe(401);
  });

  it('500s when ATLASSIAN_OAUTH_CLIENT_ID is not configured', async () => {
    seed({oauthConfigured: false});
    const {GET} = await import('../../app/api/auth/atlassian/start/route');
    const res = await GET(
      new Request('https://spark.wf.app/api/auth/atlassian/start')
    );
    expect(res.status).toBe(500);
    const body = (await res.json()) as {error: string};
    expect(body.error).toBe('not-configured');
  });

  it('redirects to Atlassian with state + sets a short-lived state cookie', async () => {
    seed();
    const {GET} = await import('../../app/api/auth/atlassian/start/route');
    const res = await GET(
      new Request('https://spark.wf.app/api/auth/atlassian/start')
    );
    expect(res.status).toBe(302);
    const location = res.headers.get('Location');
    expect(location).toBeTruthy();
    const url = new URL(location!);
    expect(url.host).toBe('auth.atlassian.com');
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://spark.wf.app/api/auth/atlassian/callback'
    );
    const state = url.searchParams.get('state');
    expect(state).toMatch(/^[0-9a-f]{32}$/);

    const setCookie = res.headers.get('Set-Cookie') ?? '';
    expect(setCookie).toContain('spark_atlassian_oauth_state=');
    expect(setCookie).toContain(state!);
    // Email gets URL-encoded inside a Set-Cookie value (@ → %40).
    expect(setCookie).toContain('javon%40webflow.com');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Path=/api/auth/atlassian');
  });
});
