import {NextResponse} from 'next/server';
import {requireManagerContext} from '../../../../../lib/session';
import {patchDraft} from '../../../../../lib/sparkApi';
import {
  runGenerator,
  type GeneratorInput,
} from '../../../../../lib/agents/generator';

export const dynamic = 'force-dynamic';

type RouteParams = {params: Promise<{id: string}>};

export async function POST(request: Request, {params}: RouteParams) {
  let ctx;
  try {
    ctx = await requireManagerContext();
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
  const {id} = await params;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {error: 'ANTHROPIC_API_KEY not configured'},
      {status: 503}
    );
  }
  const body = (await request
    .json()
    .catch(() => null)) as GeneratorInput | null;
  if (!body || !body.newHireName) {
    return NextResponse.json({error: 'newHireName required'}, {status: 400});
  }

  const sparkCtx = {env: ctx.env, managerSlackId: ctx.managerSlackId};
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
          apiKey,
          model: process.env.ANTHROPIC_MODEL,
          spark: sparkCtx,
          signal: request.signal,
        })) {
          send(event);
          if (event.type === 'draft_ready') {
            try {
              const pkg = await patchDraft(sparkCtx, id, {
                welcomeIntro: event.draft.welcomeIntro,
                welcomeNote: event.draft.welcomeNote,
                buddyUserId: event.draft.buddyUserId ?? null,
                stakeholderUserIds: event.draft.stakeholderUserIds,
                customChecklistItems: event.draft.customChecklistItems,
              });
              send({type: 'draft_persisted', pkgUserId: pkg.userId});
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
