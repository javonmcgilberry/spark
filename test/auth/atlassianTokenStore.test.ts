import {describe, expect, it} from 'vitest';
import {
  makeMemoryAtlassianTokenStore,
  type AtlassianTokenRecord,
} from '../../lib/auth/atlassianTokenStore';

function record(
  overrides: Partial<AtlassianTokenRecord> = {}
): AtlassianTokenRecord {
  const now = 1_700_000_000_000;
  return {
    userEmail: 'viewer@webflow.com',
    accessToken: 'at',
    refreshToken: 'rt',
    cloudId: 'cloud-1',
    cloudUrl: 'https://webflow.atlassian.net',
    cloudName: 'Webflow',
    scope: 'read:jira-work offline_access',
    expiresAt: now + 3_600_000,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('makeMemoryAtlassianTokenStore', () => {
  it('roundtrips save → get → delete', async () => {
    const store = makeMemoryAtlassianTokenStore();
    expect(await store.get('viewer@webflow.com')).toBeNull();
    await store.save(record());
    expect(await store.get('viewer@webflow.com')).toEqual(record());
    await store.delete('viewer@webflow.com');
    expect(await store.get('viewer@webflow.com')).toBeNull();
  });

  it('save upserts when the same email is used twice', async () => {
    const store = makeMemoryAtlassianTokenStore();
    await store.save(record({accessToken: 'first'}));
    await store.save(
      record({accessToken: 'second', updatedAt: 1_700_000_005_000})
    );
    const stored = await store.get('viewer@webflow.com');
    expect(stored?.accessToken).toBe('second');
    expect(stored?.updatedAt).toBe(1_700_000_005_000);
  });

  it('keeps records keyed per user email', async () => {
    const store = makeMemoryAtlassianTokenStore();
    await store.save(
      record({userEmail: 'a@webflow.com', accessToken: 'a-token'})
    );
    await store.save(
      record({userEmail: 'b@webflow.com', accessToken: 'b-token'})
    );
    expect((await store.get('a@webflow.com'))?.accessToken).toBe('a-token');
    expect((await store.get('b@webflow.com'))?.accessToken).toBe('b-token');
  });
});
