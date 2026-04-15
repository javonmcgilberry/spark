import type {KnownBlock} from '@slack/types';
import {HOME_SECTION_TABS} from './catalog.js';
import {
  buildPeopleSections,
  countCompletedInSection,
  formatChecklistItem,
  formatChecklistResourceLink,
  formatChannels,
  linkedChecklistItemsForMilestone,
  formatResourceLibrary,
  formatRituals,
  formatTools,
} from './display.js';
import {actions, divider, header, section} from '../slack/blockKit.js';
import {SPARK_OPEN_DRAFT_EDIT_MODAL_ACTION_ID} from '../slack/workflowUi.js';
import type {HomeSectionId, JourneyState, OnboardingPackage} from './types.js';

export const HOME_CHECKLIST_ACTION_ID = 'spark_checklist_toggle';
export const HOME_NAV_ACTION_ID = 'spark_home_open_section';
const HOME_CHECKLIST_BLOCK_PREFIX = 'spark_checklist_section:';

export function buildHomeView(
  onboardingPackage: OnboardingPackage,
  state: JourneyState
) {
  const checklist = onboardingPackage.sections.onboardingChecklist.sections;
  const completedCount = state.completedChecklist.length;
  const totalCount = checklist.reduce(
    (sum, checklistSection) => sum + checklistSection.items.length,
    0
  );
  const activeSection = state.activeHomeSection;
  const blocks: KnownBlock[] = [
    header('Spark onboarding'),
    section(
      `*Status:* ${onboardingPackage.status}\n*Checklist progress:* ${completedCount}/${totalCount}${
        onboardingPackage.welcomeNote ? '\n*Welcome note included:* yes' : ''
      }`
    ),
    ...buildTabNavigation(activeSection),
    divider(),
    ...renderActiveSection(onboardingPackage, state),
  ];

  return {
    type: 'home' as const,
    blocks,
  };
}

export function buildHomePendingView(drafts: OnboardingPackage[] = []): {
  type: 'home';
  blocks: KnownBlock[];
} {
  const blocks: KnownBlock[] = [
    header('Spark onboarding'),
    section(
      drafts.length > 0
        ? 'These onboarding drafts still need review before Spark publishes the new-hire experience.'
        : 'Your onboarding package has not been published yet. Spark stays hidden until your manager or onboarding team finishes the draft and publishes it for you.'
    ),
    ...(drafts.length > 0
      ? drafts.flatMap((draft) => [
          section(
            `*${draft.sections.welcome.title} for <@${draft.userId}>*\nStatus: *${draft.status}*${
              draft.draftCanvasUrl
                ? `\nDraft canvas: <${draft.draftCanvasUrl}|Open canvas>`
                : ''
            }${draft.draftChannelName ? `\nDraft channel: #${draft.draftChannelName}` : ''}`
          ),
          actions([
            {
              label: 'Edit draft details',
              actionId: SPARK_OPEN_DRAFT_EDIT_MODAL_ACTION_ID,
              value: draft.userId,
            },
          ]),
        ])
      : [
          section(
            'If you are waiting on onboarding details, check with your manager or onboarding buddy.'
          ),
        ]),
  ];

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

function buildTabNavigation(activeSection: HomeSectionId): KnownBlock[] {
  return chunk(HOME_SECTION_TABS, 5).map((tabs) =>
    actions(
      tabs.map((tab) => ({
        label: tab.label,
        actionId: HOME_NAV_ACTION_ID,
        value: tab.id,
        style: activeSection === tab.id ? 'primary' : undefined,
      }))
    )
  );
}

function renderActiveSection(
  onboardingPackage: OnboardingPackage,
  state: JourneyState
): KnownBlock[] {
  switch (state.activeHomeSection) {
    case 'welcome':
      return renderWelcomeSection(onboardingPackage);
    case 'onboarding-checklist':
      return renderChecklistSection(onboardingPackage, state);
    case '30-60-90-plan':
      return renderPlanSection(onboardingPackage);
    case 'people-to-meet':
      return renderPeopleSection(onboardingPackage);
    case 'tools-access-checklist':
      return renderToolsSection(onboardingPackage);
    case 'slack':
      return renderSlackSection(onboardingPackage);
    case 'initial-engineering-tasks':
      return renderTasksSection(onboardingPackage);
    case 'rituals':
      return renderRitualsSection(onboardingPackage);
    case 'engineering-resource-library':
      return renderLibrarySection(onboardingPackage);
  }
}

function renderWelcomeSection(
  onboardingPackage: OnboardingPackage
): KnownBlock[] {
  const welcome = onboardingPackage.sections.welcome;
  const checklistSections =
    onboardingPackage.sections.onboardingChecklist.sections;
  return [
    header(welcome.title),
    section(welcome.intro),
    ...(welcome.personalizedNote
      ? [section(`*Manager note*\n${welcome.personalizedNote}`)]
      : []),
    section(
      `*Onboarding POCs*\n${welcome.onboardingPocs
        .map((poc) => `• *${poc.label}* — ${poc.owner.name}\n  ${poc.summary}`)
        .join('\n')}`
    ),
    section(
      `*Onboarding journey*\n${welcome.journeyMilestones
        .map(
          (milestone) =>
            `• *${milestone.label}* — ${milestone.goal}${renderMilestoneLinks(
              checklistSections,
              milestone.label,
              '\n  '
            )}`
        )
        .join('\n')}`
    ),
  ];
}

function renderChecklistSection(
  onboardingPackage: OnboardingPackage,
  state: JourneyState
): KnownBlock[] {
  const checklist = onboardingPackage.sections.onboardingChecklist;
  const blocks: KnownBlock[] = [
    header(checklist.title),
    section(checklist.intro),
  ];

  for (const checklistSection of checklist.sections) {
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
      section(checklistSection.items.map(formatChecklistItem).join('\n')),
      divider()
    );
  }

  return blocks;
}

