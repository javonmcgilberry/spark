import type {KnownBlock} from '@slack/types';
import {
  buildDraftPendingBlocks,
  buildCelebrationBlocks,
  buildContributionBlocks,
  buildFollowUpBlocks,
  buildOrientationBlocks,
  buildPeopleBlocks,
  buildTaskPreviewBlocks,
  buildWelcomeBlocks,
} from '../onboarding/blocks.js';
import {APP_NAME} from '../config/constants.js';
import {BUDDY_EXPECTATIONS} from '../onboarding/buddyGuide.js';
import type {
  ChecklistItemStatus,
  ContributionTask,
  JourneyState,
  OnboardingPackage,
  TeamProfile,
} from '../onboarding/types.js';
import {
  USER_GUIDE_SECTION_IDS,
  buildUserGuideMarkdown,
  isUserGuideSectionId,
  type UserGuideSectionId,
} from '../onboarding/userGuide.js';
import {actions, divider, header, section} from '../slack/blockKit.js';
import {
  type ContributionGuide,
  ContributionGuideService,
} from './contributionGuideService.js';
import {
  inferGithubUsername,
  type GitHubPullRequest,
  type GitHubService,
} from './githubService.js';
import type {JiraService, JiraIssue} from './jiraService.js';
import type {OnboardingStage, OnboardingWeekKey} from '../onboarding/weeklyAgenda.js';
import {
  type AnswerUserResult,
  type ConversationHistoryTurn,
  LlmService,
  type SuggestedPrompt,
} from './llmService.js';
import {OnboardingPackageService} from './onboardingPackageService.js';
import {TaskScannerService} from './taskScannerService.js';

export type {AnswerUserResult, ConversationHistoryTurn, SuggestedPrompt};

export interface JourneyReply {
  text: string;
  blocks: KnownBlock[];
}

export interface PreparedJourneyData {
  profile: TeamProfile;
  state: JourneyState;
  onboardingPackage?: OnboardingPackage;
}

const TASK_CACHE_TTL_MS = 10 * 60 * 1000;
const BUDDY_CHECKIN_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

export interface AgentToolkit {
  github?: GitHubService;
  jira?: JiraService;
}

export class JourneyService {
  private readonly states = new Map<string, JourneyState>();
  private readonly github?: GitHubService;
  private readonly jira?: JiraService;

  constructor(
    private readonly taskScanner: TaskScannerService,
    private readonly llmService: LlmService,
    private readonly contributionGuideService: ContributionGuideService,
    private readonly onboardingPackageService: OnboardingPackageService,
    toolkit: AgentToolkit = {}
  ) {
    this.github = toolkit.github;
    this.jira = toolkit.jira;
  }

  async start(profile: TeamProfile): Promise<JourneyReply> {
    return this.buildStartReply(await this.prepareStart(profile));
  }

  async prepareStart(profile: TeamProfile): Promise<PreparedJourneyData> {
    const onboardingPackage = this.onboardingPackageService.getPackageForUser(
      profile.userId
    );
    const prepared = this.prepareData(profile, onboardingPackage);
    prepared.state.updatedAt = new Date().toISOString();
    return prepared;
  }

  buildStartReply(prepared: PreparedJourneyData): JourneyReply {
    if (!prepared.onboardingPackage) {
      return {
        text: `Your manager or onboarding team is still getting your onboarding plan ready. ${APP_NAME} will open it as soon as it is published.`,
        blocks: buildDraftPendingBlocks(),
      };
    }
    if (prepared.onboardingPackage.status === 'draft') {
      return draftPendingReply();
    }

    return {
      text: `Welcome to Webflow, ${prepared.profile.firstName}. Here's your day 1 guide.`,
      blocks: buildWelcomeBlocks(prepared.onboardingPackage, prepared.state),
    };
  }

  async prepareDashboard(profile: TeamProfile): Promise<PreparedJourneyData> {
    return this.prepareData(
      profile,
      this.onboardingPackageService.getPackageForUser(profile.userId)
    );
  }

  setItemStatus(
    userId: string,
    itemKey: string,
    status: ChecklistItemStatus
  ): JourneyState {
    const state = this.getOrCreateState(userId);
    state.itemStatuses[itemKey] = status;
    state.updatedAt = new Date().toISOString();
    return state;
  }

