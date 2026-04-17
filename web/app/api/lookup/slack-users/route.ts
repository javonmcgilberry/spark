import { buildManagerCtx, handleRouteError } from "../../../../lib/routeCtx";
import { handleLookupSlackUsers } from "../../../../lib/handlers/lookup/slackUsers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { ctx, session } = await buildManagerCtx();
    return await handleLookupSlackUsers(request, ctx, session);
  } catch (error) {
    return handleRouteError(error);
  }
}
