import type {KnownBlock} from '@slack/types';
import type {
  ConfluenceLink,
  DocLink,
  OnboardingPerson,
  RitualGuide,
  SlackChannelGuide,
  ToolGuide,
} from './types.js';

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
    .slice(0, 5)
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

export function formatKeyPaths(
  keyPaths: string[],
  emptyText = "Spark couldn't infer team-owned paths yet — check with your buddy or look at CODEOWNERS."
): string {
  if (keyPaths.length === 0) {
    return `*Key repo paths*\n${emptyText}`;
  }

  return `*Key repo paths*\n${keyPaths
    .map((keyPath) => `• \`${keyPath}\``)
    .join('\n')}`;
}

export function countCompletedInSection(
  itemLabels: string[],
  completedChecklist: string[]
): number {
  return itemLabels.filter((label) => completedChecklist.includes(label))
    .length;
}

export function formatCanvasPerson(person: OnboardingPerson): string {
  return person.slackUserId ? `![](@${person.slackUserId})` : person.name;
}

function buildPersonSection(person: OnboardingPerson): KnownBlock {
  const block = {
    type: 'section' as const,
    text: {
      type: 'mrkdwn' as const,
      text: `*${formatSlackPerson(person)}* · ${person.role}\n${person.discussionPoints}`,
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

function section(text: string): KnownBlock {
  return {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text,
    },
  };
}
