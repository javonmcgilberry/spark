import {beforeEach, describe, expect, it, vi} from 'vitest';
import {
  makeOrgGraphClient,
  makeStubOrgGraph,
  type OrgPerson,
} from '../../lib/services/orgGraph';
import {createSilentLogger} from '../../lib/logger';

const hire: OrgPerson = {
  name: 'Hira Test',
  email: 'hira@webflow.com',
  title: 'Senior Frontend Engineer',
  teamName: 'Frontend Platform',
  pillarName: 'Collaboration',
  managerEmail: 'bob@webflow.com',
  source: 'warehouse',
  role: 'teammate',
};

describe('makeOrgGraphClient', () => {
  it('reports unconfigured when DX_WAREHOUSE_DSN is absent', () => {
    const client = makeOrgGraphClient({}, createSilentLogger());
    expect(client.isConfigured()).toBe(false);
  });

  it('returns degraded no-op results when unconfigured so callers can fall back', async () => {
    const client = makeOrgGraphClient({}, createSilentLogger());
    await expect(
      client.lookupByEmail('anyone@webflow.com')
    ).resolves.toBeNull();
    await expect(client.lookupTeammates('Platform')).resolves.toEqual([]);
    await expect(client.lookupCrossFunctional('Platform')).resolves.toEqual({});
    await expect(
      client.lookupManagerChain('anyone@webflow.com')
    ).resolves.toEqual([]);
  });
});

describe('makeStubOrgGraph', () => {
  it('resolves byEmail, teammates, cross-functional, and manager chain', async () => {
    const buddy: OrgPerson = {
      ...hire,
      name: 'Nadia Zeng',
      email: 'nadia@webflow.com',
      role: 'teammate',
    };
    const pm: OrgPerson = {
      ...hire,
      name: 'Cari Bonilla',
      email: 'cari@webflow.com',
      title: 'Senior Product Manager',
      role: 'pm',
    };
    const director: OrgPerson = {
      ...hire,
      name: 'Dina Director',
      email: 'dina@webflow.com',
      title: 'Director, Engineering',
      role: 'manager-chain',
    };
    const stub = makeStubOrgGraph({
      byEmail: {'hira@webflow.com': hire},
      teammates: {'Frontend Platform': [hire, buddy]},
      crossFunctional: {'Frontend Platform': {pm, director}},
      managerChain: {'hira@webflow.com': [director]},
    });

    expect(stub.isConfigured()).toBe(true);
    expect(await stub.lookupByEmail('HIRA@webflow.com')).toEqual(hire);

    const teammates = await stub.lookupTeammates(
      'Frontend Platform',
      'hira@webflow.com'
    );
    expect(teammates.map((person) => person.email)).toEqual([
      'nadia@webflow.com',
    ]);

    const crossFunc = await stub.lookupCrossFunctional('Frontend Platform');
    expect(crossFunc.pm?.email).toBe('cari@webflow.com');
    expect(crossFunc.director?.email).toBe('dina@webflow.com');

    const chain = await stub.lookupManagerChain('hira@webflow.com');
    expect(chain.map((person) => person.email)).toEqual(['dina@webflow.com']);
  });

  it('supports configured=false to simulate an unreachable warehouse in tests', async () => {
    const stub = makeStubOrgGraph({configured: false});
    expect(stub.isConfigured()).toBe(false);
    expect(await stub.lookupTeammates('Platform')).toEqual([]);
  });

  it('searchByName filters the pool case-insensitively by name and email', async () => {
    const stub = makeStubOrgGraph({
      searchPool: [
        {
          name: 'Akshar Patel',
          email: 'akshar@webflow.com',
          source: 'warehouse',
          role: 'teammate',
        },
        {
          name: 'HaoZhe Li',
          email: 'haozhe@webflow.com',
          source: 'warehouse',
          role: 'teammate',
        },
      ],
    });
    const byName = await stub.searchByName('AK');
    expect(byName.map((p) => p.email)).toEqual(['akshar@webflow.com']);
    const byEmail = await stub.searchByName('haozhe');
    expect(byEmail.map((p) => p.email)).toEqual(['haozhe@webflow.com']);
  });
});

describe('makeOrgGraphClient circuit breaker', () => {
  // Reset the module-scoped breaker between cases — it lives on
  // globalThis so it persists across fresh client instances.
  beforeEach(() => {
    const breaker = (
      globalThis as unknown as Record<symbol, {openUntil: number}>
    )[Symbol.for('spark.orgGraph.breaker')];
    if (breaker) breaker.openUntil = 0;
  });

  it('searchByName throws on failure so the picker falls back to Slack instead of serving a false empty', async () => {
    // searchByName MUST throw rather than return [] when the warehouse
    // is unreachable. The picker treats [] as an authoritative
    // "no matches" and skips the Slack fallback — so silently
    // swallowing errors would make the picker return zero results
    // across the whole workspace for the breaker cooldown window.
    const client = makeOrgGraphClient(
      {DX_WAREHOUSE_DSN: 'postgres://nonexistent.invalid:5432/x'},
      createSilentLogger()
    );
    const originalNow = Date.now;
    const now = vi.fn(() => 1_000_000);
    Date.now = now as typeof Date.now;
    try {
      // First call attempts to connect, fails, trips the breaker, throws.
      await expect(client.searchByName('any')).rejects.toThrow();

      // Inside the cooldown window, subsequent calls short-circuit on
      // the breaker and still throw (so picker falls back immediately
      // instead of paying another connect timeout).
      now.mockReturnValue(1_000_000 + 10_000);
      await expect(client.searchByName('any')).rejects.toThrow(/breaker open/);

      // After the cooldown, the path is re-attempted. Still throws
      // because the network is still bad in this test environment.
      now.mockReturnValue(1_000_000 + 61_000);
      await expect(client.searchByName('any')).rejects.toThrow();
    } finally {
      Date.now = originalNow;
    }
  });

  it('identityResolver callers (lookupTeammates etc.) keep the silent-fallback semantic so they degrade to Slack inside a try', async () => {
    // lookupTeammates / lookupCrossFunctional / lookupManagerChain
    // resolve to empty collections on failure. identityResolver
    // catches around them, sees the empty result, and switches to
    // the Slack fallback roster builder. If any of them threw, a
    // one-off hiccup would blow up draft creation.
    const client = makeOrgGraphClient(
      {DX_WAREHOUSE_DSN: 'postgres://nonexistent.invalid:5432/x'},
      createSilentLogger()
    );
    // First hit fails quietly.
    await expect(client.lookupTeammates('Platform')).resolves.toEqual([]);
    await expect(client.lookupCrossFunctional('Platform')).resolves.toEqual({});
    await expect(client.lookupManagerChain('x@y.com')).resolves.toEqual([]);
  });
});
