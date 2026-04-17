import {describe, expect, it, vi, beforeEach} from 'vitest';
import {postSignedEvent, postUnsignedEvent} from '../helpers/postSignedEvent';
import {makeTestCtx} from '../helpers/makeTestCtx';
import urlVerification from '../fixtures/slack-events/url-verification.json';
import appHomeOpened from '../fixtures/slack-events/app-home-opened.json';
import type {HandlerCtx} from '../../lib/ctx';

// Shared slot the mocked buildRouteCtx reads from.
const ref = vi.hoisted(() => ({
  ctx: null as HandlerCtx | null,
}));

vi.mock('../../lib/routeCtx', () => ({
  buildRouteCtx: vi.fn(async () => ({
    ctx: ref.ctx,
    env: {SLACK_SIGNING_SECRET: 'test-signing-secret'} as CloudflareEnv,
  })),
  buildManagerCtx: vi.fn(async () => ({
    ctx: ref.ctx,
    env: {SLACK_SIGNING_SECRET: 'test-signing-secret'} as CloudflareEnv,
    session: {managerSlackId: 'UMGR', source: 'env' as const},
  })),
  handleRouteError: (error: unknown) => {
    const message = error instanceof Error ? error.message : 'err';
    return new Response(JSON.stringify({error: message}), {status: 500});
  },
}));

beforeEach(() => {
  ref.ctx = makeTestCtx({
    slack: {
      usersInfo: {
        UHIRE0001: {
          id: 'UHIRE0001',
          profile: {first_name: 'New', display_name: 'newhire'},
        },
      },
    },
  });
});

describe('POST /api/slack/events', () => {
  it('responds to url_verification with the challenge', async () => {
    const {POST} = await import('../../app/api/slack/events/route');
    const req = await postSignedEvent(urlVerification, {
      secret: 'test-signing-secret',
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {challenge: string};
    expect(body.challenge).toBe(
      (urlVerification as {challenge: string}).challenge
    );
  });

  it('rejects an unsigned request', async () => {
    const {POST} = await import('../../app/api/slack/events/route');
    const res = await POST(postUnsignedEvent(urlVerification));
    expect(res.status).toBe(401);
  });

  it('rejects a request signed with a wrong secret', async () => {
    const {POST} = await import('../../app/api/slack/events/route');
    const req = await postSignedEvent(urlVerification, {
      secret: 'not-the-right-secret',
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('bypasses signature check in dev-sandbox mode and returns recorded calls', async () => {
    const {POST} = await import('../../app/api/slack/events/route');
    const req = await postSignedEvent(appHomeOpened, {devSandbox: true});
    const res = await POST(req);
    expect(res.status).toBe(200);
    const header = res.headers.get('x-spark-slack-calls');
    expect(header).toBeTruthy();
    const parsed = JSON.parse(header!) as Array<{method: string}>;
    expect(parsed.some((c) => c.method === 'views.publish')).toBe(true);
  });
});
