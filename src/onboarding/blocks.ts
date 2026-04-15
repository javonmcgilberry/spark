import type {KnownBlock} from '@slack/types';
import {JOURNEY_LABELS} from './catalog.js';
import {
  buildPeopleSections,
  formatChannels,
  formatConfluenceLinks,
  formatDocs,
  formatKeyPaths,
  formatRituals,
  formatTools,
} from './display.js';
import type {
  ContributionTask,
  JourneyState,
  SuggestedNextStep,
  TeamProfile,
} from './types.js';

export function buildWelcomeBlocks(
  profile: TeamProfile,
  state: JourneyState
): KnownBlock[] {
  return [
    header(`Welcome to Webflow, ${profile.firstName}`),
    section(
      `I'm Spark, your onboarding companion. You're joining *${profile.teamName}*${
        profile.pillarName ? ` in *${profile.pillarName}*.` : '.'
      }\n\n*Manager:* ${profile.manager.name}\n*Buddy:* ${profile.buddy.name}`
    ),
    section(formatKeyPaths(profile.keyPaths)),
    section(formatDocs(profile.docs)),
    ...(state.confluenceLinks.length > 0
      ? [section(formatConfluenceLinks(state.confluenceLinks))]
      : []),
    ...(state.canvasUrl
      ? [
          section(
            `*Shared onboarding canvas*\nOpen <${state.canvasUrl}|your onboarding canvas> if you want the long-form version of your checklist and docs in one place.`
          ),
        ]
      : []),
    actions([
      {
        label: 'Day 2-3 guide',
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
  profile: TeamProfile,
  state: JourneyState
): KnownBlock[] {
  return [
    header('Day 2-3: Tools, access, and people'),
    section(
      `Get unblocked on tooling, make the right introductions, and learn which rituals matter for *${profile.teamName}*.`
    ),
    section(formatTools(profile.tools)),
    section(formatRituals(profile.rituals)),
    actions([
      {
        label: 'Day 4-5 guide',
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
  profile: TeamProfile,
  state: JourneyState
): KnownBlock[] {
  return [
    header('Day 4-5: Docs, channels, and context'),
    section(
      'Read the docs that matter for your role, join the right channels, and build context before your first contribution.'
    ),
    section(formatChannels(profile.recommendedChannels, 'Channels to join')),
    section(formatChecklist(profile)),
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

export function buildPeopleBlocks(profile: TeamProfile): KnownBlock[] {
  const people = [profile.manager, profile.buddy, ...profile.teammates];

  return [
    header('People to meet'),
    section(
      'These are the people most worth spending time with early. Use the conversation prompt on each card so the first meeting feels useful instead of awkward.'
    ),
    ...buildPeopleSections(people),
  ];
}

export function buildContributionBlocks(
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
    header('Your first contribution'),
    section(explanation),
    section(taskText),
    {
      type: 'actions',
      elements: [
        {
          type: 'static_select',
          action_id: 'spark_select_task',
          placeholder: {
            type: 'plain_text',
            text: 'Choose a contribution task',
            emoji: false,
          },
          options,
        },
      ],
    },
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
      `*How to do it*\nIn Claude Code or Cursor, run:\n\`\`\`\n${task.skillCommand}\n\`\`\`\n\nThis uses the *${task.skillName}* AgentFlow skill — it handles the mechanical parts and walks you through any decisions.`
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
  const blocks: KnownBlock[] = [header('Nice work!')];

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

function formatChecklist(profile: TeamProfile): string {
  return `*Checklist*\n${profile.checklist
    .map((section) => `• *${section.title}* — ${section.goal}`)
    .join('\n')}`;
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

function header(text: string): KnownBlock {
  return {
    type: 'header',
    text: {
      type: 'plain_text',
      text,
      emoji: false,
    },
  };
}

function section(text: string): KnownBlock {
  return {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text,
    },
  };
}

function actions(nextSteps: SuggestedNextStep[]): KnownBlock {
  return {
    type: 'actions',
    elements: nextSteps.map((step) => ({
      type: 'button',
      text: {
        type: 'plain_text',
        text: step.label,
        emoji: false,
      },
      action_id: step.actionId,
      value: step.value ?? step.label,
      style: step.style,
    })),
  };
}
