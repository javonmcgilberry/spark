import type {KnownBlock} from '@slack/types';
import {HOME_SECTION_TABS} from './catalog.js';
import {
  countCompletedInSection,
  groupPeopleByWeek,
  linkedChecklistItemsForMilestone,
} from './display.js';
import {
  actions,
  checkboxes,
  divider,
  header,
  richText,
  richTextLink,
  richTextList,
  richTextQuote,
  richTextSection,
  richTextText,
  section,
  statusSelect,
  type RichTextInlineElement,
  type StatusValue,
} from '../slack/blockKit.js';
import {SPARK_OPEN_DRAFT_EDIT_MODAL_ACTION_ID} from '../slack/workflowUi.js';
import {
  buildChecklistItemStatusKey,
  type ConfluenceLink,
  type ChecklistItem,
  type HomeSectionId,
  type JourneyState,
  type OnboardingPackage,
  type OnboardingPerson,
  type SlackChannelGuide,
  type ToolGuide,
} from './types.js';

export const HOME_CHECKLIST_ACTION_ID = 'spark_item_status';
export const HOME_NAV_ACTION_ID = 'spark_home_open_section';
export const HOME_TOOL_ACCESS_ACTION_ID = 'spark_tool_access';
export const TOOL_CHECKBOX_CHUNK_SIZE = 10;

const WEBFLOW_REPO_URL = 'https://github.com/webflow/webflow';

export function buildHomeView(
  onboardingPackage: OnboardingPackage,
  state: JourneyState
) {
  const checklistSections =
    onboardingPackage.sections.onboardingChecklist.sections;
  const completedCount = countCompletedChecklistItems(checklistSections, state);
  const totalCount = countChecklistItems(checklistSections);
  const blocks: KnownBlock[] = [
    header('Spark onboarding'),
    buildHomeSummaryBlock(onboardingPackage, completedCount, totalCount),
    ...buildTabNavigation(state.activeHomeSection),
    divider(),
    ...renderActiveSection(onboardingPackage, state),
  ];

  return {
    type: 'home' as const,
    blocks,
  };
}

export function buildHomePendingView(drafts: OnboardingPackage[] = []): {
  type: 'home';
  blocks: KnownBlock[];
} {
  const blocks: KnownBlock[] = [
    header('Spark onboarding'),
    section(
      drafts.length > 0
        ? 'These onboarding drafts still need a final review before Spark shares the new-hire experience.'
        : 'Your onboarding plan has not been published yet. Spark will stay hidden until your manager or onboarding team finishes the draft and shares it with you.'
    ),
    ...(drafts.length > 0
      ? drafts.flatMap((draft) => [
          section(
            `*${draft.sections.welcome.title} for <@${draft.userId}>*\nStatus: *${draft.status}*${
              draft.draftCanvasUrl
                ? `\nDraft canvas: <${draft.draftCanvasUrl}|Open canvas>`
                : ''
            }${draft.draftChannelName ? `\nDraft channel: #${draft.draftChannelName}` : ''}`
          ),
          actions([
            {
              label: 'Edit draft details',
              actionId: SPARK_OPEN_DRAFT_EDIT_MODAL_ACTION_ID,
              value: draft.userId,
            },
          ]),
        ])
      : [
          section(
            "If you're waiting on onboarding details, your manager or onboarding buddy can help."
          ),
        ]),
  ];

  return {
    type: 'home' as const,
    blocks,
  };
}

export function buildChecklistItemActionId(
  sectionId: string,
  itemIndex: number
): string {
  return `${HOME_CHECKLIST_ACTION_ID}:${sectionId}:${itemIndex}`;
}

export function parseChecklistItemActionId(
  actionId: string
): {sectionId: string; itemIndex: number} | null {
  if (!actionId.startsWith(`${HOME_CHECKLIST_ACTION_ID}:`)) {
    return null;
  }

  const [, sectionId, itemIndexText] = actionId.split(':');
  const itemIndex = Number(itemIndexText);
  if (!sectionId || Number.isNaN(itemIndex)) {
    return null;
  }

  return {sectionId, itemIndex};
}

function buildHomeSummaryBlock(
  onboardingPackage: OnboardingPackage,
  completedCount: number,
  totalCount: number
): KnownBlock {
  return richText([
    richTextSection([
      richTextText('Checklist progress: ', {bold: true}),
      richTextText(`${completedCount}/${totalCount}`),
      ...(onboardingPackage.welcomeNote
        ? [
            richTextText('\nManager note: ', {bold: true}),
            richTextText('Included'),
          ]
        : []),
    ]),
  ]);
}

