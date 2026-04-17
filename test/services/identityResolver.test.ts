import {describe, expect, it} from 'vitest';
import {makeTestCtx} from '../helpers/makeTestCtx';
import {
  resolveFromSlack,
  resolveFromEmail,
} from '../../lib/services/identityResolver';

describe('identityResolver', () => {
  it('resolves a profile from a Slack id, using custom fields for team/pillar/manager', async () => {
    const ctx = makeTestCtx({
      slack: {
        usersInfo: {
          UHIRE001: {
            id: 'UHIRE001',
            real_name: 'Hira Test',
            profile: {
              first_name: 'Hira',
              real_name: 'Hira Test',
              display_name: 'hira',
              email: 'hira@webflow.com',
              title: 'Senior Frontend Engineer',
              image_192: 'https://img/192.png',
            },
          },
          UMANAGER1: {
            id: 'UMANAGER1',
            real_name: 'Mia Manager',
            profile: {
              first_name: 'Mia',
              real_name: 'Mia Manager',
              display_name: 'mia',
              email: 'mia@webflow.com',
              title: 'Engineering Manager',
            },
          },
        },
        usersProfileGet: {
          UHIRE001: {
            fields: {
              F_TEAM: {value: 'Frontend Platform'},
              F_DIVISION: {value: 'Platform'},
              F_MANAGER: {value: '<@UMANAGER1>', alt: 'Mia Manager'},
            },
          },
        },
        teamProfileFields: [
          {id: 'F_TEAM', label: 'Team'},
          {id: 'F_DIVISION', label: 'Division'},
          {id: 'F_MANAGER', label: 'Manager'},
        ],
      },
      github: {
        configured: true,
        codeowners:
          '/packages/systems/spring/ @webflow/design-system\n/entrypoints/server/ @webflow/backend-platform\n',
      },
      confluence: {
        configured: true,
        baseUrl: 'https://webflow.atlassian.net/wiki',
      },
    });

    const profile = await resolveFromSlack(ctx, 'UHIRE001');
    expect(profile.userId).toBe('UHIRE001');
    expect(profile.firstName).toBe('Hira');
    expect(profile.displayName).toBe('hira');
    expect(profile.email).toBe('hira@webflow.com');
    expect(profile.teamName).toBe('Frontend Platform');
    expect(profile.pillarName).toBe('Platform');
    expect(profile.roleTrack).toBe('frontend');
    // Display name is preferred over real_name when both are present.
    expect(profile.manager.name.toLowerCase()).toContain('mia');
    expect(profile.manager.slackUserId).toBe('UMANAGER1');
    expect(profile.docs.length).toBeGreaterThan(0);
  });

  it('falls back to Department when the Slack workspace has no Team field', async () => {
    const ctx = makeTestCtx({
      slack: {
        usersInfo: {
          UHIRE001: {
            id: 'UHIRE001',
            real_name: 'Hira Test',
            profile: {
              first_name: 'Hira',
              real_name: 'Hira Test',
              display_name: 'hira',
              email: 'hira@webflow.com',
              title: 'Software Engineer',
            },
          },
          UMANAGER1: {
            id: 'UMANAGER1',
            real_name: 'Mia Manager',
            profile: {
              first_name: 'Mia',
              real_name: 'Mia Manager',
              display_name: 'mia',
              email: 'mia@webflow.com',
              title: 'Engineering Manager',
            },
          },
        },
        usersProfileGet: {
          UHIRE001: {
            fields: {
              F_DEPARTMENT: {value: '1500 Engineering Team'},
              F_DIVISION: {value: 'Collaboration'},
              F_MANAGER: {value: '<@UMANAGER1>', alt: 'Mia Manager'},
            },
          },
        },
        teamProfileFields: [
          {id: 'F_DEPARTMENT', label: 'Department'},
          {id: 'F_DIVISION', label: 'Division'},
          {id: 'F_MANAGER', label: 'Manager'},
        ],
      },
      github: {configured: false, codeowners: null},
    });

    const profile = await resolveFromSlack(ctx, 'UHIRE001');

    expect(profile.teamName).toBe('Engineering');
    expect(profile.pillarName).toBe('Collaboration');
    expect(profile.manager.slackUserId).toBe('UMANAGER1');
  });

  it('falls back to email-derived display name when Slack lookup misses', async () => {
    const ctx = makeTestCtx({
      slack: {}, // no usersLookupByEmail → returns ok:false
      github: {configured: false, codeowners: null},
    });
    const profile = await resolveFromEmail(ctx, 'unknown@webflow.com');
    expect(profile.teamName).toBe('Engineering');
    expect(profile.displayName).toBe('unknown');
    expect(profile.firstName).toBe('unknown');
  });

  it('prefers the resolved Slack user id when email lookup succeeds', async () => {
    const ctx = makeTestCtx({
      slack: {
        usersLookupByEmail: {
          'alice@webflow.com': {
            id: 'UHIRE001',
            real_name: 'Alice Adams',
            profile: {
              first_name: 'Alice',
              display_name: 'alice',
              email: 'alice@webflow.com',
              title: 'Software Engineer',
            },
          },
        },
        usersInfo: {
          UHIRE001: {
            id: 'UHIRE001',
            real_name: 'Alice Adams',
            profile: {
              first_name: 'Alice',
              display_name: 'alice',
              email: 'alice@webflow.com',
            },
          },
        },
      },
      github: {configured: false, codeowners: null},
    });

    const profile = await resolveFromEmail(ctx, 'alice@webflow.com');

    expect(profile.userId).toBe('UHIRE001');
    expect(profile.email).toBe('alice@webflow.com');
  });

  it('caches by Slack id across back-to-back calls', async () => {
    const ctx = makeTestCtx({
      slack: {
        usersInfo: {
          UHIRE001: {
            id: 'UHIRE001',
            profile: {display_name: 'hira', email: 'hira@webflow.com'},
          },
        },
      },
    });
    await resolveFromSlack(ctx, 'UHIRE001');
    const callCountBefore = ctx.slack._calls?.length ?? 0;
    await resolveFromSlack(ctx, 'UHIRE001');
    const callCountAfter = ctx.slack._calls?.length ?? 0;
    expect(callCountAfter).toBe(callCountBefore);
  });
});
