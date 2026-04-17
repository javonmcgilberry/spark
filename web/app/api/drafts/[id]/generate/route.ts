import { buildManagerCtx, handleRouteError } from "../../../../../lib/routeCtx";
import { handleGenerateDraft } from "../../../../../lib/handlers/drafts/generate";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { ctx, session } = await buildManagerCtx();
    const { id } = await params;
    return await handleGenerateDraft(request, ctx, session, id);
  } catch (error) {
    return handleRouteError(error);
  }
}
