import type {HandlerCtx} from '../../ctx';
import type {ManagerSession} from '../../session';
import {hydrateSlackWorkspace} from '../../services/onboardingPackages';
import {publishWorkspace} from '../../services/canvas';
import {
  resolveFromEmail,
  resolveFromSlack,
} from '../../services/identityResolver';
import type {OnboardingPackage, TeamProfile} from '../../types';
import {enrichPackageInsights} from './enrich';

export async function handlePublishDraft(
  request: Request,
  ctx: HandlerCtx,
  session: ManagerSession,
  userId: string
): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    hydrateOnly?: boolean;
  };

  const existing = await ctx.db.get(userId);
  if (!existing) {
    return Response.json({error: 'draft not found'}, {status: 404});
  }

  const hire = await resolveHireProfile(ctx, existing, userId);

  // Hydrate first (idempotent) so the draft channel exists.
  if (hire) {
    await hydrateSlackWorkspace(ctx, existing, hire).catch((error) =>
      ctx.logger.warn('hydrate-slack failed during publish', error)
    );
  }

  if (body.hydrateOnly) {
    const afterHydrate = await ctx.db.get(userId);
    return Response.json({
      pkg: afterHydrate ? enrichPackageInsights(ctx, afterHydrate) : null,
      alreadyHydrated: Boolean(existing.draftChannelId),
    });
  }

  const result = await ctx.db.publish(userId, session.managerSlackId);
  if (!result.ok) {
    return Response.json(
      {error: result.reason},
      {status: result.reason === 'not_found' ? 404 : 403}
    );
  }

  if (hire) {
    ctx.waitUntil(
      publishWorkspace(ctx, result.pkg, hire).catch((error) =>
        ctx.logger.warn('publishWorkspace failed post-publish', error)
      )
    );
  }

  return Response.json({pkg: enrichPackageInsights(ctx, result.pkg)});
}

async function resolveHireProfile(
  ctx: HandlerCtx,
  pkg: OnboardingPackage,
  routeUserId: string
): Promise<TeamProfile | null> {
  if (looksLikeSlackUserId(routeUserId)) {
    return resolveFromSlack(ctx, routeUserId).catch(() => null);
  }
  if (looksLikeEmail(pkg.userId)) {
    return resolveFromEmail(ctx, pkg.userId).catch(() => null);
  }
  return null;
}

function looksLikeSlackUserId(value: string): boolean {
  return /^[A-Z][A-Z0-9]+$/.test(value);
}

function looksLikeEmail(value: string): boolean {
  return value.includes('@');
}
