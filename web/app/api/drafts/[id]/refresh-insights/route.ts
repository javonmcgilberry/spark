import { buildManagerCtx, handleRouteError } from "../../../../../lib/routeCtx";
import { handleRefreshInsights } from "../../../../../lib/handlers/drafts/refreshInsights";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const { ctx, session } = await buildManagerCtx();
    const { id } = await params;
    return await handleRefreshInsights(ctx, session, id);
  } catch (error) {
    return handleRouteError(error);
  }
}
