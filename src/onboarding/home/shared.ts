import type {KnownBlock} from '@slack/types';
import {
  richText,
  richTextLink,
  richTextSection,
  richTextText,
  section,
  type RichTextInlineElement,
} from '../../slack/blockKit.js';
import type {OnboardingPerson} from '../types.js';

export function paragraph(text: string): KnownBlock {
  return richText([richTextSection([richTextText(text)])]);
}

export function buildPersonCard(
  person: OnboardingPerson,
  text: string
): KnownBlock {
  return section(
    text,
    person.avatarUrl
      ? {
          type: 'image',
          image_url: person.avatarUrl,
          alt_text: person.name,
        }
      : undefined
  );
}

export function formatPersonLabel(person: OnboardingPerson): string {
  return person.slackUserId ? `<@${person.slackUserId}>` : person.name;
}

export function buildRoleLabel(person: OnboardingPerson): string {
  return person.title && person.title !== person.role
    ? `${person.role} · ${person.title}`
    : person.role;
}

export function buildInlineLinkElements(
  links: Array<{url: string; label: string}>
): RichTextInlineElement[] {
  return links.flatMap((link, index) => [
    ...(index > 0 ? [richTextText(' · ')] : []),
    richTextLink(link.url, link.label),
  ]);
}

export function groupByCategory<T extends {category: string}>(
  items: T[],
  key: 'category'
): Array<{category: string; items: T[]}> {
  const groups = new Map<string, T[]>();
  items.forEach((item) => {
    const group = groups.get(item[key]) ?? [];
    group.push(item);
    groups.set(item[key], group);
  });
  return Array.from(groups.entries()).map(([category, groupedItems]) => ({
    category,
    items: groupedItems,
  }));
}

export function chunkList<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}