  setToolAccessForKeys(
    userId: string,
    allKeysInGroup: string[],
    selectedKeys: Set<string>
  ): JourneyState {
    const state = this.getOrCreateState(userId);
    const nextAccess: Record<string, boolean> = {...state.toolAccess};
    for (const key of allKeysInGroup) {
      if (selectedKeys.has(key)) {
        nextAccess[key] = true;
      } else {
        nextAccess[key] = false;
      }
    }
    state.toolAccess = Object.fromEntries(
      Object.entries(nextAccess).filter(([, value]) => value === true)
    );
    state.updatedAt = new Date().toISOString();
    return state;
  }

  setActiveHomeSection(
    userId: string,
    sectionId: JourneyState['activeHomeSection']
  ): JourneyState {
    const state = this.getOrCreateState(userId);
    state.activeHomeSection = sectionId;
    state.updatedAt = new Date().toISOString();
    return state;
  }

  /**
   * Read-only accessor for the per-user journey state. Creates a default
   * state the first time it's called so callers (e.g. live-signal
   * computation) always get a defined object.
   */
  getState(userId: string): JourneyState {
    return this.getOrCreateState(userId);
  }

  saveUserGuideAnswer(
    userId: string,
    sectionId: UserGuideSectionId,
    answer: string
  ): JourneyState {
    if (!isUserGuideSectionId(sectionId)) {
      throw new Error(`Unknown user guide section: ${sectionId}`);
    }
    const trimmed = answer.trim();
    if (!trimmed) {
      throw new Error('User guide answer cannot be empty.');
    }

    const state = this.getOrCreateState(userId);
    const now = new Date().toISOString();
    if (!state.userGuideIntake.startedAt) {
      state.userGuideIntake.startedAt = now;
    }
    state.userGuideIntake.answers[sectionId] = trimmed;
    state.userGuideIntake.updatedAt = now;
    // Re-opening an answered section invalidates the completed marker
    // until finalizeUserGuide is called again with every section answered.
    state.userGuideIntake.completedAt = undefined;
    state.updatedAt = now;
    return state;
  }

  getUserGuideProgress(userId: string): {
    answered: UserGuideSectionId[];
    remaining: UserGuideSectionId[];
    completedAt?: string;
  } {
    const state = this.getOrCreateState(userId);
    const answers = state.userGuideIntake.answers;
    const answered: UserGuideSectionId[] = [];
    const remaining: UserGuideSectionId[] = [];
    for (const id of USER_GUIDE_SECTION_IDS) {
      if (answers[id] && answers[id].trim().length > 0) {
        answered.push(id);
      } else {
        remaining.push(id);
      }
    }
    return {
      answered,
      remaining,
      completedAt: state.userGuideIntake.completedAt,
    };
  }

  finalizeUserGuide(profile: TeamProfile): {
    markdown: string;
    missing: UserGuideSectionId[];
  } {
    const state = this.getOrCreateState(profile.userId);
    const {remaining} = this.getUserGuideProgress(profile.userId);
    const markdown = buildUserGuideMarkdown(
      profile.firstName,
      state.userGuideIntake.answers
    );
    if (remaining.length === 0) {
      const now = new Date().toISOString();
      state.userGuideIntake.completedAt = now;
      state.updatedAt = now;
    }
    return {markdown, missing: remaining};
  }

  async advance(
    profile: TeamProfile,
    stepId: JourneyState['currentStep']
  ): Promise<JourneyReply> {
    const onboardingPackage = this.onboardingPackageService.getPackageForUser(
      profile.userId
    );
    if (!onboardingPackage || onboardingPackage.status === 'draft') {
      return draftPendingReply();
    }

    const state = this.getOrCreateState(profile.userId);
    if (!state.completedSteps.includes(state.currentStep)) {
      state.completedSteps.push(state.currentStep);
    }
    state.currentStep = stepId;
    state.updatedAt = new Date().toISOString();

    if (stepId === 'day2-3-follow-up') {
      return {
        text: "Here's your day 2-3 guide for tools, access, and people to meet.",
        blocks: buildFollowUpBlocks(onboardingPackage, state),
      };
    }

    if (stepId === 'day4-5-orientation') {
      return {
        text: "Here's your day 4-5 guide for docs, channels, and codebase context.",
        blocks: buildOrientationBlocks(onboardingPackage, state),
      };
    }

    if (stepId === 'contribution-milestone') {
      if (hasFreshTasks(state)) {
        return {
          text: "You're ready for a first contribution.",
          blocks: buildContributionBlocks(
            onboardingPackage,
            state.taskExplanation ?? "Here's the latest list.",
            state.tasks,
            state
          ),
        };
      }

      const tasks = await this.taskScanner.scan(profile);
      const explanation = await this.llmService.explainTasks(profile, tasks);
      state.tasks = tasks;
      state.taskExplanation = explanation;
      state.tasksUpdatedAt = new Date().toISOString();
      onboardingPackage.sections.initialEngineeringTasks.tasks =
        tasks.map(cloneTask);
      onboardingPackage.updatedAt = new Date().toISOString();
      return {
        text: "You're ready for a first contribution.",
        blocks: buildContributionBlocks(
          onboardingPackage,
          explanation,
          tasks,
          state
        ),
      };
    }

    return {
      text: 'Back to your onboarding plan.',

      blocks: buildWelcomeBlocks(onboardingPackage, state),
    };
  }

