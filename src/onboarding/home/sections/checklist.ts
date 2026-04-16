import type {KnownBlock} from '@slack/types';
import {
  divider,
  header,
  section,
  statusSelect,
  type StatusValue,
} from '../../../slack/blockKit.js';
import {countCompletedInSection} from '../../display.js';
import {
  buildChecklistItemStatusKey,
  type ChecklistItem,
  type JourneyState,
  type OnboardingPackage,
} from '../../types.js';
import {buildChecklistItemActionId} from '../actionIds.js';
import {paragraph} from '../shared.js';

export function renderChecklistSection(
  onboardingPackage: OnboardingPackage,
  state: JourneyState
): KnownBlock[] {
  const checklist = onboardingPackage.sections.onboardingChecklist;
  const completedCount = countCompletedChecklistItems(
    checklist.sections,
    state
  );
  const totalCount = countChecklistItems(checklist.sections);
  const blocks: KnownBlock[] = [
    header(checklist.title),
    paragraph(checklist.intro),
    section(`*Progress*\n${completedCount}/${totalCount} completed`),
  ];

  checklist.sections.forEach((checklistSection, sectionIndex) => {
    if (sectionIndex > 0) {
      blocks.push(divider());
    }

    blocks.push(header(checklistSection.title, 2));
    blocks.push(
      section(
        `${checklistSection.goal}\n_${countCompletedInSection(
          checklistSection,
          state.itemStatuses
        )}/${checklistSection.items.length} completed_`
      )
    );

    checklistSection.items.forEach((item, itemIndex) => {
      const itemStatus = getItemStatus(checklistSection.id, itemIndex, state);
      blocks.push(
        section(
          formatChecklistItemBlock(item, itemStatus),
          statusSelect(
            buildChecklistItemActionId(checklistSection.id, itemIndex),
            itemStatus
          )
        )
      );
    });
  });

  return blocks;
}

export function countChecklistItems(
  checklistSections: OnboardingPackage['sections']['onboardingChecklist']['sections']
): number {
  return checklistSections.reduce(
    (sum, checklistSection) => sum + checklistSection.items.length,
    0
  );
}

export function countCompletedChecklistItems(
  checklistSections: OnboardingPackage['sections']['onboardingChecklist']['sections'],
  state: JourneyState
): number {
  return checklistSections.reduce(
    (sum, checklistSection) =>
      sum + countCompletedInSection(checklistSection, state.itemStatuses),
    0
  );
}

function formatChecklistItemBlock(
  item: ChecklistItem,
  status: StatusValue
): string {
  const statusDot = formatChecklistStatusEmoji(status);
  const title = item.resourceUrl
    ? `*<${item.resourceUrl}|${item.label}>*`
    : `*${item.label}*`;
  const notesLine = item.notes ? `\n${item.notes}` : '';
  const typeLine = `\nType: ${formatChecklistKindEmoji(item.kind)} ${formatChecklistKindLabel(
    item.kind
  )}`;

  return `${statusDot} ${title}${notesLine}${typeLine}`;
}

function formatChecklistStatusEmoji(status: StatusValue): string {
  switch (status) {
    case 'not-started':
      return '🔴';
    case 'in-progress':
      return '🟡';
    case 'completed':
      return '🟢';
  }
}

function formatChecklistKindEmoji(kind: ChecklistItem['kind']): string {
  switch (kind) {
    case 'task':
      return '✅';
    case 'live-training':
      return '🗣️';
    case 'workramp':
      return '🚀';
    case 'reading':
      return '📚';
    case 'recording':
      return '🎥';
  }
}

function formatChecklistKindLabel(kind: ChecklistItem['kind']): string {
  switch (kind) {
    case 'task':
      return 'Task';
    case 'live-training':
      return 'Live Training';
    case 'workramp':
      return 'WorkRamp';
    case 'reading':
      return 'Reading Material';
    case 'recording':
      return 'Recording';
  }
}

function getItemStatus(
  sectionId: string,
  itemIndex: number,
  state: JourneyState
): StatusValue {
  return (
    state.itemStatuses[buildChecklistItemStatusKey(sectionId, itemIndex)] ??
    'not-started'
  );
}