function buildTabNavigation(activeSection: HomeSectionId): KnownBlock[] {
  return [
    actions(
      HOME_SECTION_TABS.map((tab) => ({
        label: tab.label,
        actionId: `${HOME_NAV_ACTION_ID}:${tab.id}`,
        value: tab.id,
        style: activeSection === tab.id ? 'primary' : undefined,
      }))
    ),
  ];
}

function renderActiveSection(
  onboardingPackage: OnboardingPackage,
  state: JourneyState
): KnownBlock[] {
  switch (state.activeHomeSection) {
    case 'welcome':
      return renderWelcomeSection(onboardingPackage);
    case 'onboarding-checklist':
      return renderChecklistSection(onboardingPackage, state);
    case 'people-to-meet':
      return renderPeopleSection(onboardingPackage);
    case 'resources':
      return renderResourcesSection(onboardingPackage, state);
    case 'initial-engineering-tasks':
      return renderTasksSection(onboardingPackage);
  }
}

function renderWelcomeSection(
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

function renderChecklistSection(
  onboardingPackage: OnboardingPackage,
  state: JourneyState
): KnownBlock[] {
  const checklist = onboardingPackage.sections.onboardingChecklist;
  const completedCount = countCompletedChecklistItems(
    checklist.sections,
    state
  );
  const totalCount = countChecklistItems(checklist.sections);
  const blocks: KnownBlock[] = [
    header(checklist.title),
    paragraph(checklist.intro),
    section(`*Progress*\n${completedCount}/${totalCount} completed`),
  ];

  checklist.sections.forEach((checklistSection, sectionIndex) => {
    if (sectionIndex > 0) {
      blocks.push(divider());
    }

    blocks.push(header(checklistSection.title, 2));
    blocks.push(
      section(
        `${checklistSection.goal}\n_${countCompletedInSection(
          checklistSection,
          state.itemStatuses
        )}/${checklistSection.items.length} completed_`
      )
    );

    checklistSection.items.forEach((item, itemIndex) => {
      const itemStatus = getItemStatus(checklistSection.id, itemIndex, state);
      blocks.push(
        section(
          formatChecklistItemBlock(item, itemStatus),
          statusSelect(
            buildChecklistItemActionId(checklistSection.id, itemIndex),
            itemStatus
          )
        )
      );
    });
  });

  return blocks;
}

function renderPeopleSection(
  onboardingPackage: OnboardingPackage
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
        blocks.push(
          buildPersonCard(
            person,
            `*${formatPersonLabel(person)}*\n_${buildRoleLabel(person)}_\n${person.discussionPoints}${
              person.userGuide
                ? `\n<${person.userGuide.url}|User guide> — ${person.userGuide.summary}`
                : ''
            }`
          )
        );
      });
    }
  );

  return blocks;
}

function renderResourcesSection(
  onboardingPackage: OnboardingPackage,
  state: JourneyState
): KnownBlock[] {
  const blocks: KnownBlock[] = [
    header('Resources'),
    section(
      'Everything you need to get set up, connected, and oriented: the tools to request access to, Slack channels to join, team rituals to show up for, and the docs that matter most.'
    ),
  ];

  blocks.push(divider());
  blocks.push(...renderToolsSubsection(onboardingPackage, state));

  blocks.push(divider());
  blocks.push(...renderSlackSubsection(onboardingPackage));

  blocks.push(divider());
  blocks.push(...renderRitualsSubsection(onboardingPackage));

  blocks.push(divider());
  blocks.push(...renderLibrarySubsection(onboardingPackage));

  return blocks;
}

export function slugifyToolCategory(category: string): string {
  return (
    category
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'category'
  );
}

export function buildToolAccessKey(category: string, toolName: string): string {
  return `${category.toLowerCase()}::${toolName.toLowerCase()}`;
}

function buildToolAccessActionId(category: string, chunkIndex: number): string {
  return `${HOME_TOOL_ACCESS_ACTION_ID}:${slugifyToolCategory(category)}:${chunkIndex}`;
}