  showPeople(profile: TeamProfile): JourneyReply {
    const onboardingPackage = this.onboardingPackageService.getPackageForUser(
      profile.userId
    );
    if (!onboardingPackage || onboardingPackage.status === 'draft') {
      return draftPendingReply();
    }

    return {
      text: 'Here are the people who can help most in your first few weeks.',
      blocks: buildPeopleBlocks(onboardingPackage),
    };
  }

  selectTask(profile: TeamProfile, taskId: string): JourneyReply {
    const state = this.getOrCreateState(profile.userId);
    const onboardingPackage = this.onboardingPackageService.getPackageForUser(
      profile.userId
    );
    if (!onboardingPackage || onboardingPackage.status === 'draft') {
      return draftPendingReply();
    }
    const task = state.tasks.find((entry) => entry.id === taskId);
    if (!task) {
      return {
        text: "That task isn't available anymore. Here's the latest list.",
        blocks: buildContributionBlocks(
          onboardingPackage,
          "Here's the latest list.",
          state.tasks,
          state
        ),
      };
    }

    state.selectedTaskId = taskId;
    state.updatedAt = new Date().toISOString();

    return {
      text: `Here's a closer look at ${task.title}.`,
      blocks: buildTaskPreviewBlocks(task, state),
    };
  }

  async confirmTask(profile: TeamProfile): Promise<JourneyReply> {
    const state = this.getOrCreateState(profile.userId);
    const onboardingPackage = this.onboardingPackageService.getPackageForUser(
      profile.userId
    );
    if (!onboardingPackage || onboardingPackage.status === 'draft') {
      return draftPendingReply();
    }
    const task = state.tasks.find((entry) => entry.id === state.selectedTaskId);
    if (!task) {
      return {
        text: "Pick a task first and I'll help you get started.",
        blocks: buildContributionBlocks(
          onboardingPackage,
          "Choose a task below and I'll help you get moving.",
          state.tasks,
          state
        ),
      };
    }

    const guide = await this.contributionGuideService.build(profile, task);

    if (!state.completedSteps.includes(state.currentStep)) {
      state.completedSteps.push(state.currentStep);
    }
    state.currentStep = 'celebration';
    state.updatedAt = new Date().toISOString();

    return {
      text: "Here's a clear path to get this done.",
      blocks: buildCelebrationBlocks(buildGuideSummary(task, guide), state),
    };
  }

  async answerUser(
    profile: TeamProfile,
    text: string,
    options: {
      history?: ConversationHistoryTurn[];
      onboardingStage?: OnboardingStage;
      joinedSlackChannels?: Set<string>;
    } = {}
  ): Promise<AnswerUserResult> {
    this.getOrCreateState(profile.userId);
    const {answered, remaining, completedAt} = this.getUserGuideProgress(
      profile.userId
    );
    // Only surface the intake stanza to the LLM if the user is mid-intake
    // (at least one answer saved) or has just asked about the User Guide.
    // A fresh user with zero answers triggers the stanza the first time
    // they say "draft my user guide" — the assistant handler falls back
    // to an empty progress signal which still nudges the agent when the
    // message text mentions the intake.
    const userGuideProgress =
      answered.length > 0
        ? {answered, remaining, completedAt}
        : mentionsUserGuideIntake(text)
          ? {answered, remaining, completedAt}
          : undefined;
    return this.llmService.answerUser({
      question: text,
      profile,
      history: options.history,
      onboardingStage: options.onboardingStage,
      joinedSlackChannels: options.joinedSlackChannels,
      userGuideProgress,
    });
  }

