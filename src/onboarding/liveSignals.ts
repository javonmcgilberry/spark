import type { Logger } from "../app/logger.js";
import type { GitHubService } from "../services/githubService.js";
import { inferGithubUsername } from "../services/githubService.js";
import type { JiraService } from "../services/jiraService.js";
import { buildToolAccessKey } from "./home/actionIds.js";
import type { JourneyState, OnboardingPackage, TeamProfile } from "./types.js";
import {
  USER_GUIDE_SECTION_IDS,
  type UserGuideSectionId,
} from "./userGuide.js";
import type { OnboardingStage } from "./weeklyAgenda.js";

export interface LiveSignalContext {
  profile: TeamProfile;
  state: JourneyState;
  onboardingPackage?: OnboardingPackage;
  stage: OnboardingStage;
  joinedSlackChannels?: Set<string>;
  github?: GitHubService;
  jira?: JiraService;
  logger: Logger;
}

export interface LiveSignal {
  id: string;
  title: string;
  message: string;
  priority: number;
}

/**
 * Cap for pill titles — Slack renders longer labels but they truncate
 * mid-word. We keep them inside 24 chars so every pill reads cleanly.
 */
const TITLE_MAX_CHARS = 24;
const MAX_PILLS = 4;

export async function computeLiveSignals(
  ctx: LiveSignalContext,
): Promise<LiveSignal[]> {
  const signals = await Promise.all([
    computeUserGuideSignal(ctx),
    computeTeammateShippingSignal(ctx),
    computePrsAwaitingReviewSignal(ctx),
    computeUnjoinedChannelsSignal(ctx),
    computeAssignedJiraSignal(ctx),
    computeOpenAuthoredPrsSignal(ctx),
    computeSurveyDueSignal(ctx),
    computeChecklistPendingSignal(ctx),
    computeToolAccessGapSignal(ctx),
    computeStageCheckpointSignal(ctx),
  ]);

  return signals
    .filter((signal): signal is LiveSignal => signal !== null)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, MAX_PILLS);
}

function truncateTitle(title: string): string {
  if (title.length <= TITLE_MAX_CHARS) {
    return title;
  }
  return `${title.slice(0, TITLE_MAX_CHARS - 1).trimEnd()}…`;
}

function buildSignal(
  id: string,
  title: string,
  message: string,
  priority: number,
): LiveSignal {
  return { id, title: truncateTitle(title), message, priority };
}

async function computeUserGuideSignal(
  ctx: LiveSignalContext,
): Promise<LiveSignal | null> {
  const intake = ctx.state.userGuideIntake;
  const answeredCount = USER_GUIDE_SECTION_IDS.filter(
    (id: UserGuideSectionId) => {
      const answer = intake.answers[id];
      return typeof answer === "string" && answer.trim().length > 0;
    },
  ).length;

  if (intake.completedAt && answeredCount === USER_GUIDE_SECTION_IDS.length) {
    return null;
  }

  if (answeredCount === 0) {
    return buildSignal(
      "user-guide-start",
      "Draft my User Guide",
      "Help me draft my Webflow User Guide — ask me one section at a time.",
      9,
    );
  }

  return buildSignal(
    "user-guide-resume",
    `Resume User Guide (${answeredCount}/${USER_GUIDE_SECTION_IDS.length})`,
    "Keep drafting my User Guide — ask me the next section.",
    8,
  );
}

async function computeTeammateShippingSignal(
  ctx: LiveSignalContext,
): Promise<LiveSignal | null> {
  if (!ctx.github?.isConfigured() || !ctx.profile.githubTeamSlug) {
    return null;
  }

  try {
    const prs = await ctx.github.findRecentPullRequestsForTeam(
      ctx.profile.githubTeamSlug,
    );
    if (prs.length === 0) {
      return null;
    }
    const distinctAuthors = new Set(prs.map((pr) => pr.author)).size;
    const label =
      distinctAuthors > 1
        ? `${distinctAuthors} teammates shipping`
        : `1 teammate shipping`;
    return buildSignal(
      "teammate-shipping",
      label,
      "Summarize what my team has shipped recently so I know what's in motion.",
      7,
    );
  } catch (error) {
    ctx.logger.warn("liveSignals: teammate-shipping failed", error);
    return null;
  }
}

async function computePrsAwaitingReviewSignal(
  ctx: LiveSignalContext,
): Promise<LiveSignal | null> {
  if (!ctx.github?.isConfigured()) {
    return null;
  }
  const handle = inferGithubUsername(ctx.profile.email);
  if (!handle) {
    return null;
  }
  try {
    const prs = await ctx.github.findPullRequestsAwaitingReview(handle);
    if (prs.length === 0) {
      return null;
    }
    return buildSignal(
      "prs-awaiting-review",
      `${prs.length} PR${prs.length === 1 ? "" : "s"} need my review`,
      "Show me the PRs waiting on my review and what each one is about.",
      7,
    );
  } catch (error) {
    ctx.logger.warn("liveSignals: prs-awaiting-review failed", error);
    return null;
  }
}

