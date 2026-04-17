import {buildManagerCtx, handleRouteError} from '../../../../../lib/routeCtx';
import {handlePublishDraft} from '../../../../../lib/handlers/drafts/publish';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  {params}: {params: Promise<{id: string}>}
) {
  try {
    const {ctx, session} = await buildManagerCtx();
    const {id} = await params;
    return await handlePublishDraft(request, ctx, session, id);
  } catch (error) {
    return handleRouteError(error);
  }
}
