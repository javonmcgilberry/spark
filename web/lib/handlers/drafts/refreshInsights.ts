import { z } from "zod";
import type { HandlerCtx } from "../../ctx";
import type { ManagerSession } from "../../session";
import {
  getInsightsForPeople,
  getInsightWithHints,
} from "../../services/peopleInsights";
import { enrichPackageInsights } from "./enrich";

export async function handleRefreshInsights(
  ctx: HandlerCtx,
  _session: ManagerSession,
  userId: string,
): Promise<Response> {
  const pkg = await ctx.db.get(userId);
  if (!pkg) return Response.json({ error: "draft not found" }, { status: 404 });

  await getInsightsForPeople(
    ctx,
    pkg.sections.peopleToMeet.people,
    pkg.sections.peopleToMeet.title,
  ).catch((error) => ctx.logger.warn("refresh-insights failed", error));

  return Response.json({ pkg: enrichPackageInsights(ctx, pkg) });
}

const retryBodySchema = z.object({
  slackUserId: z.string().min(1),
  hints: z
    .object({
      email: z.string().optional(),
      githubUsername: z.string().optional(),
      jiraTicketKey: z.string().optional(),
    })
    .optional(),
});

export async function handleRetryPersonInsights(
  request: Request,
  ctx: HandlerCtx,
  _session: ManagerSession,
  userId: string,
): Promise<Response> {
  const raw = await request.json().catch(() => null);
  const parsed = retryBodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return Response.json(
      { error: "invalid body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const pkg = await ctx.db.get(userId);
  if (!pkg) return Response.json({ error: "draft not found" }, { status: 404 });

  const person = pkg.sections.peopleToMeet.people.find(
    (p) => p.slackUserId === parsed.data.slackUserId,
  );
  if (!person) {
    return Response.json(
      { error: "person not found in this draft" },
      { status: 404 },
    );
  }
  await getInsightWithHints(
    ctx,
    person,
    pkg.sections.peopleToMeet.title,
    parsed.data.hints ?? {},
  ).catch((error) => ctx.logger.warn("retry-insights failed", error));

  return Response.json({ pkg: enrichPackageInsights(ctx, pkg) });
}
