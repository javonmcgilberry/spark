import type {KnownBlock} from '@slack/types';
import {
  divider,
  header,
  richText,
  richTextList,
  richTextQuote,
  richTextText,
  section,
  type RichTextInlineElement,
} from '../../../slack/blockKit.js';
import {linkedChecklistItemsForMilestone} from '../../display.js';
import type {OnboardingPackage} from '../../types.js';
import {
  buildInlineLinkElements,
  buildPersonCard,
  buildRoleLabel,
  formatPersonLabel,
  paragraph,
} from '../shared.js';

export function renderWelcomeSection(
  onboardingPackage: OnboardingPackage
): KnownBlock[] {
  const welcome = onboardingPackage.sections.welcome;
  const checklistSections =
    onboardingPackage.sections.onboardingChecklist.sections;

  return [
    header(welcome.title),
    section(welcome.intro),
    ...(welcome.personalizedNote
      ? [
          header('A note from your manager', 2),
          richText([richTextQuote(welcome.personalizedNote)]),
        ]
      : []),
    header('Onboarding POCs', 2),
    ...welcome.onboardingPocs.flatMap((poc) => renderWelcomePoc(poc)),
    divider(),
    header('Onboarding journey', 2),
    richText([
      richTextList(
        'bullet',
        welcome.journeyMilestones.map((milestone) =>
          buildMilestoneListItem(milestone, checklistSections)
        )
      ),
    ]),
    divider(),
    ...renderPlanSubsection(onboardingPackage),
    ...(onboardingPackage.draftCanvasUrl
      ? [
          section(
            `*Shared onboarding workspace*\nOpen <${onboardingPackage.draftCanvasUrl}|the onboarding canvas> whenever you want one shared place for notes, links, and progress.`
          ),
        ]
      : []),
  ];
}

function renderPlanSubsection(
  onboardingPackage: OnboardingPackage
): KnownBlock[] {
  const plan = onboardingPackage.sections.plan306090;
  const checklistSections =
    onboardingPackage.sections.onboardingChecklist.sections;
  const blocks: KnownBlock[] = [
    header('30/60/90 plan', 2),
    paragraph(plan.intro),
  ];

  plan.items.forEach((item) => {
    blocks.push(header(item.timeframe, 3));
    blocks.push(paragraph(item.goalSummary));

    const milestoneItems: RichTextInlineElement[][] = [
      [
        richTextText('New hire focus: ', {bold: true}),
        richTextText(item.keyActivities),
      ],
      [
        richTextText('Manager / buddy support: ', {bold: true}),
        richTextText(item.supportActions),
      ],
    ];
    const links = linkedChecklistItemsForMilestone(
      checklistSections,
      item.timeframe
    );
    if (links.length > 0) {
      milestoneItems.push([
        richTextText('Helpful links: ', {bold: true}),
        ...buildInlineLinkElements(
          links.map((link) => ({
            url: link.resourceUrl,
            label: link.resourceLabel ?? link.label,
          }))
        ),
      ]);
    }

    blocks.push(richText([richTextList('bullet', milestoneItems)]));
  });

  return blocks;
}

function renderWelcomePoc(
  poc: OnboardingPackage['sections']['welcome']['onboardingPocs'][number]
): KnownBlock[] {
  return [
    buildPersonCard(
      poc.owner,
      `*${poc.label}*\n${formatPersonLabel(poc.owner)}\n_${buildRoleLabel(poc.owner)}_\n${poc.summary}`
    ),
    richText([richTextQuote(poc.owner.discussionPoints)]),
  ];
}

function buildMilestoneListItem(
  milestone: OnboardingPackage['sections']['welcome']['journeyMilestones'][number],
  checklistSections: OnboardingPackage['sections']['onboardingChecklist']['sections']
): RichTextInlineElement[] {
  const links = linkedChecklistItemsForMilestone(
    checklistSections,
    milestone.label
  );

  return [
    richTextText(`${milestone.label}: `, {bold: true}),
    richTextText(milestone.goal),
    ...(links.length > 0
      ? [
          richTextText(' Helpful links: ', {italic: true}),
          ...buildInlineLinkElements(
            links.map((link) => ({
              url: link.resourceUrl,
              label: link.resourceLabel ?? link.label,
            }))
          ),
        ]
      : []),
  ];
}
