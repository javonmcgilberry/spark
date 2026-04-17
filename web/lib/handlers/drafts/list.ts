import {z} from 'zod';
import type {HandlerCtx} from '../../ctx';
import type {ManagerSession} from '../../session';
import {createDraftPackage} from '../../services/onboardingPackages';
import {
  resolveFromEmail,
  resolveFromSlack,
} from '../../services/identityResolver';
import {enrichPackageInsights} from './enrich';

export async function handleListDrafts(
  ctx: HandlerCtx,
  session: ManagerSession
): Promise<Response> {
  const drafts = await ctx.db.listDraftsForManager(session.managerSlackId);
  const allManaged = await ctx.db.listPackagesManagedBy(session.managerSlackId);
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

  const pkg = await createDraftPackage(ctx, {
    profile: hire,
    createdByUserId: session.managerSlackId,
    welcomeNote,
    buddyUserId,
    stakeholderUserIds,
  });

  return Response.json({pkg: enrichPackageInsights(ctx, pkg)}, {status: 201});
}
