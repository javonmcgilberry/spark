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
import type {
  ChecklistItemStatus,
  ContributionTask,
  JourneyState,
  OnboardingPackage,
  TeamProfile,
} from '../onboarding/types.js';
import {
  type ContributionGuide,
  ContributionGuideService,
} from './contributionGuideService.js';
import {LlmService} from './llmService.js';
import {OnboardingPackageService} from './onboardingPackageService.js';
import {TaskScannerService} from './taskScannerService.js';

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

export class JourneyService {
  private readonly states = new Map<string, JourneyState>();

  constructor(
    private readonly taskScanner: TaskScannerService,
    private readonly llmService: LlmService,
    private readonly contributionGuideService: ContributionGuideService,
    private readonly onboardingPackageService: OnboardingPackageService
  ) {}

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
        text: 'Your manager or onboarding team is still getting your onboarding plan ready. Spark will open it as soon as it is published.',
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

  setActiveHomeSection(
    userId: string,
    sectionId: JourneyState['activeHomeSection']
  ): JourneyState {
    const state = this.getOrCreateState(userId);
    state.activeHomeSection = sectionId;
    state.updatedAt = new Date().toISOString();
    return state;
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

  async answerQuestion(profile: TeamProfile, text: string): Promise<string> {
    const state = this.getOrCreateState(profile.userId);
    return this.llmService.answerBlocker({
      question: text,
      currentStep: state.currentStep,
      profile,
    });
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
      tasks: [],
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
