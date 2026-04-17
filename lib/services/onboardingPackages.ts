/**
 * onboardingPackages — build, mutate, publish draft packages.
 *
 * Stateless orchestrator: builds an OnboardingPackage from a
 * TeamProfile + catalog, triggers canvas hydration, persists via
 * ctx.db. Every function takes HandlerCtx so Slack, canvas, and
 * persistence plug in via DI.
 */

import type {HandlerCtx} from '../ctx';
import {buildOnboardingPackageSections} from '../onboarding/catalog';
import type {
  ChecklistItem,
  ConfluenceLink,
  OnboardingPackage,
  OnboardingPerson,
  OnboardingReferences,
  TeamProfile,
} from '../types';
import {
  createDraftWorkspace,
  syncDraftWorkspace,
  syncDraftWorkspaceMembers,
} from './canvas';
import {findOnboardingReferences, findPeopleGuides} from './confluenceSearch';

export interface DraftPackageOptions {
  profile: TeamProfile;
  createdByUserId: string;
  welcomeNote?: string | null;
  welcomeIntro?: string | null;
  /** If false, skip the Slack draft-channel hydration step. */
  hydrateSlack?: boolean;
}

export async function createDraftPackage(
  ctx: HandlerCtx,
  options: DraftPackageOptions
): Promise<OnboardingPackage> {
  const existing = await ctx.db.get(options.profile.userId);
  const pkg = await buildPackage(ctx, {
    profile: options.profile,
    createdByUserId: options.createdByUserId,
    status: 'draft',
    welcomeNote: options.welcomeNote,
    welcomeIntro: options.welcomeIntro,
    existing,
  });

  if (options.hydrateSlack !== false) {
    try {
      const workspace = await createDraftWorkspace(ctx, pkg, options.profile);
      if (workspace) {
        pkg.draftChannelId = workspace.channelId;
        pkg.draftChannelName = workspace.channelName;
        pkg.draftCanvasId = workspace.canvasId;
        pkg.draftCanvasUrl = workspace.canvasUrl;
      }
    } catch (error) {
      ctx.logger.warn(
        'Draft workspace hydration failed; package created without canvas.',
        error
      );
    }
  }

  pkg.updatedAt = new Date().toISOString();
  await ctx.db.create(pkg);
  ctx.logger.info(
    `Created onboarding draft for ${options.profile.userId} by ${options.createdByUserId}`
  );
  return pkg;
}

export async function updateDraftPackage(
  ctx: HandlerCtx,
  options: DraftPackageOptions
): Promise<OnboardingPackage | undefined> {
  const existing = await ctx.db.get(options.profile.userId);
  if (!existing || existing.status !== 'draft') return undefined;

  const pkg = await buildPackage(ctx, {
    profile: options.profile,
    createdByUserId: existing.createdByUserId,
    status: existing.status,
    welcomeNote: options.welcomeNote,
    welcomeIntro: options.welcomeIntro,
    existing,
    preserveExistingReviewers: false,
  });
  pkg.updatedAt = new Date().toISOString();
  await ctx.db.update(pkg);

  if (options.hydrateSlack !== false) {
    await syncDraftWorkspaceMembers(ctx, pkg).catch((error) =>
      ctx.logger.warn('Draft workspace member sync failed.', error)
    );
    await syncDraftWorkspace(ctx, pkg, options.profile).catch((error) =>
      ctx.logger.warn('Draft workspace sync failed.', error)
    );
  }

  ctx.logger.info(
    `Updated onboarding draft for ${options.profile.userId} by ${options.createdByUserId}`
  );
  return pkg;
}

export async function hydrateSlackWorkspace(
  ctx: HandlerCtx,
  pkg: OnboardingPackage,
  profile: TeamProfile
): Promise<OnboardingPackage> {
  if (pkg.draftChannelId) return pkg;
  const workspace = await createDraftWorkspace(ctx, pkg, profile);
  if (workspace) {
    pkg.draftChannelId = workspace.channelId;
    pkg.draftChannelName = workspace.channelName;
    pkg.draftCanvasId = workspace.canvasId;
    pkg.draftCanvasUrl = workspace.canvasUrl;
    pkg.updatedAt = new Date().toISOString();
    await ctx.db.update(pkg);
  }
  return pkg;
}