function renderToolsSubsection(
  onboardingPackage: OnboardingPackage,
  state: JourneyState
): KnownBlock[] {
  const tools = onboardingPackage.sections.toolsAccess.tools;
  const blocks: KnownBlock[] = [
    header('Tools access', 2),
    section(
      '*Tick each tool off as you gain access.* Most tools live in Okta — ask @Flowbot if anything is missing.'
    ),
  ];

  groupByCategory(tools, 'category').forEach(({category, items}) => {
    blocks.push(header(category, 3));
    chunkList(items, TOOL_CHECKBOX_CHUNK_SIZE).forEach((chunk, chunkIndex) => {
      blocks.push(
        checkboxes(
          buildToolAccessActionId(category, chunkIndex),
          chunk.map((tool) => ({
            label: tool.tool,
            description: formatToolDescription(tool),
            value: buildToolAccessKey(category, tool.tool),
          })),
          chunk
            .map((tool) => buildToolAccessKey(category, tool.tool))
            .filter((key) => state.toolAccess[key] === true)
        )
      );
    });
  });

  return blocks;
}

function formatToolDescription(tool: ToolGuide): string {
  return tool.accessHint
    ? `${tool.description} _Ask: ${tool.accessHint}_`
    : tool.description;
}

function renderSlackSubsection(
  onboardingPackage: OnboardingPackage
): KnownBlock[] {
  const slack = onboardingPackage.sections.slack;
  const blocks: KnownBlock[] = [
    header('Slack channels', 2),
    section(slack.intro),
  ];

  groupByCategory(slack.channels, 'category').forEach(({category, items}) => {
    blocks.push(header(category, 3));
    chunkSlackChannelGuides(items).forEach((chunk) => {
      blocks.push(section(formatSlackChannelChunk(chunk)));
    });
  });

  return blocks;
}

function renderRitualsSubsection(
  onboardingPackage: OnboardingPackage
): KnownBlock[] {
  const rituals = onboardingPackage.sections.rituals;
  const blocks: KnownBlock[] = [header('Rituals', 2), paragraph(rituals.intro)];

  groupByCategory(rituals.rituals, 'category').forEach(({category, items}) => {
    blocks.push(header(category, 3));
    blocks.push(
      richText([
        richTextList(
          'bullet',
          items.map((ritual) => [
            richTextText(ritual.meeting, {bold: true}),
            richTextText(` — ${ritual.description}`),
            richTextText(
              ` (${ritual.cadence}; ${ritual.attendance.toLowerCase()})`,
              {italic: true}
            ),
          ])
        ),
      ])
    );
  });

  return blocks;
}

function renderLibrarySubsection(
  onboardingPackage: OnboardingPackage
): KnownBlock[] {
  const resources = onboardingPackage.sections.engineeringResourceLibrary;
  const blocks: KnownBlock[] = [
    header('Engineering resource library', 2),
    paragraph(resources.intro),
  ];

  if (resources.docs.length > 0) {
    blocks.push(header('Core engineering docs', 3));
    blocks.push(
      richText([
        richTextList(
          'bullet',
          resources.docs.map((doc) => [
            ...(doc.url
              ? [richTextLink(doc.url, doc.title, {bold: true})]
              : [richTextText(doc.title, {bold: true})]),
            richTextText(` — ${doc.description}`),
          ])
        ),
      ])
    );
  }

  const references = [
    resources.references.teamPage,
    resources.references.pillarPage,
    resources.references.newHireGuide,
  ].filter((reference): reference is ConfluenceLink => Boolean(reference));
  if (references.length > 0) {
    blocks.push(header('Team references', 3));
    blocks.push(
      richText([
        richTextList(
          'bullet',
          references.map((reference) => [
            richTextLink(reference.url, reference.title, {bold: true}),
            richTextText(` — ${reference.summary}`),
          ])
        ),
      ])
    );
  } else {
    blocks.push(header('Team references', 3));
    blocks.push(
      paragraph(
        "Ask your manager for a link to the team's Confluence space and the pillar overview page."
      )
    );
  }

  blocks.push(header('Codebase', 3));
  blocks.push(
    section(
      `Explore the monorepo at <${WEBFLOW_REPO_URL}|github.com/webflow/webflow>. Your buddy and manager can point you to the areas that matter most for your team.`
    )
  );

  return blocks;
}

function chunkSlackChannelGuides(
  channels: SlackChannelGuide[],
  size = 8
): SlackChannelGuide[][] {
  return chunkList(channels, size);
}

