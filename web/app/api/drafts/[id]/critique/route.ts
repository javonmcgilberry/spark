import {NextResponse} from 'next/server';
import {requireManagerContext} from '../../../../../lib/session';
import {getDraft, SparkApiError} from '../../../../../lib/sparkApi';
import {runCritique} from '../../../../../lib/agents/critique';

export const dynamic = 'force-dynamic';

export async function POST(
  _request: Request,
  {params}: {params: Promise<{id: string}>}
) {
  try {
    const ctx = await requireManagerContext();
    const {id} = await params;
    const pkg = await getDraft(
      {env: ctx.env, managerSlackId: ctx.managerSlackId},
      id
    );
    const {findings} = await runCritique(pkg);
    return NextResponse.json({findings});
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
