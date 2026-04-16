import type {KnownBlock} from '@slack/types';
import type {Logger} from '../../../app/logger.js';
import type {GitHubService} from '../../../services/githubService.js';
import {inferGithubUsername} from '../../../services/githubService.js';
import type {JiraService} from '../../../services/jiraService.js';
import type {JourneyService} from '../../../services/journeyService.js';
import {header, section} from '../../../slack/blockKit.js';
import type {OnboardingPackage} from '../../types.js';
import {USER_GUIDE_SECTION_IDS} from '../../userGuide.js';
import {computeOnboardingWeekKey} from '../../weeklyAgenda.js';
import {buildToolAccessKey} from '../actionIds.js';
import {
  countChecklistItems,
  countCompletedChecklistItems,
} from './checklist.js';

export interface ManagerHireSummary {
  userId: string;
  firstName: string;
  daysIn: number;
  checklistCompleted: number;
  checklistTotal: number;
  userGuideAnswered: number;
  userGuideTotal: number;
  toolsChecked: number;
  toolsTotal: number;
  channelsJoined?: number;
  channelsTotal?: number;
  openPRs?: number;
  openTickets?: number;
}

/**
 * Render the manager summary card — one header + one section block per
 * managed hire. An empty input returns an empty block list so the caller
 * can prepend it unconditionally without an outer guard.
 */
export function renderManagerSummaryCard(
  summaries: ManagerHireSummary[]
): KnownBlock[] {
  if (summaries.length === 0) {
    return [];
  }

  const hireWord = summaries.length === 1 ? 'hire' : 'hires';
  const blocks: KnownBlock[] = [
    header(`Your ${summaries.length} onboarding ${hireWord}`),
  ];
  for (const summary of summaries) {
    blocks.push(section(formatHireBody(summary)));
  }
  return blocks;
}

function formatHireBody(summary: ManagerHireSummary): string {
  const headerLine = `*${summary.firstName}* (<@${summary.userId}>) — day ${summary.daysIn}`;
  const progressParts = [
    `Checklist ${summary.checklistCompleted}/${summary.checklistTotal}`,
    `User guide ${summary.userGuideAnswered}/${summary.userGuideTotal}`,
    `Tools ${summary.toolsChecked}/${summary.toolsTotal}`,
  ];
  if (
    typeof summary.channelsJoined === 'number' &&
    typeof summary.channelsTotal === 'number'
  ) {
    progressParts.push(
      `Channels ${summary.channelsJoined}/${summary.channelsTotal}`
    );
  }

  const lines = [headerLine, progressParts.join(' · ')];
  const activityParts: string[] = [];
  if (typeof summary.openPRs === 'number' && summary.openPRs > 0) {
    activityParts.push(
      `${summary.openPRs} open PR${summary.openPRs === 1 ? '' : 's'}`
    );
  }
  if (typeof summary.openTickets === 'number' && summary.openTickets > 0) {
    activityParts.push(
      `${summary.openTickets} ticket${summary.openTickets === 1 ? '' : 's'}`
    );
  }
  if (activityParts.length > 0) {
    lines.push(activityParts.join(' · '));
  }

  return lines.join('\n');
}

export interface BuildManagerSummariesDeps {
  journey: JourneyService;
  logger: Logger;
  github?: GitHubService;
  jira?: JiraService;
  /**
   * Optional per-hire email lookup. `peopleToMeet.people` does NOT
   * include the hire themselves, so GitHub/Jira lookups need a dedicated
   * resolver (typically a Slack users.info call). When absent, external
   * activity counts are skipped and the summary falls back to internal
   * progress signals only.
   */
  resolveHireEmail?: (hireUserId: string) => Promise<string | undefined>;
}

/**
 * Compose per-hire summaries for every managed package. External
 * activity counts (PRs, tickets) are only fetched for published hires
 * when the corresponding service is configured AND `resolveHireEmail`
 * is supplied — draft hires skip them entirely since pre-start activity
 * is not meaningful.
 */
export async function buildManagerSummaries(
  deps: BuildManagerSummariesDeps,
  packages: OnboardingPackage[],
  now: Date = new Date()
): Promise<ManagerHireSummary[]> {
  return Promise.all(
    packages.map((pkg) => buildManagerSummary(deps, pkg, now))
  );
}

async function buildManagerSummary(
  deps: BuildManagerSummariesDeps,
  pkg: OnboardingPackage,
  now: Date
): Promise<ManagerHireSummary> {
  const state = deps.journey.getState(pkg.userId);
  const stage = computeOnboardingWeekKey(pkg, now);

  const checklistSections = pkg.sections.onboardingChecklist.sections;
  const checklistCompleted = countCompletedChecklistItems(
    checklistSections,
    state
  );
  const checklistTotal = countChecklistItems(checklistSections);

  const userGuideAnswered = USER_GUIDE_SECTION_IDS.filter((id) => {
    const answer = state.userGuideIntake.answers[id];
    return typeof answer === 'string' && answer.trim().length > 0;
  }).length;
  const userGuideTotal = USER_GUIDE_SECTION_IDS.length;

  const tools = pkg.sections.toolsAccess.tools;
  const toolsChecked = tools.filter(
    (tool) =>
      state.toolAccess[buildToolAccessKey(tool.category, tool.tool)] === true
  ).length;
  const toolsTotal = tools.length;

  const summary: ManagerHireSummary = {
    userId: pkg.userId,
    firstName: extractFirstName(pkg),
    daysIn: stage.daysSince,
    checklistCompleted,
    checklistTotal,
    userGuideAnswered,
    userGuideTotal,
    toolsChecked,
    toolsTotal,
  };

  if (pkg.status !== 'published' || !deps.resolveHireEmail) {
    return summary;
  }

  const githubConfigured = deps.github?.isConfigured() ?? false;
  const jiraConfigured = deps.jira?.isConfigured() ?? false;
  if (!githubConfigured && !jiraConfigured) {
    return summary;
  }

  let hireEmail: string | undefined;
  try {
    hireEmail = await deps.resolveHireEmail(pkg.userId);
  } catch (error) {
    deps.logger.warn(
      `managerSummary: hire email lookup failed for ${pkg.userId}`,
      error
    );
    return summary;
  }

  if (githubConfigured && deps.github) {
    const handle = inferGithubUsername(hireEmail);
    if (handle) {
      try {
        const prs = await deps.github.findOpenPullRequestsForUser(handle);
        summary.openPRs = prs.length;
      } catch (error) {
        deps.logger.warn(
          `managerSummary: github lookup failed for ${pkg.userId}`,
          error
        );
      }
    }
  }

  if (jiraConfigured && deps.jira && hireEmail) {
    try {
      const issues = await deps.jira.findAssignedToEmail(hireEmail);
      summary.openTickets = issues.length;
    } catch (error) {
      deps.logger.warn(
        `managerSummary: jira lookup failed for ${pkg.userId}`,
        error
      );
    }
  }

  return summary;
}

const HI_FIRST_NAME_PATTERN = /^\*Hi\s+([^,*]+),/;

function extractFirstName(pkg: OnboardingPackage): string {
  const intro = pkg.sections.welcome.intro ?? '';
  const match = intro.match(HI_FIRST_NAME_PATTERN);
  if (match && match[1]) {
    return match[1].trim();
  }
  return 'Teammate';
}
