import type { HandlerCtx } from "../../ctx";
import type { ManagerSession } from "../../session";
import { runCritique } from "../../agents/critique";

export async function handleCritiqueDraft(
  ctx: HandlerCtx,
  _session: ManagerSession,
  userId: string,
): Promise<Response> {
  const pkg = await ctx.db.get(userId);
  if (!pkg) return Response.json({ error: "draft not found" }, { status: 404 });
  const { findings } = await runCritique(pkg);
  return Response.json({ findings });
}
