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
import {makeMemoryDraftStore, type HandlerCtx} from '../../lib/ctx';
import type {DraftStore} from '../../lib/draftStore';

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

  it('generateDraft only patches welcome copy + checklist; never touches peopleToMeet or buddyUserId', async () => {
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
            customChecklistItems: [
              {
                label: 'Pair on a small ticket in week 2',
                kind: 'task' as const,
                notes: 'Shadow a teammate while shipping.',
              },
            ],
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
    const beforePeople = before?.sections.peopleToMeet.people ?? [];

    const generated = await handleGenerateDraft(
      jsonRequest({newHireName: 'Alice', slackUserIdIfKnown: 'UHIRE001'}),
      ctx,
      session,
      'UHIRE001'
    );
    expect(generated.status).toBe(200);
    const sseText = await new Response(generated.body).text();

    // The preflight step is the FIRST thing the manager sees in the
    // agent timeline — it reports the already-resolved roster so
    // they're not guessing whether teammates got built.
    expect(sseText).toContain('"tool":"resolve_team_roster"');
    expect(sseText).toMatch(/"iteration":-1/);

    const stored = await ctx.db.get('UHIRE001');
    expect(stored?.welcomeIntro).toContain('Welcome aboard!');
    expect(stored?.welcomeNote).toContain('Welcome to the team.');
    expect(stored?.customChecklistItems?.[0]?.label).toBe(
      'Pair on a small ticket in week 2'
    );
    // Generator must not affect identity. The roster and buddy state
    // come from the deterministic server-side resolver.
    expect(stored?.buddyUserId).toBe(before?.buddyUserId);
    expect(
      stored?.sections.peopleToMeet.people.map((person) => person.slackUserId)
    ).toEqual(beforePeople.map((person) => person.slackUserId));
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

  it('patchDraft rejects a fabricated slackUserId (must be U-prefixed)', async () => {
    const ctx = await setupWithDraft();
    const res = await handlePatchDraft(
      jsonRequest(
        {
          peopleToMeet: [
            {
              name: 'Fabricated Person',
              role: 'Teammate',
              discussionPoints: '',
              weekBucket: 'week2-3',
              slackUserId: 'bogus-id',
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

  it('patchDraft returns 409 when expectedUpdatedAt is stale', async () => {
    const ctx = await setupWithDraft();
    const res = await handlePatchDraft(
      jsonRequest(
        {
          welcomeNote: 'stale client',
          expectedUpdatedAt: '1999-01-01T00:00:00.000Z',
        },
        'PATCH'
      ),
      ctx,
      session,
      'UHIRE001'
    );
    expect(res.status).toBe(409);
  });

  it('patchDraft preserves manager-authored discussionPoints across a refresh-insights cycle', async () => {
    const ctx = await setupWithDraft();
    const baseline = await ctx.db.get('UHIRE001');
    const target = baseline?.sections.peopleToMeet.people[0];
    expect(target).toBeDefined();

    // Manager edits discussionPoints → insightsStatus becomes user-overridden.
    const editRes = await handlePatchDraft(
      jsonRequest(
        {
          peopleToMeet: [
            {
              ...target,
              discussionPoints: 'Ask Alice about the Q2 migration she led.',
              insightsStatus: 'user-overridden',
            },
          ],
        },
        'PATCH'
      ),
      ctx,
      session,
      'UHIRE001'
    );
    expect(editRes.status).toBe(200);

    // Refresh-insights then runs; the user-overridden row must survive.
    const refresh = await handleRefreshInsights(ctx, session, 'UHIRE001');
    expect(refresh.status).toBe(200);

    const stored = await ctx.db.get('UHIRE001');
    const row = stored?.sections.peopleToMeet.people.find(
      (person) => canonicalKeyFor(person) === canonicalKeyFor(target!)
    );
    expect(row?.discussionPoints).toBe(
      'Ask Alice about the Q2 migration she led.'
    );
    expect(row?.insightsStatus).toBe('user-overridden');
  });

  it('refresh-insights keeps a person that was manually added after the refresh started', async () => {
    const realDb = makeMemoryDraftStore();
    let serveStaleOnce = false;
    let staleSnapshot: Awaited<ReturnType<DraftStore['get']>> | undefined;
    const db: DraftStore = {
      async get(userId) {
        if (serveStaleOnce && staleSnapshot?.userId === userId) {
          serveStaleOnce = false;
          return structuredClone(staleSnapshot);
        }
        return realDb.get(userId);
      },
      listDraftsForManager: (managerUserId) =>
        realDb.listDraftsForManager(managerUserId),
      listPackagesManagedBy: (managerUserId) =>
        realDb.listPackagesManagedBy(managerUserId),
      create: (pkg) => realDb.create(pkg),
      update: (pkg) => realDb.update(pkg),
      applyFieldPatch: (userId, patch) => realDb.applyFieldPatch(userId, patch),
      publish: (userId, publishedByUserId) =>
        realDb.publish(userId, publishedByUserId),
    };
    const ctx = makeTestCtx({
      db,
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

    staleSnapshot = await realDb.get('UHIRE001');
    expect(staleSnapshot).toBeDefined();

    await realDb.applyFieldPatch('UHIRE001', {
      peopleToMeet: [
        ...(staleSnapshot?.sections.peopleToMeet.people ?? []),
        {
          name: 'Nadia Zeng',
          role: 'Senior Software Engineer',
          title: 'Senior Software Engineer',
          discussionPoints: '',
          weekBucket: 'week3+',
          kind: 'teammate',
          slackUserId: 'UENG1',
          email: 'nadia@webflow.com',
          insightsStatus: 'pending',
        },
      ],
    });

    serveStaleOnce = true;
    const refresh = await handleRefreshInsights(ctx, session, 'UHIRE001');
    expect(refresh.status).toBe(200);

    const stored = await realDb.get('UHIRE001');
    expect(
      stored?.sections.peopleToMeet.people.some(
        (person) => person.slackUserId === 'UENG1'
      )
    ).toBe(true);
  });
});

function canonicalKeyFor(person: {
  slackUserId?: string;
  email?: string;
  name: string;
}): string {
  return (person.slackUserId || person.email || person.name)
    .trim()
    .toLowerCase();
}
