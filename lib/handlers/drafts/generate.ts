import type {HandlerCtx} from '../../ctx';
import type {ManagerSession} from '../../session';
import {runGenerator, type GeneratorInput} from '../../agents/generator';
import type {OnboardingPerson} from '../../types';

export async function handleGenerateDraft(
  request: Request,
  ctx: HandlerCtx,
  _session: ManagerSession,
  userId: string
): Promise<Response> {
  if (!ctx.llm.isConfigured()) {
    return Response.json(
      {error: 'ANTHROPIC_API_KEY not configured'},
      {status: 503}
    );
  }
  const raw = await request.json().catch(() => null);
  const body = raw as GeneratorInput | null;
  if (!body || !body.newHireName) {
    return Response.json({error: 'newHireName required'}, {status: 400});
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
        );
      };
      try {
        for await (const event of runGenerator(body, {
          ctx,
          signal: request.signal,
        })) {
          send(event);
          if (
            event.type === 'tool_call' &&
            event.tool === 'draft_welcome_note'
          ) {
            const early = event.input as {
              welcomeIntro?: string;
              welcomeNote?: string;
            } | null;
            if (early?.welcomeIntro && early?.welcomeNote) {
              try {
                const pkg = await ctx.db.applyFieldPatch(userId, {
                  welcomeIntro: early.welcomeIntro,
                  welcomeNote: early.welcomeNote,
                });
                if (pkg) {
                  send({type: 'draft_persisted', pkgUserId: pkg.userId});
                }
              } catch (error) {
                send({
                  type: 'thinking',
                  iteration: event.iteration,
                  text:
                    'Could not persist early welcome: ' +
                    (error instanceof Error ? error.message : 'unknown'),
                });
              }
            }
          }
          if (event.type === 'draft_ready') {
            try {
              const existing = await ctx.db.get(userId);
              const pkg = await ctx.db.applyFieldPatch(userId, {
                welcomeIntro: event.draft.welcomeIntro,
                welcomeNote: event.draft.welcomeNote,
                buddyUserId: existing?.buddyUserId ?? null,
                stakeholderUserIds: event.draft.stakeholderUserIds,
                peopleToMeet: mergePeopleToMeet(
                  existing?.sections.peopleToMeet.people ?? [],
                  event.draft.peopleToMeet
                ),
                customChecklistItems: event.draft.customChecklistItems,
              });
              if (pkg) {
                send({type: 'draft_persisted', pkgUserId: pkg.userId});
              }
            } catch (error) {
              send({
                type: 'error',
                message:
                  error instanceof Error
                    ? error.message
                    : 'failed to persist draft',
              });
            }
          }
        }
      } catch (error) {
        send({
          type: 'error',
          message: error instanceof Error ? error.message : 'generator failed',
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

function mergePeopleToMeet(
  existing: OnboardingPerson[],
  generated: OnboardingPerson[]
): OnboardingPerson[] {
  const merged = generated.map((person) =>
    hydrateGeneratedPerson(person, existing)
  );
  const seen = new Set(merged.map(personKey));
  for (const person of existing) {
    const key = personKey(person);
    if (seen.has(key)) continue;
    merged.push(person);
    seen.add(key);
  }
  return merged.slice(0, 12);
}

function hydrateGeneratedPerson(
  person: OnboardingPerson,
  existing: OnboardingPerson[]
): OnboardingPerson {
  const match = person.slackUserId
    ? existing.find((candidate) => candidate.slackUserId === person.slackUserId)
    : existing.find((candidate) => sameRole(candidate, person));
  if (!match) return person;
  if (!person.slackUserId) {
    return {
      ...match,
      ...person,
      name: match.name,
      role: match.role,
      title: match.title,
      slackUserId: match.slackUserId,
      email: match.email,
      avatarUrl: match.avatarUrl,
      kind: person.kind ?? match.kind,
    };
  }
  return {
    ...match,
    ...person,
    title: person.title ?? match.title,
    email: match.email,
    avatarUrl: match.avatarUrl,
    kind: person.kind ?? match.kind,
  };
}

function sameRole(left: OnboardingPerson, right: OnboardingPerson): boolean {
  return roleKey(left) === roleKey(right);
}

function personKey(person: OnboardingPerson): string {
  return person.slackUserId?.toLowerCase() ?? roleKey(person);
}

function roleKey(person: OnboardingPerson): string {
  return (person.kind ?? person.role).trim().toLowerCase();
}
