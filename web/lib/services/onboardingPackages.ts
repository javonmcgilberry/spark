/**
 * onboardingPackages — build, mutate, publish draft packages.
 *
 * Ported from spark/src/services/onboardingPackageService.ts. The
 * state (the Map of packages) moved to DraftStore; this module is
 * now stateless and just orchestrates "build package, run canvas
 * hydrate, persist via ctx.db".
 *
 * Every function takes HandlerCtx so Slack, canvas, and persistence
 * plug in via DI.
 */

import type { HandlerCtx } from "../ctx";
import { buildOnboardingPackageSections } from "../onboarding/catalog";
import type {
  ChecklistItem,
  ConfluenceLink,
  OnboardingPackage,
  OnboardingPerson,
  OnboardingPersonKind,
  TeamProfile,
} from "../types";
import {
  createDraftWorkspace,
  syncDraftWorkspace,
  syncDraftWorkspaceMembers,
} from "./canvas";
import { findOnboardingReferences, findPeopleGuides } from "./confluenceSearch";

export interface DraftPackageOptions {
  profile: TeamProfile;
  createdByUserId: string;
  welcomeNote?: string | null;
  welcomeIntro?: string | null;
  buddyUserId?: string | null;
  stakeholderUserIds?: string[];
  /** If false, skip the Slack draft-channel hydration step. */
  hydrateSlack?: boolean;
}

export async function createDraftPackage(
  ctx: HandlerCtx,
  options: DraftPackageOptions,
): Promise<OnboardingPackage> {
  const existing = await ctx.db.get(options.profile.userId);
  const pkg = await buildPackage(ctx, {
    profile: options.profile,
    createdByUserId: options.createdByUserId,
    status: "draft",
    welcomeNote: options.welcomeNote,
    welcomeIntro: options.welcomeIntro,
    buddyUserId: options.buddyUserId,
    stakeholderUserIds: options.stakeholderUserIds,
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
        "Draft workspace hydration failed; package created without canvas.",
        error,
      );
    }
  }

  pkg.updatedAt = new Date().toISOString();
  await ctx.db.create(pkg);
  ctx.logger.info(
    `Created onboarding draft for ${options.profile.userId} by ${options.createdByUserId}`,
  );
  return pkg;
}

export async function updateDraftPackage(
  ctx: HandlerCtx,
  options: DraftPackageOptions,
): Promise<OnboardingPackage | undefined> {
  const existing = await ctx.db.get(options.profile.userId);
  if (!existing || existing.status !== "draft") return undefined;

  const pkg = await buildPackage(ctx, {
    profile: options.profile,
    createdByUserId: existing.createdByUserId,
    status: existing.status,
    welcomeNote: options.welcomeNote,
    welcomeIntro: options.welcomeIntro,
    buddyUserId: options.buddyUserId,
    stakeholderUserIds: options.stakeholderUserIds,
    existing,
    preserveExistingReviewers: false,
  });
  pkg.updatedAt = new Date().toISOString();
  await ctx.db.update(pkg);

  if (options.hydrateSlack !== false) {
    await syncDraftWorkspaceMembers(ctx, pkg).catch((error) =>
      ctx.logger.warn("Draft workspace member sync failed.", error),
    );
    await syncDraftWorkspace(ctx, pkg, options.profile).catch((error) =>
      ctx.logger.warn("Draft workspace sync failed.", error),
    );
  }

  ctx.logger.info(
    `Updated onboarding draft for ${options.profile.userId} by ${options.createdByUserId}`,
  );
  return pkg;
}

