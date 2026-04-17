import {describe, expect, it} from 'vitest';
import {makeTestCtx} from '../helpers/makeTestCtx';
import {
  primeDirectoryForTests,
  searchUsers,
} from '../../lib/services/slackUserDirectory';

describe('slackUserDirectory', () => {
  it('returns prefix matches with highest score first', async () => {
    const ctx = makeTestCtx();
    primeDirectoryForTests(ctx, [
      {
        slackUserId: 'UALICE',
        name: 'Alice Adams',
        displayName: 'alice',
        email: 'alice@example.com',
      },
      {
        slackUserId: 'UAHMAD',
        name: 'Ahmad Cohen',
        displayName: 'ahmad',
        email: 'ahmad@example.com',
      },
      {
        slackUserId: 'UBOB',
        name: 'Bob Alder',
        displayName: 'bob',
        email: 'bob@example.com',
      },
    ]);

    const results = await searchUsers(ctx, 'al');
    expect(results.map((r) => r.slackUserId)).toEqual(['UALICE', 'UBOB']);
  });

  it('empty query returns alphabetical slice', async () => {
    const ctx = makeTestCtx();
    primeDirectoryForTests(ctx, [
      {slackUserId: 'UB', name: 'Bee', displayName: 'bee'},
      {slackUserId: 'UA', name: 'Ann', displayName: 'ann'},
    ]);
    const results = await searchUsers(ctx, '', 5);
    expect(results.map((r) => r.slackUserId)).toEqual(['UB', 'UA']);
  });
});
