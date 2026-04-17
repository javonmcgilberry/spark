import { buildManagerCtx, handleRouteError } from "../../../../../lib/routeCtx";
import { handleCritiqueDraft } from "../../../../../lib/handlers/drafts/critique";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { ctx, session } = await buildManagerCtx();
    const { id } = await params;
    return await handleCritiqueDraft(ctx, session, id);
  } catch (error) {
    return handleRouteError(error);
  }
}
