import type {KnownBlock} from '@slack/types';
import {APP_NAME} from '../../config/constants.js';
import type {PersonInsight} from '../../services/peopleInsightsService.js';
import {actions, divider, header, section} from '../../slack/blockKit.js';
import {SPARK_OPEN_DRAFT_EDIT_MODAL_ACTION_ID} from '../../slack/workflowUi.js';
import type {JourneyState, OnboardingPackage} from '../types.js';
import {buildTabNavigation} from './navigation.js';
import {
  renderChecklistSection,
  countChecklistItems,
  countCompletedChecklistItems,
} from './sections/checklist.js';
import {renderPeopleSection} from './sections/people.js';
import {renderResourcesSection} from './sections/resources.js';
import {renderTasksSection} from './sections/tasks.js';
import {renderWelcomeSection} from './sections/welcome.js';
import {buildHomeSummaryBlock} from './summary.js';

export {
  HOME_CHECKLIST_ACTION_ID,
  HOME_NAV_ACTION_ID,
  HOME_TOOL_ACCESS_ACTION_ID,
  TOOL_CHECKBOX_CHUNK_SIZE,
  buildChecklistItemActionId,
  buildToolAccessKey,
  parseChecklistItemActionId,
  slugifyToolCategory,
} from './actionIds.js';

export interface HomeViewContext {
  peopleInsights?: Record<string, PersonInsight>;
}

export function buildHomeView(
  onboardingPackage: OnboardingPackage,
  state: JourneyState,
  context: HomeViewContext = {}
) {
  const checklistSections =
    onboardingPackage.sections.onboardingChecklist.sections;
  const completedCount = countCompletedChecklistItems(checklistSections, state);
  const totalCount = countChecklistItems(checklistSections);
  const blocks: KnownBlock[] = [
    header(`${APP_NAME} onboarding`),
    buildHomeSummaryBlock(onboardingPackage, completedCount, totalCount),
    ...buildTabNavigation(state.activeHomeSection),
    divider(),
    ...renderActiveSection(onboardingPackage, state, context),
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
    header(`${APP_NAME} onboarding`),
    section(
      drafts.length > 0
        ? `These onboarding drafts still need a final review before ${APP_NAME} shares the new-hire experience.`
        : `Your onboarding plan has not been published yet. ${APP_NAME} will stay hidden until your manager or onboarding team finishes the draft and shares it with you.`
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
            "If you're waiting on onboarding details, your manager or onboarding buddy can help."
          ),
        ]),
  ];

  return {
    type: 'home' as const,
    blocks,
  };
}

function renderActiveSection(
  onboardingPackage: OnboardingPackage,
  state: JourneyState,
  context: HomeViewContext
): KnownBlock[] {
  switch (state.activeHomeSection) {
    case 'welcome':
      return renderWelcomeSection(onboardingPackage);
    case 'onboarding-checklist':
      return renderChecklistSection(onboardingPackage, state);
    case 'people-to-meet':
      return renderPeopleSection(onboardingPackage, context.peopleInsights);
    case 'resources':
      return renderResourcesSection(onboardingPackage, state);
    case 'initial-engineering-tasks':
      return renderTasksSection(onboardingPackage);
  }
}