async function computeOpenAuthoredPrsSignal(
  ctx: LiveSignalContext,
): Promise<LiveSignal | null> {
  if (!ctx.github?.isConfigured()) {
    return null;
  }
  const handle = inferGithubUsername(ctx.profile.email);
  if (!handle) {
    return null;
  }
  try {
    const prs = await ctx.github.findOpenPullRequestsForUser(handle);
    if (prs.length === 0) {
      return null;
    }
    return buildSignal(
      "open-authored-prs",
      `${prs.length} of my PRs open`,
      "Summarize my open pull requests and what's next on each.",
      5,
    );
  } catch (error) {
    ctx.logger.warn("liveSignals: open-authored-prs failed", error);
    return null;
  }
}

async function computeAssignedJiraSignal(
  ctx: LiveSignalContext,
): Promise<LiveSignal | null> {
  if (!ctx.jira?.isConfigured() || !ctx.profile.email) {
    return null;
  }
  try {
    const issues = await ctx.jira.findAssignedToEmail(ctx.profile.email);
    if (issues.length === 0) {
      return null;
    }
    return buildSignal(
      "assigned-jira",
      `${issues.length} ticket${issues.length === 1 ? "" : "s"} assigned`,
      "What are my open Jira tickets, and which should I pick up first?",
      6,
    );
  } catch (error) {
    ctx.logger.warn("liveSignals: assigned-jira failed", error);
    return null;
  }
}

async function computeUnjoinedChannelsSignal(
  ctx: LiveSignalContext,
): Promise<LiveSignal | null> {
  const joined = ctx.joinedSlackChannels;
  if (!joined) {
    return null;
  }
  const channels = ctx.onboardingPackage?.sections.slack.channels;
  if (!channels || channels.length === 0) {
    return null;
  }
  const unjoined = channels.filter((channel) => {
    const normalized = channel.channel.replace(/^#/, "").toLowerCase();
    return !joined.has(normalized);
  });
  if (unjoined.length === 0) {
    return null;
  }
  return buildSignal(
    "unjoined-channels",
    `${unjoined.length} channel${unjoined.length === 1 ? "" : "s"} to join`,
    "Which recommended Slack channels haven't I joined yet? Strike through the ones I'm already in.",
    6,
  );
}

async function computeChecklistPendingSignal(
  ctx: LiveSignalContext,
): Promise<LiveSignal | null> {
  const sections = ctx.onboardingPackage?.sections.onboardingChecklist.sections;
  if (!sections || sections.length === 0) {
    return null;
  }

  let pending = 0;
  for (const section of sections) {
    for (let i = 0; i < section.items.length; i += 1) {
      const key = `${section.id}:${i}`;
      if (ctx.state.itemStatuses[key] !== "completed") {
        pending += 1;
      }
    }
  }

  if (pending === 0) {
    return null;
  }

  return buildSignal(
    "checklist-pending",
    `${pending} checklist item${pending === 1 ? "" : "s"} open`,
    "Which checklist items should I knock out next based on where I am in onboarding?",
    4,
  );
}

async function computeToolAccessGapSignal(
  ctx: LiveSignalContext,
): Promise<LiveSignal | null> {
  const tools = ctx.onboardingPackage?.sections.toolsAccess.tools;
  if (!tools || tools.length === 0) {
    return null;
  }
  const missing = tools.filter((tool) => {
    const key = buildToolAccessKey(tool.category, tool.tool);
    return ctx.state.toolAccess[key] !== true;
  }).length;

  if (missing === 0) {
    return null;
  }

  return buildSignal(
    "tool-access-gap",
    `${missing} tool${missing === 1 ? "" : "s"} to request`,
    "Which tools do I still need to request access to, and who should I ping for each?",
    3,
  );
}

/**
 * People Team sends onboarding surveys at Week 1+2, Week 5, and 90-day marks.
 * We surface a reminder pill in the 4-day window leading up to each deadline.
 * Windows are inclusive on both ends: [deadline - 3, deadline].
 */
const SURVEY_DEADLINES_DAYS = [14, 35, 90] as const;
const SURVEY_REMINDER_WINDOW_DAYS = 3;

async function computeSurveyDueSignal(
  ctx: LiveSignalContext,
): Promise<LiveSignal | null> {
  const { daysSince } = ctx.stage;
  const deadline = SURVEY_DEADLINES_DAYS.find(
    (d) => daysSince >= d - SURVEY_REMINDER_WINDOW_DAYS && daysSince <= d,
  );
  if (deadline === undefined) {
    return null;
  }
  const daysRemaining = deadline - daysSince;
  const title =
    daysRemaining === 0
      ? "Survey due today"
      : `Survey due in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`;
  return buildSignal(
    "survey-due",
    title,
    "What's the onboarding survey about, and what should I be ready to answer? Don't draft my answers — just walk me through what it covers.",
    7,
  );
}

async function computeStageCheckpointSignal(
  ctx: LiveSignalContext,
): Promise<LiveSignal | null> {
  const { weekKey, daysSince } = ctx.stage;
  const humanLabel = describeWeekKey(weekKey);
  return buildSignal(
    "stage-checkpoint",
    `Day ${daysSince} — ${humanLabel}`,
    `Where should I be by the end of ${humanLabel}, and what is one specific thing I could check off today?`,
    2,
  );
}

function describeWeekKey(weekKey: OnboardingStage["weekKey"]): string {
  switch (weekKey) {
    case "week1":
      return "week 1";
    case "week2":
      return "week 2";
    case "week3":
      return "week 3";
    case "week4":
      return "week 4";
    case "stretch60":
      return "the 60-day mark";
    case "stretch90":
      return "the 90-day mark";
    case "beyond90":
      return "quarter 2";
  }
}
