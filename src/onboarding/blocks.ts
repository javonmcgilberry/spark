import type {KnownBlock} from '@slack/types';
import {APP_NAME} from '../config/constants.js';
import {JOURNEY_LABELS} from './catalog.js';
import {
  buildPeopleSections,
  formatChecklistResourceLink,
  formatChannels,
  linkedChecklistItemsForMilestone,
  formatResourceLibrary,
  formatRituals,
  formatTools,
} from './display.js';
import {actions, header, section} from '../slack/blockKit.js';
import type {
  ContributionTask,
  JourneyState,
  OnboardingPackage,
} from './types.js';

export function buildWelcomeBlocks(
  onboardingPackage: OnboardingPackage,
  state: JourneyState
): KnownBlock[] {
  const welcome = onboardingPackage.sections.welcome;
  const checklistSections =
    onboardingPackage.sections.onboardingChecklist.sections;
  const pocs = welcome.onboardingPocs
    .map((poc) => `• *${poc.label}* — ${poc.owner.name}\n  ${poc.summary}`)
    .join('\n');
  const milestones = welcome.journeyMilestones
    .map((milestone) => {
      const links = linkedChecklistItemsForMilestone(
        checklistSections,
        milestone.label
      );
      return `• *${milestone.label}* — ${milestone.goal}${
        links.length > 0
          ? `\n  Key links: ${links.map(formatChecklistResourceLink).join(' · ')}`
          : ''
      }`;
    })
    .join('\n');

  return [
    header(`Welcome to Webflow`),
    section(welcome.intro),
    ...(welcome.personalizedNote
      ? [section(`*Manager note*\n${welcome.personalizedNote}`)]
      : []),
    section(`*Key people*\n${pocs}`),
    section(`*Your onboarding path*\n${milestones}`),
    ...(onboardingPackage.draftCanvasUrl
      ? [
          section(
            `*Shared onboarding workspace*\nOpen <${onboardingPackage.draftCanvasUrl}|the onboarding canvas> if you want one shared place for notes, links, and progress.`
          ),
        ]
      : []),
    actions([
      {
        label: 'Tools and Slack',
        actionId: 'spark_go_to_step',
        value: 'day2-3-follow-up',
        style: 'primary',
      },
      {
        label: 'People to meet',
        actionId: 'spark_show_people',
      },
    ]),
    progressContext(state),
  ];
}

export function buildFollowUpBlocks(
  onboardingPackage: OnboardingPackage,
  state: JourneyState
): KnownBlock[] {
  const tools = onboardingPackage.sections.toolsAccess;
  const slack = onboardingPackage.sections.slack;
  return [
    header('Tools, access, and Slack'),
    section(tools.intro),
    section(formatTools(tools.tools)),
    section(formatChannels(slack.channels, 'Core Slack channels')),
    actions([
      {
        label: 'Plan and resources',
        actionId: 'spark_go_to_step',
        value: 'day4-5-orientation',
        style: 'primary',
      },
      {
        label: 'People to meet',
        actionId: 'spark_show_people',
      },
    ]),
    progressContext(state),
  ];
}

export function buildOrientationBlocks(
  onboardingPackage: OnboardingPackage,
  state: JourneyState
): KnownBlock[] {
  const planPreview = onboardingPackage.sections.plan306090.items
    .slice(0, 4)
    .map((item) => {
      const links = linkedChecklistItemsForMilestone(
        onboardingPackage.sections.onboardingChecklist.sections,
        item.timeframe
      );
      return `• *${item.timeframe}* — ${item.goalSummary}\n  New hire: ${item.keyActivities}${
        links.length > 0
          ? `\n  Key links: ${links.map(formatChecklistResourceLink).join(' · ')}`
          : ''
      }`;
    })
    .join('\n');

  return [
    header('Plan, rituals, and resources'),
    section(onboardingPackage.sections.plan306090.intro),
    section(`*30-60-90 preview*\n${planPreview}`),
    section(formatRituals(onboardingPackage.sections.rituals.rituals)),
    section(
      formatResourceLibrary(
        onboardingPackage.sections.engineeringResourceLibrary
      )
    ),
    actions([
      {
        label: 'Find tasks',
        actionId: 'spark_go_to_step',
        value: 'contribution-milestone',
        style: 'primary',
      },
    ]),
    progressContext(state),
  ];
}

