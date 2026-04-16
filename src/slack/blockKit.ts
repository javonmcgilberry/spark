import type {KnownBlock} from '@slack/types';

export type StatusValue = 'not-started' | 'in-progress' | 'completed';

export type RichTextStyle = {
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
};

export interface RichTextTextElement {
  type: 'text';
  text: string;
  style?: RichTextStyle;
}

export interface RichTextLinkElement {
  type: 'link';
  url: string;
  text?: string;
  style?: RichTextStyle;
}

export interface RichTextEmojiElement {
  type: 'emoji';
  name: string;
}

export interface RichTextUserElement {
  type: 'user';
  user_id: string;
  style?: RichTextStyle;
}

export type RichTextInlineElement =
  | RichTextTextElement
  | RichTextLinkElement
  | RichTextEmojiElement
  | RichTextUserElement;

export interface RichTextSectionElement {
  type: 'rich_text_section';
  elements: RichTextInlineElement[];
}

export interface RichTextListElement {
  type: 'rich_text_list';
  style: 'bullet' | 'ordered';
  indent?: number;
  offset?: number;
  elements: RichTextSectionElement[];
}

export interface RichTextQuoteElement {
  type: 'rich_text_quote';
  elements: RichTextInlineElement[];
}

export type RichTextBlockElement =
  | RichTextSectionElement
  | RichTextListElement
  | RichTextQuoteElement;

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
    emoji: true,
  };
}

export function header(text: string, level?: 1 | 2 | 3): KnownBlock {
  return {
    type: 'header',
    text: plainText(text),
    ...(level ? {level} : {}),
  } as KnownBlock;
}

const MRKDWN_MAX_LENGTH = 3000;

export function section(
  text: string,
  accessory?: Record<string, unknown>
): KnownBlock {
  return {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text:
        text.length <= MRKDWN_MAX_LENGTH
          ? text
          : `${text.slice(0, MRKDWN_MAX_LENGTH - 3)}...`,
    },
    ...(accessory ? {accessory} : {}),
  } as KnownBlock;
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

export function richText(elements: RichTextBlockElement[]): KnownBlock {
  return {
    type: 'rich_text',
    elements,
  } as KnownBlock;
}

export function richTextText(
  text: string,
  style?: RichTextStyle
): RichTextTextElement {
  return {
    type: 'text',
    text,
    ...(style ? {style} : {}),
  };
}

export function richTextLink(
  url: string,
  text?: string,
  style?: RichTextStyle
): RichTextLinkElement {
  return {
    type: 'link',
    url,
    ...(text ? {text} : {}),
    ...(style ? {style} : {}),
  };
}

export function richTextEmoji(name: string): RichTextEmojiElement {
  return {
    type: 'emoji',
    name,
  };
}

export function richTextUser(
  userId: string,
  style?: RichTextStyle
): RichTextUserElement {
  return {
    type: 'user',
    user_id: userId,
    ...(style ? {style} : {}),
  };
}

export function richTextSection(
  elements: RichTextInlineElement[]
): RichTextSectionElement {
  return {
    type: 'rich_text_section',
    elements,
  };
}

export function richTextList(
  style: 'bullet' | 'ordered',
  items: RichTextInlineElement[][],
  options: {
    indent?: number;
    offset?: number;
  } = {}
): RichTextListElement {
  return {
    type: 'rich_text_list',
    style,
    elements: items.map((item) => richTextSection(item)),
    ...(typeof options.indent === 'number' ? {indent: options.indent} : {}),
    ...(typeof options.offset === 'number' ? {offset: options.offset} : {}),
  };
}

export function richTextQuote(text: string): RichTextQuoteElement {
  return {
    type: 'rich_text_quote',
    elements: [richTextText(text)],
  };
}

const STATUS_OPTIONS = [
  {
    text: plainText('🔴 Not started'),
    value: 'not-started',
  },
  {
    text: plainText('🟡 In progress'),
    value: 'in-progress',
  },
  {
    text: plainText('🟢 Completed'),
    value: 'completed',
  },
] as const;

export function statusSelect(actionId: string, currentStatus: StatusValue) {
  return {
    type: 'static_select' as const,
    action_id: actionId,
    placeholder: plainText('Status'),
    options: STATUS_OPTIONS,
    initial_option:
      STATUS_OPTIONS.find((option) => option.value === currentStatus) ??
      STATUS_OPTIONS[0],
  };
}
