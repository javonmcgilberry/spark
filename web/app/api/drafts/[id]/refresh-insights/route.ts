import {NextResponse} from 'next/server';
import {requireManagerContext} from '../../../../../lib/session';
import {refreshInsights, SparkApiError} from '../../../../../lib/sparkApi';

export const dynamic = 'force-dynamic';

type RouteParams = {params: Promise<{id: string}>};

export async function POST(_request: Request, {params}: RouteParams) {
  try {
    const ctx = await requireManagerContext();
    const {id} = await params;
    const pkg = await refreshInsights(
      {env: ctx.env, managerSlackId: ctx.managerSlackId},
      id
    );
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
