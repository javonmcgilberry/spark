import type {HandlerCtx} from '../../ctx';
import type {ManagerSession} from '../../session';
import {runGenerator, type GeneratorInput} from '../../agents/generator';

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
