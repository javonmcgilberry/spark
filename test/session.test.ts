import {beforeEach, describe, expect, it, vi} from 'vitest';
import {makeTestCtx} from './helpers/makeTestCtx';

const headersRef = vi.hoisted(() => ({value: new Headers()}));
const cookieStore = vi.hoisted(
  () =>
    new Map<string, {name: string; value: string}>() as unknown as Map<
      string,
      {name: string; value: string}
    >
);

vi.mock('next/headers', () => ({
  headers: async () => headersRef.value,
  cookies: async () => ({
    get: (name: string) => cookieStore.get(name),
  }),
}));

function encode(value: string): string {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function makeJwt(payload: Record<string, unknown>): string {
  const header = encode(JSON.stringify({alg: 'RS256', typ: 'JWT'}));
  const body = encode(JSON.stringify(payload));
  return `${header}.${body}.sig`;
}

describe('getManagerSession', () => {
  beforeEach(() => {
    headersRef.value = new Headers();
    cookieStore.clear();
  });

  it('resolves via Cloudflare Access JWT → Slack users.lookupByEmail', async () => {
    headersRef.value = new Headers({
      'Cf-Access-Jwt-Assertion': makeJwt({
        email: 'javon@webflow.com',
        sub: 'cf-access-sub',
      }),
    });
    const ctx = makeTestCtx({
      slack: {
        usersLookupByEmail: {
          'javon@webflow.com': {
            id: 'U12345',
            real_name: 'Javon McGilberry',
            profile: {email: 'javon@webflow.com'},
          },
        },
      },
    });

    const {getManagerSession} = await import('../lib/session');
    const session = await getManagerSession(ctx);

    expect(session).toEqual({
      managerSlackId: 'U12345',
      email: 'javon@webflow.com',
      source: 'cloudflare-access',
    });
  });

  it('returns null when CF Access identifies a user Slack does not know', async () => {
    headersRef.value = new Headers({
      'Cf-Access-Jwt-Assertion': makeJwt({
        email: 'ghost@webflow.com',
        sub: 'cf-ghost',
      }),
    });
    // No users.lookupByEmail override → stub returns {ok: false}.
    const ctx = makeTestCtx();

    const {getManagerSession} = await import('../lib/session');
    const session = await getManagerSession(ctx);

    expect(session).toBeNull();
  });

  it('does NOT fall back to cookie or env when CF Access identity is unresolvable', async () => {
    // CF Access JWT is present, cookie + env are also set. Because CF
    // Access asserted an identity we must not silently pick up the
    // cookie/env fallback — that would attribute actions to a
    // different user. Returning null short-circuits.
    headersRef.value = new Headers({
      'Cf-Access-Jwt-Assertion': makeJwt({
        email: 'stranger@webflow.com',
        sub: 'cf-stranger',
      }),
    });
    cookieStore.set('spark_manager_slack_id', {
      name: 'spark_manager_slack_id',
      value: 'UCOOKIE1',
    });
    const ctx = makeTestCtx({env: {DEMO_MANAGER_SLACK_ID: 'UENV01'}});

    const {getManagerSession} = await import('../lib/session');
    const session = await getManagerSession(ctx);

    expect(session).toBeNull();
  });

  it('falls back to cookie when no CF Access JWT is present', async () => {
    cookieStore.set('spark_manager_slack_id', {
      name: 'spark_manager_slack_id',
      value: 'UCOOKIE1',
    });
    const ctx = makeTestCtx();

    const {getManagerSession} = await import('../lib/session');
    const session = await getManagerSession(ctx);

    expect(session).toEqual({managerSlackId: 'UCOOKIE1', source: 'cookie'});
  });

  it('falls back to DEMO_MANAGER_SLACK_ID when no JWT and no cookie', async () => {
    const ctx = makeTestCtx({env: {DEMO_MANAGER_SLACK_ID: 'UENV01'}});

    const {getManagerSession} = await import('../lib/session');
    const session = await getManagerSession(ctx);

    expect(session).toEqual({managerSlackId: 'UENV01', source: 'env'});
  });

  it('returns null when no source produces a usable id', async () => {
    const ctx = makeTestCtx();
    // TEST_ENV ships with a demo id so makeTestCtx-produced envs
    // always have something to fall back to. Strip it for this case.
    (ctx.env as Record<string, unknown>).DEMO_MANAGER_SLACK_ID = undefined;

    const {getManagerSession} = await import('../lib/session');
    const session = await getManagerSession(ctx);

    expect(session).toBeNull();
  });

  it('ignores invalid Slack ids in the cookie', async () => {
    cookieStore.set('spark_manager_slack_id', {
      name: 'spark_manager_slack_id',
      value: 'not-a-slack-id',
    });
    const ctx = makeTestCtx({env: {DEMO_MANAGER_SLACK_ID: 'UFALLBACK'}});

    const {getManagerSession} = await import('../lib/session');
    const session = await getManagerSession(ctx);

    expect(session).toEqual({managerSlackId: 'UFALLBACK', source: 'env'});
  });
});

describe('requireManagerSession', () => {
  beforeEach(() => {
    headersRef.value = new Headers();
    cookieStore.clear();
  });

  it('throws a 401 Response when no session is available', async () => {
    const ctx = makeTestCtx();
    (ctx.env as Record<string, unknown>).DEMO_MANAGER_SLACK_ID = undefined;

    const {requireManagerSession} = await import('../lib/session');
    await expect(requireManagerSession(ctx)).rejects.toBeInstanceOf(Response);
  });
});

describe('getSessionDetails diagnostic', () => {
  beforeEach(() => {
    headersRef.value = new Headers();
    cookieStore.clear();
  });

  it('surfaces slackLookup=user-not-found when CF Access email is unknown to Slack', async () => {
    headersRef.value = new Headers({
      'Cf-Access-Jwt-Assertion': makeJwt({
        email: 'ghost@webflow.com',
        sub: 'cf-ghost',
      }),
    });
    const ctx = makeTestCtx(); // no usersLookupByEmail override → ok:false

    const {getSessionDetails} = await import('../lib/session');
    const result = await getSessionDetails(ctx);

    expect(result.session).toBeNull();
    expect(result.access.hasAccessHeader).toBe(true);
    expect(result.access.email).toBe('ghost@webflow.com');
    expect(result.access.slackLookup).toBe('user-not-found');
  });

  it('surfaces slackLookup=api-error for non-users_not_found Slack errors', async () => {
    headersRef.value = new Headers({
      'Cf-Access-Jwt-Assertion': makeJwt({
        email: 'javon@webflow.com',
        sub: 'cf-javon',
      }),
    });
    const ctx = makeTestCtx({
      slack: {
        usersLookupByEmail: {},
      },
    });
    // Force the exact error we saw from Slack when the transport was wrong.
    ctx.slack.users.lookupByEmail = async () => ({
      ok: false,
      error: 'invalid_arguments',
    });

    const {getSessionDetails} = await import('../lib/session');
    const result = await getSessionDetails(ctx);

    expect(result.session).toBeNull();
    expect(result.access.email).toBe('javon@webflow.com');
    expect(result.access.slackLookup).toBe('api-error');
    expect(result.access.slackLookupError).toBe('invalid_arguments');
  });

  it('surfaces slackLookup=ok and resolved session on the happy path', async () => {
    headersRef.value = new Headers({
      'Cf-Access-Jwt-Assertion': makeJwt({
        email: 'javon@webflow.com',
        sub: 'cf-javon',
      }),
    });
    const ctx = makeTestCtx({
      slack: {
        usersLookupByEmail: {
          'javon@webflow.com': {
            id: 'U12345',
            real_name: 'Javon McGilberry',
            profile: {email: 'javon@webflow.com'},
          },
        },
      },
    });

    const {getSessionDetails} = await import('../lib/session');
    const result = await getSessionDetails(ctx);

    expect(result.session).toEqual({
      managerSlackId: 'U12345',
      email: 'javon@webflow.com',
      source: 'cloudflare-access',
    });
    expect(result.access.slackLookup).toBe('ok');
  });

  it('reports hasAccessHeader=false when no CF Access signal is present', async () => {
    const ctx = makeTestCtx();
    (ctx.env as Record<string, unknown>).DEMO_MANAGER_SLACK_ID = undefined;

    const {getSessionDetails} = await import('../lib/session');
    const result = await getSessionDetails(ctx);

    expect(result.session).toBeNull();
    expect(result.access.hasAccessHeader).toBe(false);
    expect(result.access.hasAccessCookie).toBe(false);
    expect(result.access.slackLookup).toBe('not-attempted');
  });
});
