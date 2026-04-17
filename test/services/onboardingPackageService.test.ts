import {describe, expect, it} from 'vitest';
import type {TeamProfile} from '../../src/onboarding/types.js';
import {createTestServices} from '../helpers/createTestServices.js';

function cloneProfileWithUserId(
  profile: TeamProfile,
  userId: string,
  buddySlackId: string
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
      services.onboardingPackages.getPackagesWhereBuddyIs('U_UNRELATED')
    ).toEqual([]);
  });
});

describe('OnboardingPackageService.listDraftsForManager', () => {
  it('returns drafts the manager created, manages, or reviews', async () => {
    const {profile, services} = createTestServices();
    const managerUserId = profile.manager.slackUserId!;
    const otherManagerUserId = 'U_OTHER_MGR';

    const hireA = cloneProfileWithUserId(profile, 'U_HIRE_A', 'U_BUDDY_A');
    const hireB = cloneProfileWithUserId(profile, 'U_HIRE_B', 'U_BUDDY_B');

    await services.onboardingPackages.createDraftPackage({
      profile: hireA,
      createdByUserId: managerUserId,
    });
    await services.onboardingPackages.createDraftPackage({
      profile: hireB,
      createdByUserId: otherManagerUserId,
      stakeholderUserIds: [managerUserId],
    });

    const drafts =
      services.onboardingPackages.listDraftsForManager(managerUserId);
    const draftUserIds = drafts.map((pkg) => pkg.userId).sort();

    expect(draftUserIds).toEqual(['U_HIRE_A', 'U_HIRE_B']);
  });

  it('excludes published packages', async () => {
    const {profile, services} = createTestServices();
    const managerUserId = profile.manager.slackUserId!;

    const hireA = cloneProfileWithUserId(profile, 'U_HIRE_A', 'U_BUDDY_A');
    const hireB = cloneProfileWithUserId(profile, 'U_HIRE_B', 'U_BUDDY_B');

    await services.onboardingPackages.createDraftPackage({
      profile: hireA,
      createdByUserId: managerUserId,
    });
    await services.onboardingPackages.createDraftPackage({
      profile: hireB,
      createdByUserId: managerUserId,
    });

    services.onboardingPackages.publishPackage(hireA.userId, managerUserId);

    const drafts =
      services.onboardingPackages.listDraftsForManager(managerUserId);
    const draftUserIds = drafts.map((pkg) => pkg.userId);

    expect(draftUserIds).toEqual(['U_HIRE_B']);
  });
});

describe('OnboardingPackageService.applyFieldPatch', () => {
  it('merges welcomeNote, buddy, stakeholders, and custom checklist items', async () => {
    const {profile, services} = createTestServices();
    const managerUserId = profile.manager.slackUserId!;
    const hire = cloneProfileWithUserId(profile, 'U_HIRE_PATCH', 'U_BUDDY_OLD');

    await services.onboardingPackages.createDraftPackage({
      profile: hire,
      createdByUserId: managerUserId,
    });

    const patched = services.onboardingPackages.applyFieldPatch(hire.userId, {
      welcomeNote: 'Welcome! So glad to have you.',
      buddyUserId: 'U_BUDDY_NEW',
      stakeholderUserIds: ['U_PM', 'U_DESIGN'],
      customChecklistItems: [
        {
          label: 'Shadow first on-call rotation',
          kind: 'task',
          notes: 'Pair with the on-call this week',
          sectionId: 'week-3',
        },
      ],
    });

    expect(patched).toBeDefined();
    expect(patched?.welcomeNote).toBe('Welcome! So glad to have you.');
    expect(patched?.sections.welcome.personalizedNote).toBe(
      'Welcome! So glad to have you.'
    );
    expect(patched?.buddyUserId).toBe('U_BUDDY_NEW');
    expect(patched?.reviewerUserIds).toEqual(
      expect.arrayContaining(['U_PM', 'U_DESIGN', managerUserId])
    );
    expect(patched?.customChecklistItems).toHaveLength(1);
    expect(patched?.customChecklistItems?.[0].label).toBe(
      'Shadow first on-call rotation'
    );
  });

  it('only updates fields that are present in the patch', async () => {
    const {profile, services} = createTestServices();
    const managerUserId = profile.manager.slackUserId!;
    const hire = cloneProfileWithUserId(profile, 'U_HIRE_PARTIAL', 'U_BUDDY');

    await services.onboardingPackages.createDraftPackage({
      profile: hire,
      createdByUserId: managerUserId,
      welcomeNote: 'Original welcome',
    });

    const patched = services.onboardingPackages.applyFieldPatch(hire.userId, {
      buddyUserId: 'U_BUDDY_NEW',
    });

    expect(patched?.welcomeNote).toBe('Original welcome');
    expect(patched?.buddyUserId).toBe('U_BUDDY_NEW');
  });

  it('returns undefined for unknown drafts', () => {
    const {services} = createTestServices();
    const result = services.onboardingPackages.applyFieldPatch('U_UNKNOWN', {
      welcomeNote: 'nope',
    });
    expect(result).toBeUndefined();
  });

  it('refuses to patch already-published packages', async () => {
    const {profile, services} = createTestServices();
    const managerUserId = profile.manager.slackUserId!;
    const hire = cloneProfileWithUserId(profile, 'U_HIRE_PUBLISHED', 'U_BUDDY');

    await services.onboardingPackages.createDraftPackage({
      profile: hire,
      createdByUserId: managerUserId,
    });
    services.onboardingPackages.publishPackage(hire.userId, managerUserId);

    const result = services.onboardingPackages.applyFieldPatch(hire.userId, {
      welcomeNote: 'too late',
    });

    expect(result).toBeUndefined();
  });
});
