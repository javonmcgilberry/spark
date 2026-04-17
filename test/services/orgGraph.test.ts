import {describe, expect, it} from 'vitest';
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
});
