import type {KnownBlock} from '@slack/types';
import type {
  ChecklistItem,
  ChecklistSection,
  ChecklistItemStatus,
  ConfluenceLink,
  DocLink,
  EngineeringResourceLibrarySection,
  OnboardingReferences,
  OnboardingPerson,
  RitualGuide,
  SlackChannelGuide,
  ToolGuide,
} from './types.js';
import {buildChecklistItemStatusKey} from './types.js';
import {section} from '../slack/blockKit.js';

export function buildPeopleSections(people: OnboardingPerson[]): KnownBlock[] {
  const blocks: KnownBlock[] = [];

  for (const bucket of groupPeopleByWeek(people)) {
    blocks.push(section(`*${bucket.label}*`));
    for (const person of bucket.people) {
      blocks.push(buildPersonSection(person));
    }
  }

  return blocks;
}

export function groupPeopleByWeek(people: OnboardingPerson[]) {
  return [
    {label: 'Week 1-2', weekBucket: 'week1-2' as const},
    {label: 'Week 2-3', weekBucket: 'week2-3' as const},
    {label: 'Week 3+', weekBucket: 'week3+' as const},
  ]
    .map((bucket) => ({
      label: bucket.label,
      people: people.filter(
        (person) => person.weekBucket === bucket.weekBucket
      ),
    }))
    .filter((bucket) => bucket.people.length > 0);
}

export function formatChannels(
  channels: SlackChannelGuide[],
  heading = 'Channels'
): string {
  return `*${heading}*\n${channels
    .map((channel) => `• *${channel.channel}* — ${channel.description}`)
    .join('\n')}`;
}

export function formatTools(tools: ToolGuide[]): string {
  return `*Tools*\n${tools
    .map((tool) => `• *${tool.tool}* — ${tool.description}`)
    .join('\n')}`;
}

export function formatRituals(rituals: RitualGuide[]): string {
  return `*Rituals*\n${rituals
    .map(
      (ritual) =>
        `• *${ritual.meeting}* — ${ritual.cadence}, ${ritual.attendance.toLowerCase()}`
    )
    .join('\n')}`;
}

export function formatDocs(
  docs: DocLink[],
  heading = 'Docs to start with'
): string {
  return `*${heading}*\n${docs
    .map((doc) =>
      doc.url
        ? `• <${doc.url}|${doc.title}> — ${doc.description}`
        : `• ${doc.title} — ${doc.description}`
    )
    .join('\n')}`;
}

export function formatConfluenceLinks(
  links: ConfluenceLink[],
  heading = 'Helpful Confluence pages'
): string {
  return `*${heading}*\n${links
    .map((link) => `• <${link.url}|${link.title}> — ${link.summary}`)
    .join('\n')}`;
}

export function formatReferences(
  references: OnboardingReferences,
  heading = 'Focused Confluence references'
): string {
  const links = [
    references.teamPage,
    references.pillarPage,
    references.newHireGuide,
  ].filter((link): link is ConfluenceLink => Boolean(link));

  if (links.length === 0) {
    return `*${heading}*\nNo focused team page, pillar page, or user guide found yet.`;
  }

  return formatConfluenceLinks(links, heading);
}

export function formatResourceLibrary(
  resources: EngineeringResourceLibrarySection
): string {
  const parts = [formatDocs(resources.docs, 'Core engineering docs')];
  if (
    resources.references.teamPage ||
    resources.references.pillarPage ||
    resources.references.newHireGuide
  ) {
    parts.push(formatReferences(resources.references));
  }
  parts.push(
    formatKeyPaths(
      resources.keyPaths,
      'Ask your buddy which CODEOWNERS paths matter most for your team.'
    )
  );
  return parts.join('\n\n');
}

