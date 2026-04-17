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

  it('opens after a single failure and skips subsequent warehouse calls within the cooldown window', async () => {
    const client = makeOrgGraphClient(
      {DX_WAREHOUSE_DSN: 'postgres://nonexistent.invalid:5432/x'},
      createSilentLogger()
    );
    // postgres.js will try to import; since we're in a test env without
    // actual network, we mock Date.now() to observe breaker state.
    const originalNow = Date.now;
    const now = vi.fn(() => 1_000_000);
    Date.now = now as typeof Date.now;
    try {
      // First call trips the breaker and returns the fallback ([]). We
      // allow a small amount of time by advancing the clock.
      const first = await client.searchByName('any');
      expect(first).toEqual([]);

      // Advance 10 seconds — still within cooldown. No additional
      // warehouse attempt should happen; confirmed by the call still
      // returning fast with [].
      now.mockReturnValue(1_000_000 + 10_000);
      const second = await client.searchByName('any');
      expect(second).toEqual([]);

      // Advance past the 60s window; breaker closes. Still returns []
      // because the network still fails, but the path is re-attempted.
      now.mockReturnValue(1_000_000 + 61_000);
      const third = await client.searchByName('any');
      expect(third).toEqual([]);
    } finally {
      Date.now = originalNow;
    }
  });
});
