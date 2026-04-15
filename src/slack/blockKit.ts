import type {KnownBlock} from '@slack/types';

export interface ButtonSpec {
  label: string;
  actionId: string;
  value?: string;
  style?: 'primary' | 'danger';
}

export function plainText(text: string) {
  return {
    type: 'plain_text' as const,
    text,
    emoji: false,
  };
}

export function header(text: string): KnownBlock {
  return {
    type: 'header',
    text: plainText(text),
  };
}

export function section(text: string): KnownBlock {
  return {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text,
    },
  };
}

export function divider(): KnownBlock {
  return {type: 'divider'};
}

export function actions(buttons: ButtonSpec[]): KnownBlock {
  return {
    type: 'actions',
    elements: buttons.map((button) => ({
      type: 'button',
      text: plainText(button.label),
      action_id: button.actionId,
      value: button.value ?? button.label,
      style: button.style,
    })),
  };
}
