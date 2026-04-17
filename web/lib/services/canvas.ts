/**
 * canvas — Slack draft workspace + canvas operations.
 *
 * Ported from spark/src/services/canvasService.ts. Class-to-functions
 * conversion with explicit HandlerCtx threading. The Slack canvas
 * endpoints aren't on our narrow SlackClient interface directly, so
 * we route them through ctx.slack.apiCall.
 *
 * Published-workspace journey syncing (buildSharedProgressMarkdown)
 * is NOT ported in this pass — JourneyState lives in the retired
 * Node bot. publishWorkspace updates the static "Workspace status"
 * section and invites the hire; the richer progress sync can return
 * in a later phase if needed.
 */

import type { HandlerCtx } from "../ctx";
import {
  formatCanvasChecklistItem,
  formatCanvasChecklistResourceLink,
  formatCanvasPerson,
  groupPeopleByWeek,
  linkedChecklistItemsForMilestone,
} from "../onboarding/display";
import type {
  OnboardingPackage,
  OnboardingPerson,
  TeamProfile,
} from "../types";

export interface DraftWorkspace {
  channelId: string;
  channelName: string;
  canvasId?: string;
  canvasUrl?: string;
}

const MISSING_SCOPE_RE = /missing_scope|canvases:write|canvases:read/i;

export async function createDraftWorkspace(
  ctx: HandlerCtx,
  pkg: OnboardingPackage,
  profile: TeamProfile,
): Promise<DraftWorkspace | null> {
  try {
    const channelName = buildDraftChannelName(profile);
    ctx.logger.info(
      `Creating Spark draft channel for ${profile.userId} (${channelName})`,
    );
    const channel = await ctx.slack.conversations.create({
      name: channelName,
      is_private: true,
    });

    if (!channel.channel?.id || !channel.channel.name) {
      ctx.logger.warn(
        `Draft channel creation failed${channel.error ? `: ${channel.error}` : "."}`,
      );
      return null;
    }

    if (pkg.reviewerUserIds.length > 0) {
      await ctx.slack.conversations
        .invite({
          channel: channel.channel.id,
          users: pkg.reviewerUserIds.join(","),
        })
        .catch((error) =>
          ctx.logger.warn("Draft channel invite failed.", error),
        );
    }

    const canvas = await createChannelCanvas(
      ctx,
      channel.channel.id,
      `${profile.firstName}'s onboarding workspace`,
      buildDraftCanvasMarkdown(pkg, profile),
    );

    return {
      channelId: channel.channel.id,
      channelName: channel.channel.name,
      canvasId: canvas?.canvasId,
      canvasUrl: canvas?.canvasUrl,
    };
  } catch (error) {
    if (isMissingScope(error)) {
      ctx.logger.info(
        "Draft channel canvas creation skipped until the Slack app has the `canvases:write` scope.",
      );
      return null;
    }
    ctx.logger.warn(
      "Draft workspace creation failed, continuing without a collaborative draft channel.",
      error,
    );
    return null;
  }
}

export async function publishWorkspace(
  ctx: HandlerCtx,
  pkg: OnboardingPackage,
  profile: TeamProfile,
): Promise<void> {
  if (pkg.draftChannelId) {
    await inviteUserToWorkspace(ctx, pkg.draftChannelId, pkg.userId);
  }
  if (!pkg.draftCanvasId) return;
  try {
    await replaceManagedSection(
      ctx,
      pkg.draftCanvasId,
      "Workspace status",
      buildPublishedWorkspaceStatusMarkdown(pkg, profile),
    );
  } catch (error) {
    if (isMissingScope(error)) {
      ctx.logger.info(
        "Shared onboarding workspace sync skipped until the Slack app has the required canvases scopes.",
      );
      return;
    }
    ctx.logger.warn(
      `Failed to publish shared onboarding workspace for ${pkg.userId}.`,
      error,
    );
  }
}

export async function syncDraftWorkspace(
  ctx: HandlerCtx,
  pkg: OnboardingPackage,
  profile: TeamProfile,
): Promise<void> {
  if (!pkg.draftCanvasId) return;
  try {
    for (const managedSection of buildDraftManagedSections(pkg, profile)) {
      await replaceManagedSection(
        ctx,
        pkg.draftCanvasId,
        managedSection.title,
        managedSection.markdown,
      );
    }
  } catch (error) {
    if (isMissingScope(error)) {
      ctx.logger.info(
        "Draft onboarding workspace sync skipped until the Slack app has the required canvases scopes.",
      );
      return;
    }
    ctx.logger.warn(
      `Failed to sync draft onboarding workspace for ${pkg.userId}.`,
      error,
    );
  }
}