async function buildPackage(
  ctx: HandlerCtx,
  params: {
    profile: TeamProfile;
    createdByUserId: string;
    status: OnboardingPackage['status'];
    welcomeNote?: string | null;
    welcomeIntro?: string | null;
    existing?: OnboardingPackage;
    preserveExistingReviewers?: boolean;
  }
): Promise<OnboardingPackage> {
  const {
    profile,
    createdByUserId,
    status,
    welcomeNote,
    welcomeIntro,
    existing,
    preserveExistingReviewers = true,
  } = params;
  const createdAt = existing?.createdAt ?? new Date().toISOString();
  const resolvedWelcomeNote =
    welcomeNote === undefined
      ? existing?.welcomeNote
      : welcomeNote || undefined;
  const resolvedWelcomeIntro =
    welcomeIntro === undefined
      ? existing?.welcomeIntro
      : welcomeIntro || undefined;

  const buddy = profile.buddy;
  const people = dedupePeople([profile.manager, buddy, ...profile.teammates]);

  // Confluence references and per-person user guides are independent
  // searches against the same Confluence client. Run them in parallel so
  // the create-draft handler pays max(refs, guides) instead of the sum.
  const [references, peopleGuides] = await Promise.all([
    findOnboardingReferences(ctx, profile).catch((error) => {
      ctx.logger.warn('findOnboardingReferences failed.', error);
      return {} as OnboardingReferences;
    }),
    findPeopleGuides(ctx, profile, people).catch(
      (error): Record<string, ConfluenceLink> => {
        ctx.logger.warn('findPeopleGuides failed.', error);
        return {};
      }
    ),
  ]);
  const peopleWithGuides = people.map((person) => ({
    ...person,
    userGuide: peopleGuides[personIdentifier(person)] ?? person.userGuide,
  }));

  const reviewerUserIds = dedupeUserIds([
    createdByUserId,
    profile.manager.slackUserId,
    buddy.slackUserId,
    ...(preserveExistingReviewers ? (existing?.reviewerUserIds ?? []) : []),
  ]);
  const customChecklistItems = (existing?.customChecklistItems ?? []).map(
    cloneItem
  );

  return {
    userId: profile.userId,
    status,
    createdByUserId,
    managerUserId:
      profile.manager.slackUserId ?? existing?.managerUserId ?? createdByUserId,
    reviewerUserIds,
    newHireName: profile.displayName || existing?.newHireName,
    newHireAvatarUrl: profile.avatarUrl ?? existing?.newHireAvatarUrl,
    teamName: profile.teamName,
    pillarName: profile.pillarName,
    welcomeNote: resolvedWelcomeNote,
    welcomeIntro: resolvedWelcomeIntro,
    buddyUserId: buddy.slackUserId ?? existing?.buddyUserId,
    draftChannelId: existing?.draftChannelId,
    draftChannelName: existing?.draftChannelName,
    draftCanvasId: existing?.draftCanvasId,
    draftCanvasUrl: existing?.draftCanvasUrl,
    publishedAt: existing?.publishedAt,
    publishedByUserId: existing?.publishedByUserId,
    customChecklistItems,
    createdAt,
    updatedAt: new Date().toISOString(),
    sections: buildOnboardingPackageSections({
      profile: {
        ...profile,
        buddy,
      },
      references,
      people: peopleWithGuides,
      tasks: existing?.sections.initialEngineeringTasks.tasks ?? [],
      welcomeNote: resolvedWelcomeNote,
      welcomeIntro: resolvedWelcomeIntro,
      customChecklistItems,
    }),
  };
}

function dedupePeople(people: OnboardingPerson[]): OnboardingPerson[] {
  const seen = new Set<string>();
  const result: OnboardingPerson[] = [];
  for (const person of people) {
    const key = personIdentifier(person);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(person);
  }
  return result;
}

function cloneItem(item: ChecklistItem): ChecklistItem {
  return {...item};
}

function dedupeUserIds(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value)))
  );
}

function personIdentifier(person: OnboardingPerson): string {
  return (person.slackUserId || person.email || person.name).toLowerCase();
}
