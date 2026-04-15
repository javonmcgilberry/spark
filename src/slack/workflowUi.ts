import type {KnownBlock} from '@slack/types';
import type {OnboardingPackage, TeamProfile} from '../onboarding/types.js';
import {actions, header, plainText, section} from './blockKit.js';

export const SPARK_OPEN_DRAFT_MODAL_ACTION_ID = 'spark_open_draft_modal';
export const SPARK_CREATE_DRAFT_CALLBACK_ID = 'spark_create_draft_submit';
export const SPARK_OPEN_DRAFT_EDIT_MODAL_ACTION_ID =
  'spark_open_draft_edit_modal';
export const SPARK_EDIT_DRAFT_CALLBACK_ID = 'spark_edit_draft_submit';
export const SPARK_PUBLISH_DRAFT_ACTION_ID = 'spark_publish_draft_package';
export const SPARK_OPEN_CELEBRATION_SHARE_MODAL_ACTION_ID =
  'spark_open_celebration_share_modal';
export const SPARK_SHARE_CELEBRATION_CALLBACK_ID =
  'spark_share_celebration_submit';

export function buildSparkCommandMenuBlocks(): KnownBlock[] {
  return [
    header('Spark'),
    section(
      'Create a new onboarding draft here, then review active drafts from Spark Home or the draft channel before publishing.'
    ),
    actions([
      {
        label: 'Create onboarding draft',
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
          placeholder: plainText(
            'Optional note from the manager to the new hire'
          ),
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
          text: `Update the structured onboarding details for <@${pkg.userId}> here. Use the canvas for long-form team notes and context.`,
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
          placeholder: plainText(
            'Optional note from the manager to the new hire'
          ),
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
    header('Draft ready for review'),
    section(
      `Review the onboarding draft for <@${profile.userId}> here before publishing. Use the buttons below for structured updates, and use the canvas for shared long-form notes.${
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
        label: 'Publish to new hire',
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
      `Share this milestone in a public channel or in a private channel where Spark is already present.\n\n*Preview*\n>${previewText}`
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
