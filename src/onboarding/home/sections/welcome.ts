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
  type RichTextBlockElement,
} from '../../../slack/blockKit.js';
import {linkedChecklistItemsForMilestone} from '../../display.js';
import type {
  ChecklistItem,
  ChecklistSection,
  OnboardingPackage,
  WelcomeJourneyMilestone,
} from '../../types.js';
import {buildPersonCard, buildRoleLabel, formatPersonLabel} from '../shared.js';

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
    richText(
      buildJourneyListElements(welcome.journeyMilestones, checklistSections)
    ),
    ...(onboardingPackage.draftCanvasUrl
      ? [
          section(
            `*Shared onboarding workspace*\nOpen <${onboardingPackage.draftCanvasUrl}|the onboarding canvas> whenever you want one shared place for notes, links, and progress.`
          ),
        ]
      : []),
  ];
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

/**
 * Slack nested lists are produced by emitting sibling `rich_text_list`
 * children inside the same `rich_text` block with increasing `indent`
 * values. Each milestone contributes up to three `rich_text_list`
 * elements: the label at indent 0, the focus/support/links headers at
 * indent 1, and individual helpful-link items at indent 2.
 */
function buildJourneyListElements(
  milestones: WelcomeJourneyMilestone[],
  checklistSections: ChecklistSection[]
): RichTextBlockElement[] {
  const elements: RichTextBlockElement[] = [];

  milestones.forEach((milestone) => {
    const links = linkedChecklistItemsForMilestone(
      checklistSections,
      milestone.label
    );

    elements.push(
      richTextList('bullet', [[richTextText(milestone.label, {bold: true})]], {
        indent: 0,
      })
    );

    const childItems: RichTextInlineElement[][] = [
      [
        richTextText('New hire focus: ', {bold: true}),
        richTextText(milestone.keyActivities),
      ],
      [
        richTextText('Manager / buddy support: ', {bold: true}),
        richTextText(milestone.supportActions),
      ],
    ];
    if (links.length > 0) {
      childItems.push([richTextText('Helpful links:', {bold: true})]);
    }

    elements.push(richTextList('bullet', childItems, {indent: 1}));

    if (links.length > 0) {
      elements.push(
        richTextList(
          'bullet',
          links.map((link) => buildLinkItem(link)),
          {indent: 2}
        )
      );
    }
  });

  return elements;
}

function buildLinkItem(
  link: ChecklistItem & {resourceUrl: string}
): RichTextInlineElement[] {
  return [
    {
      type: 'link',
      url: link.resourceUrl,
      text: link.resourceLabel ?? link.label,
    },
  ];
}
