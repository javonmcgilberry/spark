import type {KnownBlock} from '@slack/types';
import {APP_NAME} from '../config/constants.js';
import {CHECKLIST_SECTIONS} from '../onboarding/catalog.js';
import type {OnboardingPackage, TeamProfile} from '../onboarding/types.js';
import {actions, header, plainText, section} from './blockKit.js';

export const SPARK_OPEN_DRAFT_MODAL_ACTION_ID = 'spark_open_draft_modal';
export const SPARK_CREATE_DRAFT_CALLBACK_ID = 'spark_create_draft_submit';
export const SPARK_OPEN_DRAFT_EDIT_MODAL_ACTION_ID =
  'spark_open_draft_edit_modal';
export const SPARK_EDIT_DRAFT_CALLBACK_ID = 'spark_edit_draft_submit';
export const SPARK_OPEN_ADD_CHECKLIST_ITEM_MODAL_ACTION_ID =
  'spark_open_add_checklist_item_modal';
export const SPARK_ADD_CHECKLIST_ITEM_CALLBACK_ID =
  'spark_add_checklist_item_submit';
export const SPARK_PUBLISH_DRAFT_ACTION_ID = 'spark_publish_draft_package';
export const SPARK_OPEN_CELEBRATION_SHARE_MODAL_ACTION_ID =
  'spark_open_celebration_share_modal';
export const SPARK_SHARE_CELEBRATION_CALLBACK_ID =
  'spark_share_celebration_submit';
export const SPARK_BUDDY_MARK_CHECKIN_ACTION_ID = 'spark_buddy_mark_checkin';

const CHECKLIST_KIND_OPTIONS = [
  {
    text: plainText('✅ Task'),
    value: 'task',
  },
  {
    text: plainText('🗣️ Live Training'),
    value: 'live-training',
  },
  {
    text: plainText('🚀 WorkRamp'),
    value: 'workramp',
  },
  {
    text: plainText('📚 Reading Material'),
    value: 'reading',
  },
  {
    text: plainText('🎥 Recording'),
    value: 'recording',
  },
] as const;

const CHECKLIST_SECTION_OPTIONS = CHECKLIST_SECTIONS.map((sectionItem) => ({
  text: plainText(sectionItem.title),
  value: sectionItem.id,
}));

export function buildSparkCommandMenuBlocks(): KnownBlock[] {
  return [
    header(APP_NAME),
    section(
      `Create a draft here, then review it in ${APP_NAME} Home or the draft channel before you publish it.`
    ),
    actions([
      {
        label: 'Create draft',
        actionId: SPARK_OPEN_DRAFT_MODAL_ACTION_ID,
        style: 'primary',
      },
    ]),
  ];
}

export function buildDraftSetupModal(initialNewHireId?: string) {
  return {
    type: 'modal' as const,
    callback_id: SPARK_CREATE_DRAFT_CALLBACK_ID,
    title: plainText('Create draft'),
    submit: plainText('Create draft'),
    close: plainText('Cancel'),
    blocks: [
      {
        type: 'input' as const,
        block_id: 'new_hire',
        label: plainText('New hire'),
        element: {
          type: 'users_select' as const,
          action_id: 'selected_user',
          placeholder: plainText('Choose a new hire'),
          ...(initialNewHireId ? {initial_user: initialNewHireId} : {}),
        },
      },
      {
        type: 'input' as const,
        block_id: 'buddy',
        optional: true,
        label: plainText('Onboarding buddy'),
        element: {
          type: 'users_select' as const,
          action_id: 'selected_user',
          placeholder: plainText('Choose a buddy'),
        },
      },
      {
        type: 'input' as const,
        block_id: 'stakeholders',
        optional: true,
        label: plainText('Additional reviewers or stakeholders'),
        element: {
          type: 'multi_users_select' as const,
          action_id: 'selected_users',
          placeholder: plainText('Add PMs, designers, or teammates'),
        },
      },
      {
        type: 'input' as const,
        block_id: 'welcome_note',
        optional: true,
        label: plainText('Welcome note'),
        element: {
          type: 'plain_text_input' as const,
          action_id: 'value',
          multiline: true,
          placeholder: plainText('Add a note to help them feel welcome'),
        },
      },
    ],
  };
}

export function buildDraftEditModal(pkg: OnboardingPackage) {
  const stakeholderUserIds = pkg.reviewerUserIds.filter(
    (userId) =>
      userId !== pkg.createdByUserId &&
      userId !== pkg.managerUserId &&
      userId !== pkg.buddyUserId
  );
  const customItemCount = pkg.customChecklistItems?.length ?? 0;

  return {
    type: 'modal' as const,
    callback_id: SPARK_EDIT_DRAFT_CALLBACK_ID,
    private_metadata: pkg.userId,
    title: plainText('Edit draft'),
    submit: plainText('Save'),
    close: plainText('Cancel'),
    blocks: [
      {
        type: 'section' as const,
        text: {
          type: 'mrkdwn' as const,
          text: `Update the onboarding details for <@${pkg.userId}> here. Use the canvas for any team notes or context you want to keep close by.`,
        },
      },
      {
        type: 'input' as const,
        block_id: 'buddy',
        optional: true,
        label: plainText('Onboarding buddy'),
        element: {
          type: 'users_select' as const,
          action_id: 'selected_user',
          placeholder: plainText('Choose a buddy'),
          ...(pkg.buddyUserId ? {initial_user: pkg.buddyUserId} : {}),
        },
      },
      {
        type: 'input' as const,
        block_id: 'stakeholders',
        optional: true,
        label: plainText('Additional reviewers or stakeholders'),
        element: {
          type: 'multi_users_select' as const,
          action_id: 'selected_users',
          placeholder: plainText('Add PMs, designers, or teammates'),
          ...(stakeholderUserIds.length > 0
            ? {initial_users: stakeholderUserIds}
            : {}),
        },
      },
      {
        type: 'input' as const,
        block_id: 'welcome_note',
        optional: true,
        label: plainText('Welcome note'),
        element: {
          type: 'plain_text_input' as const,
          action_id: 'value',
          multiline: true,
          initial_value: pkg.welcomeNote ?? '',
          placeholder: plainText('Add a note to help them feel welcome'),
        },
      },
      {
        type: 'section' as const,
        text: {
          type: 'mrkdwn' as const,
          text:
            customItemCount > 0
              ? `Need to tailor the checklist?\n_${customItemCount} custom checklist item${customItemCount === 1 ? '' : 's'} added so far._`
              : 'Need to tailor the checklist?\n_Add a week-specific checklist item for this new hire._',
        },
        accessory: {
          type: 'button' as const,
          action_id: SPARK_OPEN_ADD_CHECKLIST_ITEM_MODAL_ACTION_ID,
          text: plainText('Add checklist item'),
          value: pkg.userId,
        },
      },
    ],
  };
}