export function buildPeopleBlocks(
  onboardingPackage: OnboardingPackage
): KnownBlock[] {
  const people = onboardingPackage.sections.peopleToMeet.people;

  return [
    header('People to meet'),
    section(onboardingPackage.sections.peopleToMeet.intro),
    ...buildPeopleSections(people),
  ];
}

export function buildContributionBlocks(
  onboardingPackage: OnboardingPackage,
  explanation: string,
  tasks: ContributionTask[],
  state: JourneyState
): KnownBlock[] {
  const taskText = tasks
    .map(
      (task, index) =>
        `*${index + 1}. ${task.title}*\n${task.description}\n_${task.difficulty} · skill: ${task.skillName}_`
    )
    .join('\n\n');

  const options = tasks.map((task) => ({
    text: {
      type: 'plain_text' as const,
      text: task.title,
      emoji: false,
    },
    value: task.id,
  }));

  return [
    header(onboardingPackage.sections.initialEngineeringTasks.title),
    section(onboardingPackage.sections.initialEngineeringTasks.intro),
    section(
      `*Manager note*\n${onboardingPackage.sections.initialEngineeringTasks.managerPrompt}`
    ),
    section(explanation),
    ...(taskText
      ? [section(taskText)]
      : [
          section(
            'A starter task is not ready yet. Ask your manager to add one, or try the task scan again once a little more onboarding context is in place.'
          ),
        ]),
    ...(options.length > 0
      ? [
          {
            type: 'actions' as const,
            elements: [
              {
                type: 'static_select' as const,
                action_id: 'spark_select_task',
                placeholder: {
                  type: 'plain_text' as const,
                  text: 'Choose a starter task',
                  emoji: false,
                },
                options,
              },
            ],
          },
        ]
      : []),
    progressContext(state),
  ];
}

export function buildTaskPreviewBlocks(
  task: ContributionTask,
  state: JourneyState
): KnownBlock[] {
  const preview = task.previewLines.map((line) => `• ${line}`).join('\n');
  return [
    header(task.title),
    section(
      `${task.description}\n\n*Why this works for onboarding*\n${task.rationale}`
    ),
    section(
      `*Files involved*\n${task.filePaths.map((file) => `• \`${file}\``).join('\n')}`
    ),
    section(`*Preview*\n${preview}`),
    section(
      `*How to get started*\nIn Claude Code or Cursor, run:\n\`\`\`\n${task.skillCommand}\n\`\`\`\n\nThis uses the *${task.skillName}* AgentFlow skill. It handles the mechanical steps and walks you through any decisions along the way.`
    ),
    actions([
      {
        label: 'Get my steps',
        actionId: 'spark_confirm_pr',
        value: task.id,
        style: 'primary',
      },
      {
        label: 'Back to tasks',
        actionId: 'spark_go_to_step',
        value: 'contribution-milestone',
      },
    ]),
    progressContext(state),
  ];
}

export function buildCelebrationBlocks(
  guideSummary: string[],
  state: JourneyState
): KnownBlock[] {
  const blocks: KnownBlock[] = [header('Nice work')];

  // Split on blank lines so each step renders as its own Slack section block.
  const chunks: string[] = [];
  let current: string[] = [];
  for (const line of guideSummary) {
    if (line === '') {
      if (current.length > 0) {
        chunks.push(current.join('\n'));
        current = [];
      }
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) {
    chunks.push(current.join('\n'));
  }

  for (const chunk of chunks) {
    blocks.push(section(chunk));
  }

  blocks.push(progressContext(state));
  return blocks;
}

export function buildDraftPendingBlocks(): KnownBlock[] {
  return [
    header('Your onboarding plan is on the way'),
    section(
      `Your manager or onboarding team is still getting your onboarding plan ready. As soon as they publish it, ${APP_NAME} will open the full Home experience and send you the latest version in DM.`
    ),
  ];
}

function progressContext(state: JourneyState): KnownBlock {
  const completed = [...state.completedSteps, state.currentStep]
    .map((step) => JOURNEY_LABELS[step] ?? step)
    .join(' → ');

  return {
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `Progress: ${completed}`,
      },
    ],
  };
}