export async function syncDraftWorkspaceMembers(
  ctx: HandlerCtx,
  pkg: OnboardingPackage,
): Promise<void> {
  if (!pkg.draftChannelId) return;
  for (const userId of pkg.reviewerUserIds) {
    await inviteUserToWorkspace(ctx, pkg.draftChannelId, userId);
  }
}

async function createChannelCanvas(
  ctx: HandlerCtx,
  channelId: string,
  title: string,
  markdown: string,
): Promise<{ canvasId: string; canvasUrl?: string } | null> {
  try {
    const result = await ctx.slack.apiCall<{
      ok: boolean;
      canvas_id?: string;
      error?: string;
    }>("conversations.canvases.create", {
      channel_id: channelId,
      title,
      document_content: { type: "markdown", markdown },
    });
    if (!result.ok || !result.canvas_id) {
      ctx.logger.warn(
        `Canvas creation failed${result.error ? `: ${result.error}` : "."}`,
      );
      return null;
    }
    const auth = await ctx.slack.apiCall<{
      ok: boolean;
      url?: string;
      team_id?: string;
    }>("auth.test");
    return {
      canvasId: result.canvas_id,
      canvasUrl:
        auth.url && auth.team_id
          ? `${ensureTrailingSlash(auth.url)}docs/${auth.team_id}/${result.canvas_id}`
          : undefined,
    };
  } catch (error) {
    if (hasErrorCode(error, "channel_canvas_already_exists")) {
      const info = await ctx.slack.conversations.info({ channel: channelId });
      const canvasId = info.channel?.properties?.canvas?.canvas_id;
      if (!canvasId) return null;
      const auth = await ctx.slack.apiCall<{
        ok: boolean;
        url?: string;
        team_id?: string;
      }>("auth.test");
      return {
        canvasId,
        canvasUrl:
          auth.url && auth.team_id
            ? `${ensureTrailingSlash(auth.url)}docs/${auth.team_id}/${canvasId}`
            : undefined,
      };
    }
    ctx.logger.warn(
      "Canvas creation failed, continuing without canvas.",
      error,
    );
    return null;
  }
}

async function replaceManagedSection(
  ctx: HandlerCtx,
  canvasId: string,
  sectionTitle: string,
  markdown: string,
): Promise<void> {
  const sectionId = await lookupSectionId(ctx, canvasId, sectionTitle);
  const documentContent = { type: "markdown", markdown };
  const change = sectionId
    ? {
        operation: "replace",
        section_id: sectionId,
        document_content: documentContent,
      }
    : { operation: "insert_at_start", document_content: documentContent };
  const result = await ctx.slack.apiCall<{ ok: boolean; error?: string }>(
    "canvases.edit",
    { canvas_id: canvasId, changes: [change] },
  );
  if (!result.ok) {
    throw new Error(result.error || "Canvas edit failed");
  }
}

async function lookupSectionId(
  ctx: HandlerCtx,
  canvasId: string,
  sectionTitle: string,
): Promise<string | undefined> {
  const result = await ctx.slack.apiCall<{
    ok: boolean;
    error?: string;
    sections?: Array<{ id?: string }>;
  }>("canvases.sections.lookup", {
    canvas_id: canvasId,
    criteria: {
      section_types: ["h2"],
      contains_text: sectionTitle,
    },
  });
  if (!result.ok) {
    throw new Error(result.error || "Canvas section lookup failed");
  }
  return result.sections?.[0]?.id;
}

async function inviteUserToWorkspace(
  ctx: HandlerCtx,
  channelId: string,
  userId: string,
): Promise<void> {
  try {
    await ctx.slack.conversations.invite({ channel: channelId, users: userId });
  } catch (error) {
    if (hasErrorCode(error, "already_in_channel")) return;
    ctx.logger.warn(
      `Failed to invite ${userId} into shared onboarding workspace ${channelId}.`,
      error,
    );
  }
}

// ----- Markdown builders (ported verbatim from spark/src) -----

function buildDraftCanvasMarkdown(
  pkg: OnboardingPackage,
  profile: TeamProfile,
): string {
  return buildDraftManagedSections(pkg, profile)
    .map((section) => section.markdown)
    .join("\n\n");
}

