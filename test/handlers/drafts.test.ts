import Anthropic from '@anthropic-ai/sdk';
import {describe, expect, it} from 'vitest';
import {makeTestCtx} from '../helpers/makeTestCtx';
import {
  handleCreateDraft,
  handleListDrafts,
} from '../../lib/handlers/drafts/list';
import {handleGenerateDraft} from '../../lib/handlers/drafts/generate';
import {handleGetDraft, handlePatchDraft} from '../../lib/handlers/drafts/byId';
import {handleCritiqueDraft} from '../../lib/handlers/drafts/critique';
import {handleRefreshInsights} from '../../lib/handlers/drafts/refreshInsights';
import type {HandlerCtx} from '../../lib/ctx';

const session = {managerSlackId: 'UMANAGER1', source: 'env' as const};

function jsonRequest(
  body: unknown,
  method: 'POST' | 'PATCH' = 'POST'
): Request {
  return new Request('https://test.local/api/drafts', {
    method,
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
}

function toolUseMessage(name: string, input: unknown): Anthropic.Message {
  return {
    id: `msg_${Math.random().toString(36).slice(2)}`,
    type: 'message',
    role: 'assistant',
    model: 'stub-model',
    content: [
      {
        type: 'tool_use',
        id: `tu_${Math.random().toString(36).slice(2)}`,
        name,
        input,
      } as Anthropic.ToolUseBlock,
    ],
    stop_reason: 'tool_use',
    stop_sequence: null,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      server_tool_use: null,
      service_tier: null,
    },
    container: null,
  } as unknown as Anthropic.Message;
}

async function setupWithDraft(): Promise<HandlerCtx> {
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
  });

  const create = await handleCreateDraft(
    jsonRequest({newHireSlackId: 'UHIRE001'}),
    ctx,
    session
  );
  expect(create.status).toBe(201);
  return ctx;
}

