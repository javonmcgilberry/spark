import {z} from 'zod';
import type {HandlerCtx} from '../../ctx';
import type {ManagerSession} from '../../session';
import {
  createDraftPackage,
  hydrateSlackWorkspace,
} from '../../services/onboardingPackages';
import {
  applyTeamHint,
  resolveFromEmail,
  resolveFromSlack,
} from '../../services/identityResolver';
import {getInsightsForPeople} from '../../services/peopleInsights';
import type {OnboardingPackage, TeamProfile} from '../../types';
import {enrichPackageInsights} from './enrich';

/**
 * Best-effort inline prewarm budget. Keeps handleCreateDraft responsive
 * (~5s target including warehouse + package build) while still giving
 * the UI populated "Ask me about…" blurbs on first load. When the
 * budget is hit the remaining rows stay in `pending` and
 * DraftProvider's refresh-insights path picks them up.
 */
const INSIGHT_PREWARM_BUDGET_MS = 4_500;

export async function handleListDrafts(
  ctx: HandlerCtx,
  session: ManagerSession
): Promise<Response> {
  // Two independent D1 reads — fire them together so the dashboard's
  // initial load pays max(drafts, managed) instead of the sum.
  const [drafts, allManaged] = await Promise.all([
    ctx.db.listDraftsForManager(session.managerSlackId),
    ctx.db.listPackagesManagedBy(session.managerSlackId),
  ]);
  const publishedPackages = allManaged.filter(
    (pkg) => pkg.status === 'published'
  );
  return Response.json({
    drafts: drafts.map((pkg) => enrichPackageInsights(ctx, pkg)),
    publishedPackages: publishedPackages.map((pkg) =>
      enrichPackageInsights(ctx, pkg)
    ),
  });
}

const createBodySchema = z.object({
  newHireSlackId: z.string().optional(),
  newHireEmail: z.string().email().optional(),
  teamHint: z.string().optional(),
  welcomeNote: z.string().optional(),
  buddyUserId: z.string().optional(),
  stakeholderUserIds: z.array(z.string()).optional(),
});

export async function handleCreateDraft(
  request: Request,
  ctx: HandlerCtx,
  session: ManagerSession
): Promise<Response> {
  const raw = await request.json().catch(() => null);
  const parsed = createBodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return Response.json(
      {error: 'invalid body', issues: parsed.error.issues},
      {status: 400}
    );
  }
  const {
    newHireSlackId,
    newHireEmail,
    teamHint,
    welcomeNote,
    buddyUserId,
    stakeholderUserIds,
  } = parsed.data;
  if (!newHireSlackId && !newHireEmail) {
    return Response.json(
      {error: 'newHireSlackId or newHireEmail required'},
      {status: 400}
    );
  }

  const hire = newHireSlackId
    ? await resolveFromSlack(ctx, newHireSlackId)
    : await resolveFromEmail(ctx, newHireEmail!);
  const profile = await applyTeamHint(ctx, hire, teamHint);

  // Create the package with the deterministic roster but WITHOUT
  // creating the Slack canvas yet. We want the canvas to render
  // against the post-prewarm state (real Ask-me-about blurbs, final
  // teammate ids) rather than a half-populated roster.
  const pkg = await createDraftPackage(ctx, {
    profile,
    createdByUserId: session.managerSlackId,
    welcomeNote,
    buddyUserId,
    stakeholderUserIds,
    hydrateSlack: false,
  });

  const prewarmed = await prewarmInsights(ctx, pkg);
  const withCanvas = await finalizeSlackCanvas(ctx, prewarmed, profile);
  return Response.json(
    {pkg: enrichPackageInsights(ctx, withCanvas)},
    {status: 201}
  );
}

/**
 * Run peopleInsights against the resolved roster and persist enriched
 * rows before returning. Bounded by INSIGHT_PREWARM_BUDGET_MS: anything
 * slower than the budget returns early and the client's refresh path
 * picks up the rest.
 *
 * Only resolved Slack-ID rows are prewarmed. Placeholder / catalog /
 * fallback rows never get a fabricated blurb — enrichPackageInsights
 * leaves them in the pending (or template) state the UI expects.
 */
async function prewarmInsights(
  ctx: HandlerCtx,
  pkg: OnboardingPackage
): Promise<OnboardingPackage> {
  const candidates = pkg.sections.peopleToMeet.people.filter((person) =>
    Boolean(person.slackUserId)
  );
  if (candidates.length === 0) return pkg;
  const teamName = pkg.teamName ?? 'Engineering';
  const budget = new Promise<void>((resolve) =>
    setTimeout(resolve, INSIGHT_PREWARM_BUDGET_MS)
  );
  try {
    await Promise.race([
      getInsightsForPeople(ctx, candidates, teamName),
      budget,
    ]);
  } catch (error) {
    ctx.logger.warn(
      'prewarmInsights failed; continuing without blurbs.',
      error
    );
    return pkg;
  }
  const enriched = enrichPackageInsights(ctx, pkg);
  try {
    const persisted = await ctx.db.applyFieldPatch(pkg.userId, {
      peopleToMeet: enriched.sections.peopleToMeet.people,
    });
    return persisted ?? enriched;
  } catch (error) {
    ctx.logger.warn(
      'prewarmInsights: persist failed; returning in-memory enriched package.',
      error
    );
    return enriched;
  }
}

/**
 * Create the draft Slack channel + canvas AFTER the deterministic
 * roster and insights are persisted so the canvas renders the same
 * state the browser sees. Best-effort: if Slack is unreachable we
 * return the pkg unchanged and the canvas can be materialized later
 * via /api/drafts/:id/hydrate-slack or on publish.
 */
async function finalizeSlackCanvas(
  ctx: HandlerCtx,
  pkg: OnboardingPackage,
  profile: TeamProfile
): Promise<OnboardingPackage> {
  try {
    return await hydrateSlackWorkspace(ctx, pkg, profile);
  } catch (error) {
    ctx.logger.warn(
      'finalizeSlackCanvas failed; draft channel + canvas will be created on next update.',
      error
    );
    return pkg;
  }
}
