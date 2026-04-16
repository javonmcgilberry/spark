import {NextResponse} from 'next/server';
import {requireManagerContext} from '../../../lib/session';
import {listDrafts, createDraft, SparkApiError} from '../../../lib/sparkApi';
import type {CreateDraftBody} from '../../../lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const ctx = await requireManagerContext();
    const result = await listDrafts({
      env: ctx.env,
      managerSlackId: ctx.managerSlackId,
    });
    return NextResponse.json(result);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireManagerContext();
    const body = (await request
      .json()
      .catch(() => null)) as CreateDraftBody | null;
    if (!body || (!body.newHireSlackId && !body.newHireEmail)) {
      return NextResponse.json(
        {error: 'newHireSlackId or newHireEmail required'},
        {status: 400}
      );
    }
    const pkg = await createDraft(
      {env: ctx.env, managerSlackId: ctx.managerSlackId},
      body
    );
    return NextResponse.json({pkg}, {status: 201});
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
