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

  it('keeps buddy as a placeholder while building real people-to-meet from Slack', async () => {
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
              title: 'Senior Software Engineer, Frontend',
            },
          },
          UMANAGER1: {
            id: 'UMANAGER1',
            real_name: 'Bob Rose',
            profile: {
              first_name: 'Bob',
              real_name: 'Bob Rose',
              display_name: 'bob',
              email: 'bob@webflow.com',
              title: 'Senior Manager, Engineering',
            },
          },
        },
        usersProfileGet: {
          UHIRE001: {
            fields: {
              F_DEPARTMENT: {value: '1500 Engineering Team'},
              F_DIVISION: {value: 'Collaboration'},
              F_MANAGER: {value: '<@UMANAGER1>', alt: 'Bob Rose'},
            },
          },
          UENG1: {
            fields: {
              F_DEPARTMENT: {value: '1500 Engineering Team'},
              F_DIVISION: {value: 'Collaboration'},
              F_MANAGER: {value: '<@UMANAGER1>', alt: 'Bob Rose'},
            },
          },
          UENG2: {
            fields: {
              F_DEPARTMENT: {value: '1500 Engineering Team'},
              F_DIVISION: {value: 'Collaboration'},
              F_MANAGER: {value: '<@UMANAGER1>', alt: 'Bob Rose'},
            },
          },
          UPM1: {
            fields: {
              F_DEPARTMENT: {value: '1600 Product Team'},
              F_DIVISION: {value: 'Collaboration'},
              F_MANAGER: {value: '<@UPMGR1>', alt: 'Pat Product'},
            },
          },
          UDES1: {
            fields: {
              F_DEPARTMENT: {value: '1700 Design Team'},
              F_DIVISION: {value: 'Collaboration'},
              F_MANAGER: {value: '<@UDESMGR1>', alt: 'Dana Design'},
            },
          },
          UMANAGER1: {
            fields: {
              F_DEPARTMENT: {value: '1500 Engineering Team'},
              F_DIVISION: {value: 'Collaboration'},
              F_MANAGER: {value: '<@UDIR1>', alt: 'Dina Director'},
            },
          },
          UDIR1: {
            fields: {
              F_DEPARTMENT: {value: '1500 Engineering Team'},
              F_DIVISION: {value: 'Collaboration'},
            },
          },
        },
        usersList: [
          {
            id: 'UHIRE001',
            real_name: 'Hira Test',
            profile: {
              real_name: 'Hira Test',
              display_name: 'hira',
              email: 'hira@webflow.com',
              title: 'Senior Software Engineer, Frontend',
            },
          },
          {
            id: 'UENG1',
            real_name: 'Nadia Zeng',
            profile: {
              real_name: 'Nadia Zeng',
              display_name: 'nadia',
              email: 'nadia@webflow.com',
              title: 'Senior Software Engineer, Frontend',
            },
          },
          {
            id: 'UENG2',
            real_name: 'Pawel Mankowski',
            profile: {
              real_name: 'Pawel Mankowski',
              display_name: 'pawel',
              email: 'pawel@webflow.com',
              title: 'Senior Software Engineer, Backend',
            },
          },
          {
            id: 'UPM1',
            real_name: 'Cari Bonilla',
            profile: {
              real_name: 'Cari Bonilla',
              display_name: 'cari',
              email: 'cari@webflow.com',
              title: 'Senior Product Manager',
            },
          },
          {
            id: 'UDES1',
            real_name: 'Charlene Foote',
            profile: {
              real_name: 'Charlene Foote',
              display_name: 'charlene',
              email: 'charlene@webflow.com',
              title: 'Staff Product Designer',
            },
          },
          {
            id: 'UDIR1',
            real_name: 'Dina Director',
            profile: {
              real_name: 'Dina Director',
              display_name: 'dina',
              email: 'dina@webflow.com',
              title: 'Director, Engineering',
            },
          },
          {
            id: 'UPP1',
            real_name: 'Priya Partner',
            profile: {
              real_name: 'Priya Partner',
              display_name: 'priya',
              email: 'priya@webflow.com',
              title: 'Lead People Business Partner',
            },
          },
        ],
        teamProfileFields: [
          {id: 'F_DEPARTMENT', label: 'Department'},
          {id: 'F_DIVISION', label: 'Division'},
          {id: 'F_MANAGER', label: 'Manager'},
        ],
      },
      github: {configured: false, codeowners: null},
    });

    const profile = await resolveFromSlack(ctx, 'UHIRE001');

    expect(profile.buddy.kind).toBe('buddy');
    expect(profile.buddy.slackUserId).toBeUndefined();
    expect(profile.teammates.map((person) => person.slackUserId)).toEqual(
      expect.arrayContaining([
        'UENG1',
        'UENG2',
        'UPM1',
        'UDES1',
        'UDIR1',
        'UPP1',
      ])
    );
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