export async function hydrateSlackWorkspace(
  ctx: HandlerCtx,
  pkg: OnboardingPackage,
  profile: TeamProfile,
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
    status: OnboardingPackage["status"];
    welcomeNote?: string | null;
    welcomeIntro?: string | null;
    buddyUserId?: string | null;
    stakeholderUserIds?: string[];
    existing?: OnboardingPackage;
    preserveExistingReviewers?: boolean;
  },
): Promise<OnboardingPackage> {
  const {
    profile,
    createdByUserId,
    status,
    welcomeNote,
    welcomeIntro,
    buddyUserId,
    stakeholderUserIds = [],
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

  const buddy = buddyUserId
    ? await lookupSlackPerson(ctx, buddyUserId, "buddy", "week1-2", "manager")
    : profile.buddy;
  const stakeholderPeople =
    stakeholderUserIds.length > 0
      ? await Promise.all(
          stakeholderUserIds.map((userId) =>
            lookupSlackPerson(ctx, userId, undefined, "week2-3", "manager"),
          ),
        )
      : [];
  const people = dedupePeople([
    profile.manager,
    buddy,
    ...profile.teammates,
    ...stakeholderPeople,
  ]);

  const references = await findOnboardingReferences(ctx, profile).catch(
    (error) => {
      ctx.logger.warn("findOnboardingReferences failed.", error);
      return {};
    },
  );
  const peopleGuides: Record<string, ConfluenceLink> = await findPeopleGuides(
    ctx,
    profile,
    people,
  ).catch((error) => {
    ctx.logger.warn("findPeopleGuides failed.", error);
    return {};
  });
  const peopleWithGuides = people.map((person) => ({
    ...person,
    userGuide: peopleGuides[personIdentifier(person)] ?? person.userGuide,
  }));

  const reviewerUserIds = dedupeUserIds([
    createdByUserId,
    profile.manager.slackUserId,
    buddy.slackUserId,
    ...stakeholderUserIds,
    ...(preserveExistingReviewers ? (existing?.reviewerUserIds ?? []) : []),
  ]);
  const customChecklistItems = (existing?.customChecklistItems ?? []).map(
    cloneItem,
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

async function lookupSlackPerson(
  ctx: HandlerCtx,
  userId: string,
  fallbackKind: OnboardingPersonKind | undefined,
  weekBucket: OnboardingPerson["weekBucket"],
  editableBy: OnboardingPerson["editableBy"],
): Promise<OnboardingPerson> {
  try {
    const response = await ctx.slack.users.info({ user: userId });
    const user = response.user;
    const profile = user?.profile;
    const name =
      user?.real_name ??
      profile?.real_name ??
      profile?.display_name ??
      "Slack user";
    const title = profile?.title?.trim();
    const kind = inferPersonKind(title, fallbackKind);
    return {
      name,
      role: title || roleForKind(kind),
      kind,
      title,
      discussionPoints: discussionPointsForKind(name, kind),
      weekBucket,
      editableBy,
      email: profile?.email,
      slackUserId: user?.id,
      avatarUrl: profile?.image_192 ?? profile?.image_72,
    };
  } catch (error) {
    ctx.logger.warn(`lookupSlackPerson failed for ${userId}`, error);
    return {
      name: "Slack user",
      role: roleForKind(fallbackKind ?? "teammate"),
      kind: fallbackKind ?? "teammate",
      discussionPoints: discussionPointsForKind(
        "Slack user",
        fallbackKind ?? "teammate",
      ),
      weekBucket,
      editableBy,
      slackUserId: userId,
    };
  }
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
  return { ...item };
}

function dedupeUserIds(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  );
}

function personIdentifier(person: OnboardingPerson): string {
  return (person.slackUserId || person.email || person.name).toLowerCase();
}

function inferPersonKind(
  title: string | undefined,
  fallbackKind: OnboardingPersonKind | undefined,
): OnboardingPersonKind {
  const normalized = title?.toLowerCase() ?? "";
  if (normalized.includes("product manager")) return "pm";
  if (normalized.includes("designer")) return "designer";
  if (
    normalized.includes("people partner") ||
    normalized.includes("business partner")
  ) {
    return "people-partner";
  }
  if (normalized.includes("director")) return "director";
  return fallbackKind ?? "teammate";
}

function roleForKind(kind: OnboardingPersonKind): string {
  switch (kind) {
    case "manager":
      return "Engineering Manager";
    case "buddy":
      return "Onboarding Buddy";
    case "pm":
      return "Product Manager";
    case "designer":
      return "Product Designer";
    case "director":
      return "Director";
    case "people-partner":
      return "People Partner";
    default:
      return "Teammate";
  }
}

function discussionPointsForKind(
  name: string,
  kind: OnboardingPersonKind,
): string {
  const firstName = name.split(/\s+/)[0] || name;
  switch (kind) {
    case "manager":
      return "Role expectations, day-to-day support, performance goals, and how the team roadmap connects to the first few weeks.";
    case "buddy":
      return "Day-to-day help, codebase guidance, debugging habits, and the team norms that rarely make it into docs.";
    case "pm":
      return `Ask ${firstName} about roadmap context, priority tradeoffs, and how engineering work connects to customer value.`;
    case "designer":
      return `Ask ${firstName} how design intent is shared, reviewed, and handed off in your area.`;
    case "director":
      return `Ask ${firstName} how your team fits into the broader pillar strategy and where the group is headed next.`;
    case "people-partner":
      return `Ask ${firstName} about growth support, milestone conversations, and people programs that become more relevant after the first month.`;
    default:
      return `Ask ${firstName} what they own, which systems they touch most often, and what they wish they had known in their first month at Webflow.`;
  }
}
