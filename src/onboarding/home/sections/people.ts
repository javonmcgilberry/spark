import type {KnownBlock} from '@slack/types';
import {
  divider,
  header,
  richText,
  richTextLink,
  richTextList,
  richTextText,
  section,
} from '../../../slack/blockKit.js';
import type {PersonInsight} from '../../../services/peopleInsightsService.js';
import {groupPeopleByWeek} from '../../display.js';
import type {OnboardingPackage, OnboardingPerson} from '../../types.js';
import {
  buildPersonCard,
  buildRoleLabel,
  formatPersonLabel,
  paragraph,
} from '../shared.js';

export function renderPeopleSection(
  onboardingPackage: OnboardingPackage,
  insights?: Record<string, PersonInsight>
): KnownBlock[] {
  const blocks: KnownBlock[] = [
    header(onboardingPackage.sections.peopleToMeet.title),
    paragraph(onboardingPackage.sections.peopleToMeet.intro),
  ];

  groupPeopleByWeek(onboardingPackage.sections.peopleToMeet.people).forEach(
    (bucket, bucketIndex) => {
      if (bucketIndex > 0) {
        blocks.push(divider());
      }

      blocks.push(header(bucket.label, 2));
      bucket.people.forEach((person) => {
        blocks.push(...renderPersonCard(person, insights));
      });
    }
  );

  return blocks;
}

function renderPersonCard(
  person: OnboardingPerson,
  insights: Record<string, PersonInsight> | undefined
): KnownBlock[] {
  const insight = insights?.[personInsightKey(person)];
  const baseBody = `*${formatPersonLabel(person)}*\n_${buildRoleLabel(person)}_${
    person.userGuide
      ? `\n<${person.userGuide.url}|User guide> — ${person.userGuide.summary}`
      : ''
  }`;

  const blocks: KnownBlock[] = [buildPersonCard(person, baseBody)];

  const blurb = insight?.askMeAbout ?? person.discussionPoints;
  if (blurb) {
    blocks.push(section(`_${blurb}_`));
  }

  const links = buildRecentLinks(insight);
  if (links.length > 0) {
    blocks.push(
      richText([
        richTextList(
          'bullet',
          links.map((link) => [
            richTextLink(link.url, link.label),
            ...(link.meta
              ? [richTextText(` — ${link.meta}`, {italic: true})]
              : []),
          ])
        ),
      ])
    );
  }

  return blocks;
}

function buildRecentLinks(
  insight: PersonInsight | undefined
): Array<{url: string; label: string; meta?: string}> {
  if (!insight) {
    return [];
  }

  const ticketLinks = insight.recentTickets.map((ticket) => ({
    url: ticket.url,
    label: `${ticket.key}: ${ticket.summary}`,
    meta: ticket.status,
  }));
  const prLinks = insight.recentPRs.map((pr) => ({
    url: pr.url,
    label: `#${pr.number} ${pr.title}`,
    meta: pr.repository,
  }));

  return [...ticketLinks, ...prLinks].slice(0, 3);
}

function personInsightKey(person: OnboardingPerson): string {
  return (person.slackUserId || person.email || person.name).toLowerCase();
}
