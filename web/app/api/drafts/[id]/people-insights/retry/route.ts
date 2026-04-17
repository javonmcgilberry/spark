import {NextResponse} from 'next/server';
import {requireManagerContext} from '../../../../../../lib/session';
import {
  retryPersonInsights,
  SparkApiError,
  type InsightHints,
} from '../../../../../../lib/sparkApi';

export const dynamic = 'force-dynamic';

type RouteParams = {params: Promise<{id: string}>};

export async function POST(request: Request, {params}: RouteParams) {
  try {
    const ctx = await requireManagerContext();
    const {id} = await params;
    const body = (await request.json().catch(() => null)) as {
      slackUserId?: string;
      hints?: InsightHints;
    } | null;
    if (!body?.slackUserId) {
      return NextResponse.json({error: 'slackUserId required'}, {status: 400});
    }
    const pkg = await retryPersonInsights(
      {env: ctx.env, managerSlackId: ctx.managerSlackId},
      id,
      body.slackUserId,
      body.hints ?? {}
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