  async showJiraTickets(
    profile: TeamProfile,
    options: {issueKey?: string; query?: string} = {}
  ): Promise<JourneyReply> {
    if (!this.jira || !this.jira.isConfigured()) {
      return {
        text: `Jira lookups are not configured yet for ${APP_NAME}.`,
        blocks: [
          section(
            "Jira search isn't configured yet. Ask your admin to set `JIRA_BASE_URL`, `JIRA_API_EMAIL`, and `JIRA_API_TOKEN` to enable ticket lookups."
          ),
        ],
      };
    }

    if (options.issueKey) {
      const issue = await this.jira.findByKey(options.issueKey);
      return issue
        ? {
            text: `${issue.key}: ${issue.summary}`,
            blocks: [header('Jira ticket'), ...buildJiraIssueBlocks([issue])],
          }
        : {
            text: `I couldn't find ${options.issueKey}.`,
            blocks: [
              section(
                `I couldn't find \`${options.issueKey}\`. Check the key or try again in a minute.`
              ),
            ],
          };
    }

    if (options.query && options.query.trim()) {
      const issues = await this.jira.findForTextQuery(options.query);
      return {
        text: `Jira results for "${options.query}"`,
        blocks: [
          header(`Jira matches for "${options.query}"`),
          ...buildJiraIssueBlocks(issues),
        ],
      };
    }

    if (!profile.email) {
      return {
        text: 'I need your Webflow email to look up your tickets.',
        blocks: [
          section(
            "I couldn't find your Webflow email, so I can't look up the tickets assigned to you."
          ),
        ],
      };
    }

    const issues = await this.jira.findAssignedToEmail(profile.email);
    return {
      text:
        issues.length > 0
          ? `You have ${issues.length} open Jira ticket${issues.length === 1 ? '' : 's'}.`
          : "You don't have any open Jira tickets assigned right now.",
      blocks: [
        header('Your open Jira tickets'),
        ...buildJiraIssueBlocks(issues),
      ],
    };
  }

  async showGitHubPullRequests(
    profile: TeamProfile,
    options: {mode?: 'mine' | 'review' | 'team'} = {}
  ): Promise<JourneyReply> {
    if (!this.github || !this.github.isConfigured()) {
      return {
        text: `GitHub lookups are not configured yet for ${APP_NAME}.`,
        blocks: [
          section(
            "GitHub search isn't configured yet. Ask your admin to set `GITHUB_TOKEN` to enable pull-request lookups."
          ),
        ],
      };
    }

    const mode = options.mode ?? 'mine';
    const username = inferGithubUsername(profile.email);

    if (mode === 'team' && profile.githubTeamSlug) {
      const prs = await this.github.findRecentPullRequestsForTeam(
        profile.githubTeamSlug
      );
      return buildPullRequestReply(
        prs,
        `PRs awaiting ${profile.teamName} review`,
        `Team ${profile.githubTeamSlug}`
      );
    }

    if (mode === 'review') {
      if (!username) {
        return {
          text: "I don't know your GitHub username yet.",
          blocks: [
            section(
              "I couldn't detect your GitHub username. Tell me your handle and I'll look up review requests for you."
            ),
          ],
        };
      }
      const prs = await this.github.findPullRequestsAwaitingReview(username);
      return buildPullRequestReply(
        prs,
        'PRs awaiting your review',
        `@${username}`
      );
    }

    if (!username) {
      return {
        text: "I don't know your GitHub username yet.",
        blocks: [
          section(
            "I couldn't detect your GitHub username. Tell me your handle and I'll look up your PRs."
          ),
        ],
      };
    }
    const prs = await this.github.findOpenPullRequestsForUser(username);
    return buildPullRequestReply(
      prs,
      'Your open pull requests',
      `@${username}`
    );
  }

  /**
   * Records a buddy check-in with a hire at the current time. Idempotent:
   * calling it repeatedly just advances `lastCheckinAt`.
   */
  saveBuddyCheckin(buddyUserId: string, hireUserId: string): JourneyState {
    const state = this.getOrCreateState(buddyUserId);
    const now = new Date().toISOString();
    state.buddyCheckIns[hireUserId] = {lastCheckinAt: now};
    state.updatedAt = now;
    return state;
  }

