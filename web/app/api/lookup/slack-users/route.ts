import {NextResponse} from 'next/server';
import {requireManagerContext} from '../../../../lib/session';
import {lookupSlackUsers, SparkApiError} from '../../../../lib/sparkApi';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const ctx = await requireManagerContext();
    const url = new URL(request.url);
    const q = url.searchParams.get('q') ?? '';
    const limit = Number(url.searchParams.get('limit') ?? '10');
    const result = await lookupSlackUsers(
      {env: ctx.env, managerSlackId: ctx.managerSlackId},
      q,
      Number.isFinite(limit) ? limit : 10
    );
    return NextResponse.json(result);
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