describe('drafts handlers', () => {
  it('create → list → get round-trip', async () => {
    const ctx = await setupWithDraft();

    const list = await handleListDrafts(ctx, session);
    const listed = (await list.json()) as {drafts: Array<{userId: string}>};
    expect(listed.drafts.map((d) => d.userId)).toEqual(['UHIRE001']);

    const getRes = await handleGetDraft(ctx, session, 'UHIRE001');
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as {pkg: {userId: string}};
    expect(getBody.pkg.userId).toBe('UHIRE001');
  });

  it('createDraft applies teamHint to the initial draft profile', async () => {
    const ctx = makeTestCtx({
      slack: {
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
    });

    const res = await handleCreateDraft(
      jsonRequest({
        newHireSlackId: 'UHIRE001',
        teamHint: 'Frontend Platform',
      }),
      ctx,
      session
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      pkg: {sections: {welcome: {intro: string}}};
    };
    expect(body.pkg.sections.welcome.intro).toContain(
      'the Frontend Platform team'
    );
  });

  it('refreshInsights persists ask-me-about blurbs across a later get request', async () => {
    const sourceCtx = makeTestCtx({
      slack: {
        usersInfo: {
          UHIRE001: {
            id: 'UHIRE001',
            real_name: 'Alice Adams',
            profile: {
              first_name: 'Alice',
              display_name: 'alice',
              email: 'alice@webflow.com',
              title: 'Software Engineer',
            },
          },
          UMANAGER1: {
            id: 'UMANAGER1',
            real_name: 'Grace Hopper',
            profile: {
              first_name: 'Grace',
              display_name: 'grace',
              email: 'grace@webflow.com',
              title: 'Engineering Manager',
            },
          },
        },
        usersProfileGet: {
          UHIRE001: {
            fields: {
              F_MANAGER: {value: '<@UMANAGER1>', alt: 'Grace Hopper'},
            },
          },
        },
        teamProfileFields: [{id: 'F_MANAGER', label: 'Manager'}],
      },
      jira: {
        configured: true,
        assignedToEmail: {
          'grace@webflow.com': [
            {
              key: 'WEB-123',
              summary: 'Improve onboarding workflow',
              status: 'In Progress',
              url: 'https://jira.local/browse/WEB-123',
            },
          ],
        },
      },
      github: {
        configured: true,
        openForUser: {
          grace: [
            {
              number: 42,
              title: 'Tighten onboarding defaults',
              url: 'https://github.com/webflow/example/pull/42',
              state: 'open',
              author: 'grace',
              repository: 'webflow/example',
              updatedAt: '2026-04-16T00:00:00.000Z',
              draft: false,
            },
          ],
        },
      },
      llm: {
        defaultText:
          'Ask me about tightening the onboarding workflow and how we smooth the first few weeks for new engineers.',
      },
    });

    const created = await handleCreateDraft(
      jsonRequest({newHireSlackId: 'UHIRE001'}),
      sourceCtx,
      session
    );
    expect(created.status).toBe(201);

    const refreshed = await handleRefreshInsights(
      sourceCtx,
      session,
      'UHIRE001'
    );
    expect(refreshed.status).toBe(200);

    const nextCtx = makeTestCtx({
      db: sourceCtx.db,
      slack: sourceCtx.slack,
      jira: sourceCtx.jira,
      github: sourceCtx.github,
      confluence: sourceCtx.confluence,
      llm: sourceCtx.llm,
    });
    const fetched = await handleGetDraft(nextCtx, session, 'UHIRE001');
    const body = (await fetched.json()) as {
      pkg: {
        sections: {
          peopleToMeet: {
            people: Array<{
              name: string;
              insightsStatus?: string;
              askMeAbout?: string;
            }>;
          };
        };
      };
    };
    const hydrated = body.pkg.sections.peopleToMeet.people.find(
      (person) => person.askMeAbout
    );
    expect(hydrated?.insightsStatus).toBe('ready');
    expect(hydrated?.askMeAbout).toContain('Ask me about');
  });

  it('generateDraft persists peopleToMeet but ignores generated buddy assignment', async () => {
    const ctx = makeTestCtx({
      slack: {
        usersInfo: {
          UHIRE001: {
            id: 'UHIRE001',
            real_name: 'Alice Adams',
            profile: {
              first_name: 'Alice',
              display_name: 'alice',
              email: 'alice@webflow.com',
              title: 'Software Engineer',
            },
          },
          UMANAGER1: {
            id: 'UMANAGER1',
            real_name: 'Grace Hopper',
            profile: {
              first_name: 'Grace',
              display_name: 'grace',
              email: 'grace@webflow.com',
              title: 'Engineering Manager',
            },
          },
        },
        usersProfileGet: {
          UHIRE001: {
            fields: {
              F_MANAGER: {value: '<@UMANAGER1>', alt: 'Grace Hopper'},
            },
          },
        },
        teamProfileFields: [{id: 'F_MANAGER', label: 'Manager'}],
      },
      llm: {
        messageQueue: [
          toolUseMessage('finalize_draft', {
            welcomeIntro:
              "Welcome aboard! I've mapped out your first few weeks — people, a PR, and the rooms that matter.",
            welcomeNote:
              'Welcome to the team. Your first few weeks will focus on learning the codebase and pairing with your onboarding buddy.',
            buddyUserId: 'UBUDDY1',
            stakeholderUserIds: ['USTAKE1'],
            peopleToMeet: [
              {
                name: 'Buddy One',
                role: 'Senior Software Engineer',
                discussionPoints: 'Codebase tour',
                weekBucket: 'week1-2',
                slackUserId: 'UBUDDY1',
              },
              {
                name: 'Stake Holder',
                role: 'Product Manager',
                discussionPoints: 'Roadmap context',
                weekBucket: 'week2-3',
                slackUserId: 'USTAKE1',
              },
            ],
            customChecklistItems: [],
            summary: 'Draft ready.',
          }),
        ],
        defaultText: 'done',
      },
    });

    const created = await handleCreateDraft(
      jsonRequest({newHireSlackId: 'UHIRE001'}),
      ctx,
      session
    );
    expect(created.status).toBe(201);

    const generated = await handleGenerateDraft(
      jsonRequest({newHireName: 'Alice', slackUserIdIfKnown: 'UHIRE001'}),
      ctx,
      session,
      'UHIRE001'
    );
    expect(generated.status).toBe(200);
    await new Response(generated.body).text();

    const stored = await ctx.db.get('UHIRE001');
    expect(stored?.buddyUserId).toBeUndefined();
    expect(
      stored?.sections.peopleToMeet.people.map((person) => person.slackUserId)
    ).toEqual(expect.arrayContaining(['UBUDDY1', 'USTAKE1']));
  });

  it('generateDraft keeps resolved people when finalize_draft omits them', async () => {
    const ctx = makeTestCtx({
      slack: {
        usersInfo: {
          UHIRE001: {
            id: 'UHIRE001',
            real_name: 'Alice Adams',
            profile: {
              first_name: 'Alice',
              display_name: 'alice',
              email: 'alice@webflow.com',
              title: 'Senior Software Engineer, Frontend',
            },
          },
          UMANAGER1: {
            id: 'UMANAGER1',
            real_name: 'Grace Hopper',
            profile: {
              first_name: 'Grace',
              display_name: 'grace',
              email: 'grace@webflow.com',
              title: 'Engineering Manager',
            },
          },
        },
        usersProfileGet: {
          UHIRE001: {
            fields: {
              F_DEPARTMENT: {value: '1500 Engineering Team'},
              F_DIVISION: {value: 'Collaboration'},
              F_MANAGER: {value: '<@UMANAGER1>', alt: 'Grace Hopper'},
            },
          },
          UBUDDY1: {
            fields: {
              F_DEPARTMENT: {value: '1500 Engineering Team'},
              F_DIVISION: {value: 'Collaboration'},
              F_MANAGER: {value: '<@UMANAGER1>', alt: 'Grace Hopper'},
            },
          },
          UPMREAL: {
            fields: {
              F_DEPARTMENT: {value: '1600 Product Team'},
              F_DIVISION: {value: 'Collaboration'},
            },
          },
          UMANAGER1: {
            fields: {
              F_DEPARTMENT: {value: '1500 Engineering Team'},
              F_DIVISION: {value: 'Collaboration'},
            },
          },
        },
        usersList: [
          {
            id: 'UHIRE001',
            real_name: 'Alice Adams',
            profile: {
              real_name: 'Alice Adams',
              display_name: 'alice',
              email: 'alice@webflow.com',
              title: 'Senior Software Engineer, Frontend',
            },
          },
          {
            id: 'UBUDDY1',
            real_name: 'Buddy One',
            profile: {
              real_name: 'Buddy One',
              display_name: 'buddy',
              email: 'buddy@webflow.com',
              title: 'Senior Software Engineer, Frontend',
            },
          },
          {
            id: 'UPMREAL',
            real_name: 'Real PM',
            profile: {
              real_name: 'Real PM',
              display_name: 'pm',
              email: 'pm@webflow.com',
              title: 'Senior Product Manager',
            },
          },
        ],
        teamProfileFields: [
          {id: 'F_DEPARTMENT', label: 'Department'},
          {id: 'F_DIVISION', label: 'Division'},
          {id: 'F_MANAGER', label: 'Manager'},
        ],
      },
      llm: {
        messageQueue: [
          toolUseMessage('finalize_draft', {
            welcomeIntro:
              "Welcome aboard! I've mapped out your first few weeks — people, a PR, and the rooms that matter.",
            welcomeNote:
              'Welcome to the team. Your first few weeks will focus on learning the codebase and pairing with your onboarding buddy.',
            buddyUserId: 'UBUDDY1',
            stakeholderUserIds: [],
            peopleToMeet: [
              {
                name: 'Buddy One',
                role: 'Senior Software Engineer, Frontend',
                discussionPoints: 'Codebase tour',
                weekBucket: 'week1-2',
                slackUserId: 'UBUDDY1',
              },
            ],
            customChecklistItems: [],
            summary: 'Draft ready.',
          }),
        ],
        defaultText: 'done',
      },
    });

    const created = await handleCreateDraft(
      jsonRequest({newHireSlackId: 'UHIRE001'}),
      ctx,
      session
    );
    expect(created.status).toBe(201);
    const before = await ctx.db.get('UHIRE001');
    expect(
      before?.sections.peopleToMeet.people.some(
        (person) => person.slackUserId === 'UPMREAL'
      )
    ).toBe(true);

    const generated = await handleGenerateDraft(
      jsonRequest({newHireName: 'Alice', slackUserIdIfKnown: 'UHIRE001'}),
      ctx,
      session,
      'UHIRE001'
    );
    expect(generated.status).toBe(200);
    await new Response(generated.body).text();

    const stored = await ctx.db.get('UHIRE001');
    expect(
      stored?.sections.peopleToMeet.people.map((person) => person.slackUserId)
    ).toEqual(expect.arrayContaining(['UBUDDY1', 'UPMREAL']));
  });

  it('patchDraft updates welcomeNote', async () => {
    const ctx = await setupWithDraft();
    const res = await handlePatchDraft(
      jsonRequest({welcomeNote: 'Hello Alice!'}, 'PATCH'),
      ctx,
      session,
      'UHIRE001'
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {pkg: {welcomeNote: string}};
    expect(body.pkg.welcomeNote).toBe('Hello Alice!');
  });

  it('patchDraft rejects invalid body shape', async () => {
    const ctx = await setupWithDraft();
    const res = await handlePatchDraft(
      jsonRequest(
        {
          customChecklistItems: [
            {
              label: 'x',
              kind: 'not-a-kind',
              notes: 'y',
            },
          ],
        },
        'PATCH'
      ),
      ctx,
      session,
      'UHIRE001'
    );
    expect(res.status).toBe(400);
  });

  it('handleGetDraft 404 when missing', async () => {
    const ctx = makeTestCtx();
    const res = await handleGetDraft(ctx, session, 'UNONEXISTENT');
    expect(res.status).toBe(404);
  });

  it('critique surfaces no-buddy finding for a fresh draft', async () => {
    const ctx = await setupWithDraft();
    const res = await handleCritiqueDraft(ctx, session, 'UHIRE001');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {findings: Array<{id: string}>};
    expect(body.findings.some((f) => f.id === 'no-buddy')).toBe(true);
  });
});
