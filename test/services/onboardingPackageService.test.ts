import {describe, expect, it} from 'vitest';
import type {TeamProfile} from '../../src/onboarding/types.js';
import {createTestServices} from '../helpers/createTestServices.js';

function cloneProfileWithUserId(
  profile: TeamProfile,
  userId: string,
  buddySlackId: string,
): TeamProfile {
  return {
    ...profile,
    userId,
    buddy: {
      ...profile.buddy,
      slackUserId: buddySlackId,
    },
  };
}

describe('OnboardingPackageService.getPackagesWhereBuddyIs', () => {
  it('returns only published packages whose buddyUserId matches', async () => {
    const {profile, services} = createTestServices();
    const managerUserId = profile.manager.slackUserId!;
    const buddyUserId = 'U_BUDDY_MATCH';
    const otherBuddyUserId = 'U_BUDDY_OTHER';

    const hireA = cloneProfileWithUserId(profile, 'U_HIRE_A', buddyUserId);
    const hireB = cloneProfileWithUserId(profile, 'U_HIRE_B', buddyUserId);
    const hireC = cloneProfileWithUserId(profile, 'U_HIRE_C', otherBuddyUserId);

    await services.onboardingPackages.createDraftPackage({
      profile: hireA,
      createdByUserId: managerUserId,
      buddyUserId,
    });
    await services.onboardingPackages.createDraftPackage({
      profile: hireB,
      createdByUserId: managerUserId,
      buddyUserId,
    });
    await services.onboardingPackages.createDraftPackage({
      profile: hireC,
      createdByUserId: managerUserId,
      buddyUserId: otherBuddyUserId,
    });

    services.onboardingPackages.publishPackage(hireA.userId, managerUserId);
    services.onboardingPackages.publishPackage(hireC.userId, managerUserId);

    const matches =
      services.onboardingPackages.getPackagesWhereBuddyIs(buddyUserId);
    const matchedUserIds = matches.map((pkg) => pkg.userId).sort();

    expect(matchedUserIds).toEqual(['U_HIRE_A']);
    for (const pkg of matches) {
      expect(pkg.status).toBe('published');
      expect(pkg.buddyUserId).toBe(buddyUserId);
    }
  });

  it('returns an empty array when the user is not a buddy on any package', () => {
    const {services} = createTestServices();

    expect(
      services.onboardingPackages.getPackagesWhereBuddyIs('U_UNRELATED'),
    ).toEqual([]);
  });
});
