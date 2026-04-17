import type {HandlerCtx} from '../../ctx';
import type {ManagerSession} from '../../session';
import {runGenerator, type GeneratorInput} from '../../agents/generator';
import type {OnboardingPackage, OnboardingPerson} from '../../types';

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
  // Preflight snapshot: the deterministic roster + insight work that
  // already ran during handleCreateDraft. Fetched before the LLM loop
  // kicks off so we can surface it as the first step in the agent
  // timeline — otherwise managers see "Resolving new hire" as the
  // first step and have no visibility into whether teammates actually
  // resolved.
  const existing = await ctx.db.get(userId).catch(() => undefined);
  const preflight = buildRosterPreflight(existing);

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
        );
      };

      // Emit the preflight as a tool_call + tool_result pair so the
      // AgentTimeline renders it as "step 1" without any new event
      // type. iteration: -1 marks it as pre-LLM work.
      if (preflight) {
        send({
          type: 'tool_call',
          iteration: -1,
          tool: 'resolve_team_roster',
          input: preflight.input,
        });
        send({
          type: 'tool_result',
          iteration: -1,
          tool: 'resolve_team_roster',
          durationMs: 0,
          ok: true,
          preview: preflight.preview,
        });
      }

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
            // The generator's finalize_draft schema carries ONLY welcome
            // copy + checklist additions. Identity fields (peopleToMeet,
            // buddyUserId, stakeholderUserIds) are resolved
            // deterministically server-side and never flow from the LLM.
            try {
              const pkg = await ctx.db.applyFieldPatch(userId, {
                welcomeIntro: event.draft.welcomeIntro,
                welcomeNote: event.draft.welcomeNote,
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

interface RosterPreflight {
  input: {
    teamName: string;
    pillarName?: string;
  };
  preview: {
    resolved: number;
    placeholders: number;
    teammates: number;
    crossFunctional: number;
    manager: string | null;
    source: 'warehouse' | 'slack-fallback' | 'unknown';
    roster: Array<{
      name: string;
      kind: string;
      resolved: boolean;
    }>;
  };
}

function buildRosterPreflight(
  pkg: OnboardingPackage | undefined
): RosterPreflight | null {
  if (!pkg) return null;
  const people = pkg.sections.peopleToMeet.people;
  const resolved = people.filter((p) => Boolean(p.slackUserId));
  const placeholders = people.filter((p) => !p.slackUserId);
  const teammates = resolved.filter((p) => p.kind === 'teammate').length;
  const crossFunctional = resolved.filter((p) =>
    ['pm', 'designer', 'director', 'people-partner'].includes(p.kind ?? '')
  ).length;
  const manager = people.find((p) => p.kind === 'manager');
  // Heuristic source detection: if every non-manager, non-buddy slot is
  // a placeholder (no slackUserId), we fell back to Slack-only. If any
  // teammate or cross-functional row has a Slack id, the warehouse (or
  // its fallback resolver) filled it in.
  const source: RosterPreflight['preview']['source'] =
    teammates > 0 || crossFunctional > 0
      ? 'warehouse'
      : resolved.some((p) => p.kind === 'manager')
        ? 'slack-fallback'
        : 'unknown';
  return {
    input: {
      teamName: pkg.teamName ?? 'Engineering',
      pillarName: pkg.pillarName,
    },
    preview: {
      resolved: resolved.length,
      placeholders: placeholders.length,
      teammates,
      crossFunctional,
      manager: manager?.slackUserId ? (manager.name ?? null) : null,
      source,
      roster: people.map(personSummary),
    },
  };
}

function personSummary(person: OnboardingPerson): {
  name: string;
  kind: string;
  resolved: boolean;
} {
  return {
    name: person.name,
    kind: person.kind ?? 'custom',
    resolved: Boolean(person.slackUserId),
  };
}