function buildDraftManagedSections(
  pkg: OnboardingPackage,
  profile: TeamProfile,
): Array<{ title: string; markdown: string }> {
  return [
    {
      title: `Onboarding workspace for ${profile.displayName}`,
      markdown: buildWorkspaceIntroMarkdown(profile),
    },
    {
      title: "Workspace status",
      markdown: buildDraftWorkspaceStatusMarkdown(),
    },
    {
      title: "Progress sync",
      markdown: buildDraftProgressMarkdown(),
    },
    {
      title: "Team setup notes",
      markdown: buildTeamSetupNotesMarkdown(),
    },
    {
      title: "Welcome",
      markdown: buildWelcomeCanvasMarkdown(pkg),
    },
    {
      title: "Onboarding Checklist",
      markdown: buildChecklistCanvasMarkdown(
        pkg.sections.onboardingChecklist.sections,
      ),
    },
    {
      title: "Onboarding journey",
      markdown: buildJourneyCanvasMarkdown(
        pkg.sections.onboardingChecklist.sections,
        pkg.sections.welcome.journeyMilestones,
      ),
    },
    {
      title: "People to Meet",
      markdown: buildPeopleCanvasMarkdown(pkg.sections.peopleToMeet.people),
    },
    {
      title: "Tools Access Checklist",
      markdown: buildToolsCanvasMarkdown(pkg.sections.toolsAccess.tools),
    },
    {
      title: "Slack",
      markdown: buildSlackCanvasMarkdown(pkg.sections.slack.channels),
    },
    {
      title: "Initial Engineering Tasks",
      markdown: buildInitialTasksCanvasMarkdown(pkg),
    },
    {
      title: "Rituals",
      markdown: buildRitualsCanvasMarkdown(pkg.sections.rituals.rituals),
    },
    {
      title: "Engineering Resource Library",
      markdown: buildResourceLibraryCanvasMarkdown(
        pkg.sections.engineeringResourceLibrary,
      ),
    },
  ];
}

function buildWorkspaceIntroMarkdown(profile: TeamProfile): string {
  return [
    `# Onboarding workspace for ${profile.displayName}`,
    "",
    `Built for **${profile.teamName}**${
      profile.pillarName ? ` in **${profile.pillarName}**.` : "."
    }`,
  ].join("\n");
}

function buildTeamSetupNotesMarkdown(): string {
  return [
    "## Team setup notes",
    "",
    "- Use the draft review buttons in Slack to update the welcome note, onboarding buddy, reviewers, and publish status.",
    "- Use this canvas for team-specific notes, links, and longer context you want everyone to keep close after publish.",
  ].join("\n");
}

function buildWelcomeCanvasMarkdown(pkg: OnboardingPackage): string {
  return [
    "## Welcome",
    "",
    pkg.sections.welcome.intro,
    ...(pkg.sections.welcome.personalizedNote
      ? ["", `> ${pkg.sections.welcome.personalizedNote}`]
      : []),
  ].join("\n");
}

function buildChecklistCanvasMarkdown(
  checklist: OnboardingPackage["sections"]["onboardingChecklist"]["sections"],
): string {
  return [
    "## Onboarding Checklist",
    "",
    ...checklist.flatMap((section) => [
      `### ${section.title}`,
      section.goal,
      "",
      ...section.items.flatMap((item) => formatCanvasChecklistItem(item)),
      "",
    ]),
  ].join("\n");
}

function buildJourneyCanvasMarkdown(
  checklist: OnboardingPackage["sections"]["onboardingChecklist"]["sections"],
  milestones: OnboardingPackage["sections"]["welcome"]["journeyMilestones"],
): string {
  return [
    "## Onboarding journey",
    "",
    ...milestones.flatMap((milestone) => {
      const links = linkedChecklistItemsForMilestone(
        checklist,
        milestone.label,
      );
      return [
        `### ${milestone.label}`,
        `- New hire focus: ${milestone.keyActivities}`,
        `- Manager / buddy support: ${milestone.supportActions}`,
        ...(links.length > 0
          ? [
              `- Key links: ${links
                .map(formatCanvasChecklistResourceLink)
                .join(", ")}`,
            ]
          : []),
        "",
      ];
    }),
  ].join("\n");
}

function buildPeopleCanvasMarkdown(people: OnboardingPerson[]): string {
  return ["## People to Meet", "", ...renderPeopleByBucket(people)].join("\n");
}

function buildToolsCanvasMarkdown(
  tools: OnboardingPackage["sections"]["toolsAccess"]["tools"],
): string {
  return [
    "## Tools Access Checklist",
    "",
    ...tools.map((tool) => `- [ ] **${tool.tool}** — ${tool.description}`),
  ].join("\n");
}

function buildSlackCanvasMarkdown(
  channels: OnboardingPackage["sections"]["slack"]["channels"],
): string {
  return [
    "## Slack",
    "",
    ...channels.map(
      (channel) => `- **${channel.channel}** — ${channel.description}`,
    ),
  ].join("\n");
}

