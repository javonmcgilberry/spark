import {NextResponse} from 'next/server';
import {requireManagerContext} from '../../../../lib/session';
import {getDraft, patchDraft, SparkApiError} from '../../../../lib/sparkApi';
import type {DraftFieldPatch} from '../../../../lib/types';

export const dynamic = 'force-dynamic';

type RouteParams = {params: Promise<{id: string}>};

export async function GET(_req: Request, {params}: RouteParams) {
  try {
    const ctx = await requireManagerContext();
    const {id} = await params;
    const pkg = await getDraft(
      {env: ctx.env, managerSlackId: ctx.managerSlackId},
      id
    );
    return NextResponse.json({pkg});
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request, {params}: RouteParams) {
  try {
    const ctx = await requireManagerContext();
    const {id} = await params;
    const body = (await request
      .json()
      .catch(() => null)) as DraftFieldPatch | null;
    if (!body) {
      return NextResponse.json({error: 'body required'}, {status: 400});
    }
    const pkg = await patchDraft(
      {env: ctx.env, managerSlackId: ctx.managerSlackId},
      id,
      body
    );
    return NextResponse.json({pkg});
  } catch (error) {
    return handleError(error);
  }
}

function handleError(error: unknown) {
  if (error instanceof Response) return error;
  if (error instanceof SparkApiError) {
    return NextResponse.json({error: error.message}, {status: error.status});
  }
  return NextResponse.json(
    {error: error instanceof Error ? error.message : 'internal error'},
    {status: 500}
  );
}