export function formatKeyPaths(
  keyPaths: string[],
  emptyText = "Team-owned paths aren't listed yet — check with your buddy or look at CODEOWNERS."
): string {
  if (keyPaths.length === 0) {
    return `*Key repo paths*\n${emptyText}`;
  }

  return `*Key repo paths*\n${keyPaths
    .map((keyPath) => `• \`${keyPath}\``)
    .join('\n')}`;
}

export function countCompletedInSection(
  checklistSection: ChecklistSection,
  itemStatuses: Record<string, ChecklistItemStatus>
): number {
  return checklistSection.items.filter(
    (_, itemIndex) =>
      itemStatuses[
        buildChecklistItemStatusKey(checklistSection.id, itemIndex)
      ] === 'completed'
  ).length;
}

export function formatChecklistItem(item: ChecklistItem): string {
  const notesSuffix = item.notes ? ` — ${item.notes}` : '';
  if (!hasChecklistResource(item)) {
    return `• *${item.label}*${notesSuffix}`;
  }
  if (!item.resourceLabel || item.resourceLabel === item.label) {
    return `• ${formatChecklistResourceLink(item)}${notesSuffix}`;
  }
  return `• *${item.label}*${notesSuffix}\n  ${formatChecklistResourceLink(item)}`;
}

export function formatCanvasChecklistItem(item: ChecklistItem): string[] {
  if (!hasChecklistResource(item)) {
    return item.notes
      ? [`- [ ] ${item.label}`, `  - ${item.notes}`]
      : [`- [ ] ${item.label}`];
  }
  if (!item.resourceLabel || item.resourceLabel === item.label) {
    return item.notes
      ? [
          `- [ ] ${formatCanvasChecklistResourceLink(item)}`,
          `  - ${item.notes}`,
        ]
      : [`- [ ] ${formatCanvasChecklistResourceLink(item)}`];
  }
  return [
    `- [ ] ${item.label}`,
    ...(item.notes ? [`  - ${item.notes}`] : []),
    `  - ${formatCanvasChecklistResourceLink(item)}`,
  ];
}

export function linkedChecklistItemsForMilestone(
  checklistSections: ChecklistSection[],
  milestoneLabel: string
): Array<ChecklistItem & {resourceUrl: string}> {
  const sectionId = checklistSectionIdForMilestone(milestoneLabel);
  if (!sectionId) {
    return [];
  }

  return (
    checklistSections
      .find((s) => s.id === sectionId)
      ?.items.filter(hasChecklistResource)
      .slice(0, 4) ?? []
  );
}

export function formatChecklistResourceLink(
  item: ChecklistItem & {resourceUrl: string}
): string {
  return `<${item.resourceUrl}|${item.resourceLabel ?? item.label}>`;
}

export function formatCanvasChecklistResourceLink(
  item: ChecklistItem & {resourceUrl: string}
): string {
  return `[${item.resourceLabel ?? item.label}](${item.resourceUrl})`;
}

export function formatCanvasPerson(person: OnboardingPerson): string {
  return person.slackUserId ? `![](@${person.slackUserId})` : person.name;
}

function buildPersonSection(person: OnboardingPerson): KnownBlock {
  const guideLine = person.userGuide
    ? `\n<${person.userGuide.url}|User guide> — ${person.userGuide.summary}`
    : '';
  const roleLabel =
    person.title && person.title !== person.role
      ? `${person.role} · ${person.title}`
      : person.role;
  const block = {
    type: 'section' as const,
    text: {
      type: 'mrkdwn' as const,
      text: `*${formatSlackPerson(person)}* · ${roleLabel}\n${person.discussionPoints}${guideLine}`,
    },
  };

  return person.avatarUrl
    ? {
        ...block,
        accessory: {
          type: 'image' as const,
          image_url: person.avatarUrl,
          alt_text: person.name,
        },
      }
    : block;
}

function formatSlackPerson(person: OnboardingPerson): string {
  return person.slackUserId ? `<@${person.slackUserId}>` : person.name;
}

function hasChecklistResource(
  item: ChecklistItem
): item is ChecklistItem & {resourceUrl: string} {
  return typeof item.resourceUrl === 'string' && item.resourceUrl.length > 0;
}

function checklistSectionIdForMilestone(
  milestoneLabel: string
): string | undefined {
  const normalized = milestoneLabel.toLowerCase();
  if (normalized.includes('week 1')) {
    return 'week1-setup';
  }
  if (normalized.includes('week 2')) {
    return 'week2-workflows';
  }
  if (normalized.includes('week 3')) {
    return 'week3-contribution';
  }
  if (normalized.includes('week 4')) {
    return 'week4-citizenship';
  }
  return undefined;
}
