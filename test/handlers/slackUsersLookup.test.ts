import {describe, expect, it} from 'vitest';
import {handleLookupSlackUsers} from '../../lib/handlers/lookup/slackUsers';
import {primeDirectoryForTests} from '../../lib/services/slackUserDirectory';
import type {OrgPerson} from '../../lib/services/orgGraph';
import {makeTestCtx} from '../helpers/makeTestCtx';

const session = {managerSlackId: 'UMANAGER1', source: 'env' as const};

function makeRequest(q: string, limit?: number): Request {
  const url = new URL('https://test.local/api/lookup/slack-users');
  url.searchParams.set('q', q);
  if (limit !== undefined) url.searchParams.set('limit', String(limit));
  return new Request(url);
}

describe('handleLookupSlackUsers', () => {
  it('uses the warehouse as the fast path and hydrates Slack identity via users.lookupByEmail', async () => {
    const warehousePerson = (name: string, email: string): OrgPerson => ({
      name,
      email,
      title: 'Senior Software Engineer',
      source: 'warehouse',
      role: 'teammate',
    });
    const ctx = makeTestCtx({
      org: {
        configured: true,
        searchPool: [
          warehousePerson('Akshar Patel', 'akshar@webflow.com'),
          warehousePerson('Aksel Hansen', 'aksel@webflow.com'),
          warehousePerson('HaoZhe Li', 'haozhe@webflow.com'),
        ],
      },
      slack: {
        usersLookupByEmail: {
          'akshar@webflow.com': {
            id: 'UAKSHAR',
            real_name: 'Akshar Patel',
            profile: {
              display_name: 'akshar',
              email: 'akshar@webflow.com',
              title: 'Senior Software Engineer',
              image_192: 'https://img/akshar.png',
            },
          },
          'aksel@webflow.com': {
            id: 'UAKSEL',
            real_name: 'Aksel Hansen',
            profile: {
              display_name: 'aksel',
              email: 'aksel@webflow.com',
              title: 'Software Engineer',
            },
          },
        },
      },
    });

    const res = await handleLookupSlackUsers(makeRequest('ak'), ctx, session);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      users: Array<{slackUserId: string; name: string; avatarUrl?: string}>;
      partial: boolean;
    };
    expect(body.partial).toBe(false);
    // Both "ak" matches hydrated; HaoZhe filtered out server-side by the
    // warehouse query before we hit Slack at all.
    expect(body.users.map((u) => u.slackUserId).sort()).toEqual([
      'UAKSEL',
      'UAKSHAR',
    ]);
    const akshar = body.users.find((u) => u.slackUserId === 'UAKSHAR');
    expect(akshar?.avatarUrl).toBe('https://img/akshar.png');
  });

  it('drops warehouse rows whose email does not resolve in Slack', async () => {
    const ctx = makeTestCtx({
      org: {
        configured: true,
        searchPool: [
          {
            name: 'Ghost User',
            email: 'ghost@webflow.com',
            source: 'warehouse',
            role: 'teammate',
          },
          {
            name: 'Akshar Patel',
            email: 'akshar@webflow.com',
            source: 'warehouse',
            role: 'teammate',
          },
        ],
      },
      slack: {
        usersLookupByEmail: {
          'akshar@webflow.com': {
            id: 'UAKSHAR',
            profile: {display_name: 'akshar', email: 'akshar@webflow.com'},
          },
          // ghost@webflow.com intentionally missing so lookupByEmail returns ok:false
        },
      },
    });

    const res = await handleLookupSlackUsers(makeRequest('a'), ctx, session);
    const body = (await res.json()) as {users: Array<{slackUserId: string}>};
    expect(body.users.map((u) => u.slackUserId)).toEqual(['UAKSHAR']);
  });

  it('falls back to the Slack directory search when the warehouse is unconfigured', async () => {
    const ctx = makeTestCtx({
      org: {configured: false},
    });
    primeDirectoryForTests(ctx, [
      {
        slackUserId: 'UAKSHAR',
        name: 'Akshar Patel',
        displayName: 'akshar',
        email: 'akshar@webflow.com',
        title: 'Senior Software Engineer',
      },
    ]);

    const res = await handleLookupSlackUsers(
      makeRequest('akshar'),
      ctx,
      session
    );
    const body = (await res.json()) as {users: Array<{slackUserId: string}>};
    expect(body.users.map((u) => u.slackUserId)).toEqual(['UAKSHAR']);
  });

  it('falls back to the Slack directory when the warehouse returns no matches', async () => {
    const ctx = makeTestCtx({
      org: {
        configured: true,
        // Empty search pool — warehouse path returns [], handler falls through.
        searchPool: [],
      },
    });
    primeDirectoryForTests(ctx, [
      {
        slackUserId: 'UAKSHAR',
        name: 'Akshar Patel',
        displayName: 'akshar',
        email: 'akshar@webflow.com',
      },
    ]);

    const res = await handleLookupSlackUsers(makeRequest('ak'), ctx, session);
    const body = (await res.json()) as {users: Array<{slackUserId: string}>};
    expect(body.users.map((u) => u.slackUserId)).toEqual(['UAKSHAR']);
  });
});
