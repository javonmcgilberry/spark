import type {KnownBlock} from '@slack/types';
import {
  checkboxes,
  divider,
  header,
  richText,
  richTextLink,
  richTextList,
  richTextText,
  section,
} from '../../../slack/blockKit.js';
import type {
  ConfluenceLink,
  JourneyState,
  OnboardingPackage,
  SlackChannelGuide,
  ToolGuide,
} from '../../types.js';
import {
  buildToolAccessActionId,
  buildToolAccessKey,
  TOOL_CHECKBOX_CHUNK_SIZE,
} from '../actionIds.js';
import {chunkList, groupByCategory, paragraph} from '../shared.js';

const WEBFLOW_REPO_URL = 'https://github.com/webflow/webflow';

export function renderResourcesSection(
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
    chunkList(items, 8).forEach((chunk) => {
      blocks.push(section(formatSlackChannelChunk(chunk)));
    });
  });

  return blocks;
}

function formatSlackChannelChunk(channels: SlackChannelGuide[]): string {
  return channels
    .map((channel) => `• *${channel.channel}* — ${channel.description}`)
    .join('\n');
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
