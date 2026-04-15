import type {App} from '@slack/bolt';
import type {KnownBlock} from '@slack/types';
import {
  buildCelebrationBlocks,
  buildContributionBlocks,
  buildFollowUpBlocks,
  buildOrientationBlocks,
  buildPeopleBlocks,
  buildTaskPreviewBlocks,
  buildWelcomeBlocks,
} from '../onboarding/blocks.js';
import type {
  ContributionTask,
  JourneyState,
  TeamProfile,
} from '../onboarding/types.js';
import {
  type ContributionGuide,
  ContributionGuideService,
} from './contributionGuideService.js';
import {CanvasService} from './canvasService.js';
import {ConfluenceSearchService} from './confluenceSearchService.js';
import {LlmService} from './llmService.js';
import {TaskScannerService} from './taskScannerService.js';

export interface JourneyReply {
  text: string;
  blocks: KnownBlock[];
}

export interface JourneyContext {
  slackClient?: App['client'];
}

export interface PreparedJourneyData {
  profile: TeamProfile;
  state: JourneyState;
}

const TASK_CACHE_TTL_MS = 10 * 60 * 1000;

export class JourneyService {
  private readonly states = new Map<string, JourneyState>();

  constructor(
    private readonly taskScanner: TaskScannerService,
    private readonly llmService: LlmService,
    private readonly contributionGuideService: ContributionGuideService,
    private readonly confluenceSearchService: ConfluenceSearchService,
    private readonly canvasService: CanvasService
  ) {}

  async start(
    profile: TeamProfile,
    context: JourneyContext = {}
  ): Promise<JourneyReply> {
    return this.buildStartReply(await this.prepareStart(profile, context));
  }

  async prepareStart(
    profile: TeamProfile,
    context: JourneyContext = {}
  ): Promise<PreparedJourneyData> {
    const prepared = await this.prepareDashboard(profile, context);
    prepared.state.currentStep = 'day1-welcome';
    prepared.state.updatedAt = new Date().toISOString();
    return prepared;
  }

  buildStartReply(prepared: PreparedJourneyData): JourneyReply {
    return {
      text: `Welcome to Webflow, ${prepared.profile.firstName}! Here's your Day 1 guide.`,
      blocks: buildWelcomeBlocks(prepared.profile, prepared.state),
    };
  }

  async prepareDashboard(
    profile: TeamProfile,
    context: JourneyContext = {}
  ): Promise<PreparedJourneyData> {
    const state = this.getOrCreateState(profile.userId);

    if (state.confluenceLinks.length === 0) {
      state.confluenceLinks =
        await this.confluenceSearchService.findOnboardingPages(profile);
    }

    const enrichedProfile = this.mergeProfile(profile, state);
    if (context.slackClient && !state.canvasId && !state.canvasUnavailable) {
      const canvas = await this.canvasService.createOnboardingCanvas(
        context.slackClient,
        enrichedProfile,
        state
      );
      if (canvas) {
        state.canvasId = canvas.canvasId;
        state.canvasUrl = canvas.canvasUrl;
      } else {
        state.canvasUnavailable = true;
      }
    }

    state.updatedAt = new Date().toISOString();
    return {
      profile: enrichedProfile,
      state,
    };
  }

  setCompletedChecklistForSection(
    profile: TeamProfile,
    sectionId: string,
    selectedValues: string[]
  ): JourneyState {
    const state = this.getOrCreateState(profile.userId);
    const targetSection = profile.checklist.find(
      (section) => section.id === sectionId
    );
    if (!targetSection) {
      return state;
    }

    const nextCompleted = new Set(state.completedChecklist);
    for (const item of targetSection.items) {
      nextCompleted.delete(item.label);
    }
    for (const value of selectedValues) {
      nextCompleted.add(value);
    }

    state.completedChecklist = Array.from(nextCompleted);
    state.updatedAt = new Date().toISOString();
    return state;
  }

  async advance(
    profile: TeamProfile,
    stepId: JourneyState['currentStep']
  ): Promise<JourneyReply> {
    const state = this.getOrCreateState(profile.userId);
    const enrichedProfile = this.mergeProfile(profile, state);
    if (!state.completedSteps.includes(state.currentStep)) {
      state.completedSteps.push(state.currentStep);
    }
    state.currentStep = stepId;
    state.updatedAt = new Date().toISOString();

    if (stepId === 'day2-3-follow-up') {
      return {
        text: "Here's your Day 2-3 guide — tools, access, and people to meet.",
        blocks: buildFollowUpBlocks(enrichedProfile, state),
      };
    }

    if (stepId === 'day4-5-orientation') {
      return {
        text: "Here's your orientation plan — docs, channels, and codebase context.",
        blocks: buildOrientationBlocks(enrichedProfile, state),
      };
    }

    if (stepId === 'contribution-milestone') {
      if (hasFreshTasks(state)) {
        return {
          text: "You're ready to make your first contribution.",
          blocks: buildContributionBlocks(
            state.taskExplanation ?? "Here's the current list.",
            state.tasks,
            state
          ),
        };
      }

      const tasks = await this.taskScanner.scan(enrichedProfile);
      const explanation = await this.llmService.explainTasks(
        enrichedProfile,
        tasks
      );
      state.tasks = tasks;
      state.taskExplanation = explanation;
      state.tasksUpdatedAt = new Date().toISOString();
      return {
        text: "You're ready to make your first contribution.",
        blocks: buildContributionBlocks(explanation, tasks, state),
      };
    }

    return {
      text: 'Back to your onboarding guide.',

      blocks: buildWelcomeBlocks(enrichedProfile, state),
    };
  }

  showPeople(profile: TeamProfile): JourneyReply {
    return {
      text: 'Here are the people worth connecting with during your first few weeks.',
      blocks: buildPeopleBlocks(profile),
    };
  }

  selectTask(profile: TeamProfile, taskId: string): JourneyReply {
    const state = this.getOrCreateState(profile.userId);
    const task = state.tasks.find((entry) => entry.id === taskId);
    if (!task) {
      return {
        text: "That task isn't available anymore. Here's the updated list.",
        blocks: buildContributionBlocks(
          "Here's the current list.",
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
    const task = state.tasks.find((entry) => entry.id === state.selectedTaskId);
    if (!task) {
      return {
        text: "Pick a task first and I'll get it ready for you.",
        blocks: buildContributionBlocks(
          "Choose a task below and I'll prepare it.",
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
      text: 'Here are your steps to get this done.',
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
      completedChecklist: [],
      tasks: [],
      confluenceLinks: [],
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.states.set(userId, created);
    return created;
  }

  private mergeProfile(profile: TeamProfile, state: JourneyState): TeamProfile {
    return {
      ...profile,
      confluenceLinks:
        state.confluenceLinks.length > 0
          ? state.confluenceLinks
          : profile.confluenceLinks,
    };
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
    '*PR description draft:*',
    guide.prBodyDraft,
  ];
}
