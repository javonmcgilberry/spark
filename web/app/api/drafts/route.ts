import { buildManagerCtx, handleRouteError } from "../../../lib/routeCtx";
import {
  handleCreateDraft,
  handleListDrafts,
} from "../../../lib/handlers/drafts/list";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { ctx, session } = await buildManagerCtx();
    return await handleListDrafts(ctx, session);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { ctx, session } = await buildManagerCtx();
    return await handleCreateDraft(request, ctx, session);
  } catch (error) {
    return handleRouteError(error);
  }
}
