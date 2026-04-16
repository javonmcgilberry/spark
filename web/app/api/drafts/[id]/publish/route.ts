import {NextResponse} from 'next/server';
import {requireManagerContext} from '../../../../../lib/session';
import {
  hydrateSlackWorkspace,
  publishDraft,
  SparkApiError,
} from '../../../../../lib/sparkApi';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  {params}: {params: Promise<{id: string}>}
) {
  try {
    const ctx = await requireManagerContext();
    const {id} = await params;
    const body = (await request.json().catch(() => ({}))) as {
      hydrateOnly?: boolean;
    };

    const sparkCtx = {env: ctx.env, managerSlackId: ctx.managerSlackId};
    if (body.hydrateOnly) {
      const result = await hydrateSlackWorkspace(sparkCtx, id);
      return NextResponse.json(result);
    }
    // Hydrate first (idempotent) so the draft channel exists, then publish.
    await hydrateSlackWorkspace(sparkCtx, id).catch(() => null);
    const pkg = await publishDraft(sparkCtx, id);
    return NextResponse.json({pkg});
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof SparkApiError) {
      return NextResponse.json({error: error.message}, {status: error.status});
    }
    return NextResponse.json(
      {error: error instanceof Error ? error.message : 'internal error'},
      {status: 500}
    );
  }
}