export function buildAddChecklistItemModal(userId: string) {
  return {
    type: 'modal' as const,
    callback_id: SPARK_ADD_CHECKLIST_ITEM_CALLBACK_ID,
    private_metadata: userId,
    title: plainText('Add checklist item'),
    submit: plainText('Add item'),
    close: plainText('Cancel'),
    blocks: [
      {
        type: 'input' as const,
        block_id: 'item_label',
        label: plainText('Item name'),
        element: {
          type: 'plain_text_input' as const,
          action_id: 'value',
          placeholder: plainText('Add the checklist item title'),
        },
      },
      {
        type: 'input' as const,
        block_id: 'item_kind',
        label: plainText('Type'),
        element: {
          type: 'static_select' as const,
          action_id: 'selected_kind',
          placeholder: plainText('Choose a type'),
          options: CHECKLIST_KIND_OPTIONS,
        },
      },
      {
        type: 'input' as const,
        block_id: 'item_section',
        label: plainText('Week'),
        element: {
          type: 'static_select' as const,
          action_id: 'selected_section',
          placeholder: plainText('Choose a week'),
          options: CHECKLIST_SECTION_OPTIONS,
        },
      },
      {
        type: 'input' as const,
        block_id: 'item_notes',
        optional: true,
        label: plainText('Notes'),
        element: {
          type: 'plain_text_input' as const,
          action_id: 'value',
          multiline: true,
          placeholder: plainText('Add context or instructions for this item'),
        },
      },
      {
        type: 'input' as const,
        block_id: 'item_resource_url',
        optional: true,
        label: plainText('Resource link'),
        element: {
          type: 'plain_text_input' as const,
          action_id: 'value',
          placeholder: plainText('https://...'),
        },
      },
    ],
  };
}

export function buildDraftReadyBlocks(
  profile: TeamProfile,
  pkg: Pick<OnboardingPackage, 'draftCanvasUrl' | 'draftChannelName' | 'userId'>
): KnownBlock[] {
  return [
    header('Draft ready to review'),
    section(
      `Review the onboarding draft for <@${profile.userId}> here before you publish it. Use the buttons below for structured updates, and use the canvas for shared notes and context.\n\nNeed to add custom checklist items? Open *Edit draft details* and use the *Add checklist item* button in that modal.${
        pkg.draftCanvasUrl
          ? `\n\n*Draft canvas:* <${pkg.draftCanvasUrl}|Open canvas>`
          : ''
      }${pkg.draftChannelName ? `\n*Draft channel:* #${pkg.draftChannelName}` : ''}`
    ),
    actions([
      {
        label: 'Edit draft details',
        actionId: SPARK_OPEN_DRAFT_EDIT_MODAL_ACTION_ID,
        value: pkg.userId,
      },
      {
        label: 'Publish draft',
        actionId: SPARK_PUBLISH_DRAFT_ACTION_ID,
        value: pkg.userId,
        style: 'primary',
      },
    ]),
  ];
}

export function buildCelebrationShareBlocks(
  previewText: string,
  newHireUserId: string
): KnownBlock[] {
  return [
    header('Ready to share'),
    section(
      `Share this milestone in a public channel, or in a private channel where ${APP_NAME} is already there.\n\n*Preview*\n>${previewText}`
    ),
    actions([
      {
        label: 'Choose channel',
        actionId: SPARK_OPEN_CELEBRATION_SHARE_MODAL_ACTION_ID,
        value: newHireUserId,
        style: 'primary',
      },
    ]),
  ];
}

export function buildCelebrationShareModal(
  previewText: string,
  newHireUserId: string
) {
  return {
    type: 'modal' as const,
    callback_id: SPARK_SHARE_CELEBRATION_CALLBACK_ID,
    private_metadata: newHireUserId,
    title: plainText('Share milestone'),
    submit: plainText('Share'),
    close: plainText('Cancel'),
    blocks: [
      {
        type: 'section' as const,
        text: {
          type: 'mrkdwn' as const,
          text: `*Preview*\n>${previewText}`,
        },
      },
      {
        type: 'input' as const,
        block_id: 'share_destination',
        label: plainText('Channel'),
        element: {
          type: 'conversations_select' as const,
          action_id: 'selected_conversation',
          placeholder: plainText('Choose a channel'),
          filter: {
            include: ['public', 'private'] as const,
          },
        },
      },
    ],
  };
}