function renderPlanSection(onboardingPackage: OnboardingPackage): KnownBlock[] {
  const checklistSections =
    onboardingPackage.sections.onboardingChecklist.sections;
  return [
    header(onboardingPackage.sections.plan306090.title),
    section(onboardingPackage.sections.plan306090.intro),
    ...onboardingPackage.sections.plan306090.items.map((item) =>
      section(
        `*${item.timeframe}* — ${item.goalSummary}\n*New hire focus:* ${item.keyActivities}\n*Manager / buddy support:* ${item.supportActions}${renderMilestoneLinks(
          checklistSections,
          item.timeframe
        )}`
      )
    ),
  ];
}

function renderMilestoneLinks(
  checklistSections: OnboardingPackage['sections']['onboardingChecklist']['sections'],
  milestoneLabel: string,
  prefix = '\n'
): string {
  const links = linkedChecklistItemsForMilestone(
    checklistSections,
    milestoneLabel
  );
  return links.length > 0
    ? `${prefix}*Key links:* ${links
        .map(formatChecklistResourceLink)
        .join(' · ')}`
    : '';
}

function renderPeopleSection(
  onboardingPackage: OnboardingPackage
): KnownBlock[] {
  return [
    header(onboardingPackage.sections.peopleToMeet.title),
    section(onboardingPackage.sections.peopleToMeet.intro),
    ...buildPeopleSections(onboardingPackage.sections.peopleToMeet.people),
  ];
}

function renderToolsSection(
  onboardingPackage: OnboardingPackage
): KnownBlock[] {
  return [
    header(onboardingPackage.sections.toolsAccess.title),
    section(onboardingPackage.sections.toolsAccess.intro),
    section(formatTools(onboardingPackage.sections.toolsAccess.tools)),
  ];
}

function renderSlackSection(
  onboardingPackage: OnboardingPackage
): KnownBlock[] {
  return [
    header(onboardingPackage.sections.slack.title),
    section(onboardingPackage.sections.slack.intro),
    section(formatChannels(onboardingPackage.sections.slack.channels)),
  ];
}

function renderTasksSection(
  onboardingPackage: OnboardingPackage
): KnownBlock[] {
  const tasks = onboardingPackage.sections.initialEngineeringTasks.tasks;
  return [
    header(onboardingPackage.sections.initialEngineeringTasks.title),
    section(onboardingPackage.sections.initialEngineeringTasks.intro),
    section(
      `*Manager note*\n${onboardingPackage.sections.initialEngineeringTasks.managerPrompt}`
    ),
    ...(tasks.length > 0
      ? tasks.map((task) =>
          section(
            `*${task.title}*\n${task.description}\n_Why it works: ${task.rationale}_\nSkill: \`${task.skillCommand}\``
          )
        )
      : [
          section(
            'No scoped engineering tasks have been added yet. Managers can add them in the draft workflow before publication or ask Spark to scan for starter contributions.'
          ),
        ]),
  ];
}

function renderRitualsSection(
  onboardingPackage: OnboardingPackage
): KnownBlock[] {
  return [
    header(onboardingPackage.sections.rituals.title),
    section(onboardingPackage.sections.rituals.intro),
    section(formatRituals(onboardingPackage.sections.rituals.rituals)),
  ];
}

function renderLibrarySection(
  onboardingPackage: OnboardingPackage
): KnownBlock[] {
  return [
    header(onboardingPackage.sections.engineeringResourceLibrary.title),
    section(onboardingPackage.sections.engineeringResourceLibrary.intro),
    section(
      formatResourceLibrary(
        onboardingPackage.sections.engineeringResourceLibrary
      )
    ),
  ];
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function truncatePlainText(value: string): string {
  return value.length <= 75 ? value : `${value.slice(0, 72)}...`;
}
