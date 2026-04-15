import type {KnownBlock} from '@slack/types';
import {
  buildPeopleSections,
  countCompletedInSection,
  formatChannels,
  formatConfluenceLinks,
  formatDocs,
  formatKeyPaths,
  formatRituals,
  formatTools,
} from './display.js';
import type {JourneyState, TeamProfile} from './types.js';

export const HOME_CHECKLIST_ACTION_ID = 'spark_checklist_toggle';
const HOME_CHECKLIST_BLOCK_PREFIX = 'spark_checklist_section:';

export function buildHomeView(profile: TeamProfile, state: JourneyState) {
  const completedCount = state.completedChecklist.length;
  const totalCount = profile.checklist.reduce(
    (sum, section) => sum + section.items.length,
    0
  );

  const blocks: KnownBlock[] = [
    header('Spark onboarding dashboard'),
    section(
      `You’re onboarding into *${profile.teamName}*${
        profile.pillarName ? ` in *${profile.pillarName}*.` : '.'
      }\n\n*Manager:* ${profile.manager.name}\n*Buddy:* ${profile.buddy.name}\n*Checklist progress:* ${completedCount}/${totalCount}`
    ),
    ...(state.canvasUrl
      ? [
          section(
            `*Shared onboarding canvas*\nOpen <${state.canvasUrl}|your onboarding canvas> for the long-form version of this plan.`
          ),
        ]
      : []),
    divider(),
    header('Checklist'),
  ];

  for (const checklistSection of profile.checklist) {
    const options = checklistSection.items.map((item) => ({
      text: {
        type: 'plain_text' as const,
        text: truncatePlainText(item.label),
        emoji: false,
      },
      value: item.label,
    }));

    blocks.push(
      {
        type: 'section',
        block_id: blockIdForChecklistSection(checklistSection.id),
        text: {
          type: 'mrkdwn',
          text: `*${checklistSection.title}*\n${checklistSection.goal}\n_${countCompletedInSection(
            checklistSection.items.map((item) => item.label),
            state.completedChecklist
          )}/${checklistSection.items.length} complete_`,
        },
        accessory: {
          type: 'checkboxes',
          action_id: HOME_CHECKLIST_ACTION_ID,
          options,
          initial_options: options.filter((option) =>
            state.completedChecklist.includes(option.value)
          ),
        },
      },
      section(
        checklistSection.items
          .map((item) => `• *${item.label}* — ${item.notes}`)
          .join('\n')
      )
    );
  }

  blocks.push(
    divider(),
    header('People to meet'),
    ...buildPeopleSections([
      profile.manager,
      profile.buddy,
      ...profile.teammates,
    ]),
    divider(),
    header('Channels, tools, and rituals'),
    section(formatChannels(profile.recommendedChannels)),
    section(formatTools(profile.tools)),
    section(formatRituals(profile.rituals)),
    divider(),
    header('Docs'),
    section(formatDocs(profile.docs)),
    ...(profile.confluenceLinks.length > 0
      ? [section(formatConfluenceLinks(profile.confluenceLinks))]
      : []),
    section(
      formatKeyPaths(
        profile.keyPaths,
        "Spark couldn't infer team-owned paths yet."
      )
    )
  );

  return {
    type: 'home' as const,
    blocks,
  };
}

export function parseChecklistSectionId(blockId: string): string | null {
  return blockId.startsWith(HOME_CHECKLIST_BLOCK_PREFIX)
    ? blockId.slice(HOME_CHECKLIST_BLOCK_PREFIX.length)
    : null;
}

function blockIdForChecklistSection(sectionId: string): string {
  return `${HOME_CHECKLIST_BLOCK_PREFIX}${sectionId}`;
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

function divider(): KnownBlock {
  return {type: 'divider'};
}

function truncatePlainText(value: string): string {
  return value.length <= 75 ? value : `${value.slice(0, 72)}...`;
}