function chunkList<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function formatSlackChannelChunk(channels: SlackChannelGuide[]): string {
  return channels
    .map((channel) => `• *${channel.channel}* — ${channel.description}`)
    .join('\n');
}

function renderTasksSection(
  onboardingPackage: OnboardingPackage
): KnownBlock[] {
  const tasks = onboardingPackage.sections.initialEngineeringTasks.tasks;
  return [
    header(onboardingPackage.sections.initialEngineeringTasks.title),
    paragraph(onboardingPackage.sections.initialEngineeringTasks.intro),
    header('Manager guidance', 2),
    richText([
      richTextQuote(
        onboardingPackage.sections.initialEngineeringTasks.managerPrompt
      ),
    ]),
    ...(tasks.length > 0
      ? tasks.flatMap((task, index) => [
          ...(index > 0 ? [divider()] : []),
          section(
            `*${task.title}*\n${task.description}\n_Why it works: ${task.rationale}_\nSkill: \`${task.skillCommand}\``
          ),
        ])
      : [
          section(
            'No starter tasks are here yet. Your manager can add one in the draft flow, or Spark can scan for a good first contribution.'
          ),
        ]),
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

function formatChecklistItemBlock(
  item: ChecklistItem,
  status: StatusValue
): string {
  const statusDot = formatChecklistStatusEmoji(status);
  const title = item.resourceUrl
    ? `*<${item.resourceUrl}|${item.label}>*`
    : `*${item.label}*`;
  const notesLine = item.notes ? `\n${item.notes}` : '';
  const typeLine = `\nType: ${formatChecklistKindEmoji(item.kind)} ${formatChecklistKindLabel(
    item.kind
  )}`;

  return `${statusDot} ${title}${notesLine}${typeLine}`;
}

function formatChecklistStatusEmoji(status: StatusValue): string {
  switch (status) {
    case 'not-started':
      return '🔴';
    case 'in-progress':
      return '🟡';
    case 'completed':
      return '🟢';
  }
}

function formatChecklistKindEmoji(kind: ChecklistItem['kind']): string {
  switch (kind) {
    case 'task':
      return '✅';
    case 'live-training':
      return '🗣️';
    case 'workramp':
      return '🚀';
    case 'reading':
      return '📚';
    case 'recording':
      return '🎥';
  }
}

function formatChecklistKindLabel(kind: ChecklistItem['kind']): string {
  switch (kind) {
    case 'task':
      return 'Task';
    case 'live-training':
      return 'Live Training';
    case 'workramp':
      return 'WorkRamp';
    case 'reading':
      return 'Reading Material';
    case 'recording':
      return 'Recording';
  }
}

function buildPersonCard(person: OnboardingPerson, text: string): KnownBlock {
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

function formatPersonLabel(person: OnboardingPerson): string {
  return person.slackUserId ? `<@${person.slackUserId}>` : person.name;
}

function buildRoleLabel(person: OnboardingPerson): string {
  return person.title && person.title !== person.role
    ? `${person.role} · ${person.title}`
    : person.role;
}

function getItemStatus(
  sectionId: string,
  itemIndex: number,
  state: JourneyState
): StatusValue {
  return (
    state.itemStatuses[buildChecklistItemStatusKey(sectionId, itemIndex)] ??
    'not-started'
  );
}

function countChecklistItems(
  checklistSections: OnboardingPackage['sections']['onboardingChecklist']['sections']
): number {
  return checklistSections.reduce(
    (sum, checklistSection) => sum + checklistSection.items.length,
    0
  );
}

function countCompletedChecklistItems(
  checklistSections: OnboardingPackage['sections']['onboardingChecklist']['sections'],
  state: JourneyState
): number {
  return checklistSections.reduce(
    (sum, checklistSection) =>
      sum + countCompletedInSection(checklistSection, state.itemStatuses),
    0
  );
}

function paragraph(text: string): KnownBlock {
  return richText([richTextSection([richTextText(text)])]);
}

function buildInlineLinkElements(
  links: Array<{url: string; label: string}>
): RichTextInlineElement[] {
  return links.flatMap((link, index) => [
    ...(index > 0 ? [richTextText(' · ')] : []),
    richTextLink(link.url, link.label),
  ]);
}

function groupByCategory<T extends {category: string}>(
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
