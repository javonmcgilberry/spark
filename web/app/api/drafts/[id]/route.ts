import { buildManagerCtx, handleRouteError } from "../../../../lib/routeCtx";
import {
  handleGetDraft,
  handlePatchDraft,
} from "../../../../lib/handlers/drafts/byId";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const { ctx, session } = await buildManagerCtx();
    const { id } = await params;
    return await handleGetDraft(ctx, session, id);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { ctx, session } = await buildManagerCtx();
    const { id } = await params;
    return await handlePatchDraft(request, ctx, session, id);
  } catch (error) {
    return handleRouteError(error);
  }
}