function buildInitialTasksCanvasMarkdown(pkg: OnboardingPackage): string {
  const tasks = pkg.sections.initialEngineeringTasks.tasks;
  return [
    "## Initial Engineering Tasks",
    "",
    pkg.sections.initialEngineeringTasks.managerPrompt,
    ...(tasks.length > 0
      ? [
          "",
          ...tasks.flatMap((task) => [
            `- **${task.title}** — ${task.description}`,
            `  - Why it works well for ramp-up: ${task.rationale}`,
          ]),
        ]
      : ["", "- Add or confirm a few scoped Jira tickets before publishing."]),
  ].join("\n");
}

function buildRitualsCanvasMarkdown(
  rituals: OnboardingPackage["sections"]["rituals"]["rituals"],
): string {
  return [
    "## Rituals",
    "",
    ...rituals.map(
      (ritual) =>
        `- **${ritual.meeting}** — ${ritual.cadence}, ${ritual.attendance.toLowerCase()}`,
    ),
  ].join("\n");
}

function buildResourceLibraryCanvasMarkdown(
  resources: OnboardingPackage["sections"]["engineeringResourceLibrary"],
): string {
  return [
    "## Engineering Resource Library",
    "",
    ...resources.docs.map((doc) =>
      doc.url
        ? `- [${doc.title}](${doc.url}) — ${doc.description}`
        : `- ${doc.title} — ${doc.description}`,
    ),
    ...(resources.references.teamPage
      ? [
          "",
          `- [${resources.references.teamPage.title}](${resources.references.teamPage.url}) — ${resources.references.teamPage.summary}`,
        ]
      : []),
    ...(resources.references.pillarPage
      ? [
          `- [${resources.references.pillarPage.title}](${resources.references.pillarPage.url}) — ${resources.references.pillarPage.summary}`,
        ]
      : []),
    ...(resources.references.newHireGuide
      ? [
          `- [${resources.references.newHireGuide.title}](${resources.references.newHireGuide.url}) — ${resources.references.newHireGuide.summary}`,
        ]
      : []),
    "",
    "## Key repo paths",
    "",
    ...(resources.keyPaths.length > 0
      ? resources.keyPaths.map((path) => `- \`${path}\``)
      : ["- Ask your buddy which CODEOWNERS paths matter most for your team."]),
  ].join("\n");
}

function renderPeopleByBucket(people: OnboardingPerson[]): string[] {
  const lines: string[] = [];
  for (const bucket of groupPeopleByWeek(people)) {
    lines.push(`### ${bucket.label}`, "");
    for (const person of bucket.people) {
      lines.push(
        `- **${formatCanvasPerson(person)}** — ${person.role}. ${person.discussionPoints}`,
      );
    }
    lines.push("");
  }
  return lines;
}

function buildDraftWorkspaceStatusMarkdown(): string {
  return [
    "## Workspace status",
    "",
    "This canvas starts as the team onboarding workspace before it is shared with the new hire.",
    "- Review the package in Slack before you publish it.",
    "- Keep team-specific notes, links, and longer context in the sections below.",
    "- After publish, the progress sync section stays current for the manager, onboarding buddy, and new hire.",
  ].join("\n");
}

function buildDraftProgressMarkdown(): string {
  return [
    "## Progress sync",
    "",
    "This section updates automatically after publish, so the manager, onboarding buddy, and new hire can stay aligned in one place.",
    "- Status: Draft review",
    "- Checklist progress: Not started yet",
    "- Onboarding journey: Starts after publish",
    "- Current ramp task: Confirm a starter task before you publish",
  ].join("\n");
}

function buildPublishedWorkspaceStatusMarkdown(
  pkg: OnboardingPackage,
  profile: TeamProfile,
): string {
  return [
    "## Workspace status",
    "",
    "This is the shared onboarding workspace for the new hire, manager, and onboarding buddy.",
    `- New hire: ${formatCanvasUser(pkg.userId, profile.displayName)}`,
    `- Manager: ${formatCanvasUser(pkg.managerUserId, profile.manager.name)}`,
    ...(pkg.buddyUserId
      ? [
          `- Onboarding buddy: ${formatCanvasUser(pkg.buddyUserId, profile.buddy.name)}`,
        ]
      : []),
    "- The progress sync section stays current as the new hire updates Home and moves through the guided flow.",
    "- Keep any team-specific notes, edits, or follow-up details in the sections below.",
  ].join("\n");
}

function formatCanvasUser(
  userId: string | undefined,
  fallback: string,
): string {
  return userId ? `![](@${userId})` : fallback;
}

function buildDraftChannelName(profile: TeamProfile): string {
  const slug = profile.displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `spark-${slug || "new-hire"}-${profile.userId.toLowerCase().slice(-6)}`;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function hasErrorCode(error: unknown, code: string): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  return record.error === code || record.code === code;
}

function isMissingScope(error: unknown): boolean {
  if (!error) return false;
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : JSON.stringify(error);
  return MISSING_SCOPE_RE.test(msg);
}