  /**
   * Returns true when the buddy has never checked in with this hire, or
   * when their last check-in is at least 7 days old. Used by the buddy DM
   * handler to decide whether to nudge on the current message turn.
   */
  getBuddyCheckinDue(
    buddyUserId: string,
    hireUserId: string,
    now: Date = new Date()
  ): boolean {
    const state = this.getOrCreateState(buddyUserId);
    const entry = state.buddyCheckIns[hireUserId];
    if (!entry?.lastCheckinAt) {
      return true;
    }
    const lastMs = Date.parse(entry.lastCheckinAt);
    if (Number.isNaN(lastMs)) {
      return true;
    }
    return now.getTime() - lastMs >= BUDDY_CHECKIN_INTERVAL_MS;
  }

  /**
   * Resolves the bullet list of buddy expectations for a given onboarding
   * week. Drives the buddy nudge DM. Reads from the static map in
   * buddyGuide.ts so adding a new week key without expectations trips the
   * drift test.
   */
  buildBuddyExpectationBullets(weekKey: OnboardingWeekKey): string[] {
    return BUDDY_EXPECTATIONS[weekKey];
  }

  private getOrCreateState(userId: string): JourneyState {
    const existing = this.states.get(userId);
    if (existing) {
      return existing;
    }

    const created: JourneyState = {
      userId,
      currentStep: 'day1-welcome',
      completedSteps: [],
      activeHomeSection: 'welcome',
      itemStatuses: {},
      toolAccess: {},
      userGuideIntake: {answers: {}},
      tasks: [],
      buddyCheckIns: {},
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.states.set(userId, created);
    return created;
  }

  private prepareData(
    profile: TeamProfile,
    onboardingPackage: OnboardingPackage | undefined
  ): PreparedJourneyData {
    const state = this.getOrCreateState(profile.userId);
    state.updatedAt = new Date().toISOString();
    return {profile, state, onboardingPackage};
  }
}

function hasFreshTasks(state: JourneyState): boolean {
  if (state.tasks.length === 0 || !state.tasksUpdatedAt) {
    return false;
  }

  return Date.now() - Date.parse(state.tasksUpdatedAt) < TASK_CACHE_TTL_MS;
}

const USER_GUIDE_MENTION_PATTERN = /user\s*guide/i;

function mentionsUserGuideIntake(text: string): boolean {
  return USER_GUIDE_MENTION_PATTERN.test(text);
}

function buildGuideSummary(
  task: ContributionTask,
  guide: ContributionGuide
): string[] {
  return [
    `*Task:* ${task.title}`,
    `*Skill:* \`${task.skillCommand}\``,
    `*Suggested branch:* \`${guide.branchName}\``,
    '',
    ...guide.steps,
    '',
    '*Draft PR description:*',
    guide.prBodyDraft,
  ];
}

function draftPendingReply(): JourneyReply {
  return {
    text: 'Your onboarding plan is still in review.',
    blocks: buildDraftPendingBlocks(),
  };
}

function cloneTask(task: ContributionTask): ContributionTask {
  return {
    ...task,
    filePaths: [...task.filePaths],
    previewLines: [...task.previewLines],
    metadata: {...task.metadata},
  };
}

function buildJiraIssueBlocks(issues: JiraIssue[]): KnownBlock[] {
  if (issues.length === 0) {
    return [
      section(
        "Nothing came back from Jira. If that doesn't feel right, try again with a search phrase or an issue key like `ABC-123`."
      ),
    ];
  }

  return issues.flatMap((issue) => [
    section(
      `*<${issue.url}|${issue.key}>* — ${issue.summary}\nStatus: *${issue.status}*${
        issue.priority ? ` · Priority: ${issue.priority}` : ''
      }${issue.assignee ? ` · Assignee: ${issue.assignee}` : ''}`
    ),
  ]);
}

function buildPullRequestReply(
  prs: GitHubPullRequest[],
  title: string,
  subject: string
): JourneyReply {
  const blocks: KnownBlock[] = [header(title)];

  if (prs.length === 0) {
    blocks.push(
      section(`No open pull requests found for ${subject} right now.`)
    );
  } else {
    prs.forEach((pr, index) => {
      if (index > 0) {
        blocks.push(divider());
      }
      blocks.push(
        section(
          `*<${pr.url}|#${pr.number} ${pr.title}>*\n${pr.repository} · @${pr.author}${pr.draft ? ' · *draft*' : ''}`
        )
      );
    });
  }

  blocks.push(
    actions([
      {
        label: 'Refresh',
        actionId: 'spark_refresh_pr_list',
      },
    ])
  );

  return {
    text: `${title} for ${subject}`,
    blocks,
  };
}
