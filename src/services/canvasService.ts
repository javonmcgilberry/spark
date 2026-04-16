import type {App} from '@slack/bolt';
import type {
  AuthTestResponse,
  CanvasesEditResponse,
  CanvasesSectionsLookupResponse,
  ConversationsCreateResponse,
  ConversationsCanvasesCreateResponse,
  ConversationsInfoResponse,
} from '@slack/web-api';
import type {Logger} from '../app/logger.js';
import {JOURNEY_LABELS} from '../onboarding/catalog.js';
import type {
  JourneyState,
  OnboardingPackage,
  OnboardingPerson,
  TeamProfile,
} from '../onboarding/types.js';
import {buildChecklistItemStatusKey} from '../onboarding/types.js';
import {
  formatCanvasChecklistItem,
  formatCanvasChecklistResourceLink,
  formatCanvasPerson,
  groupPeopleByWeek,
  linkedChecklistItemsForMilestone,
} from '../onboarding/display.js';
import {
  hasSlackErrorCode,
  isMissingScopeError,
} from '../slack/platformError.js';

type ConversationsInfoWithCanvasResponse = ConversationsInfoResponse & {
  channel?: {
    properties?: {canvas?: {canvas_id?: string}};
  };
};

export interface DraftWorkspace {
  channelId: string;
  channelName: string;
  canvasId?: string;
  canvasUrl?: string;
}

export class CanvasService {
  constructor(private readonly logger: Logger) {}

  async createDraftWorkspace(
    client: App['client'],
    pkg: OnboardingPackage,
    profile: TeamProfile
  ): Promise<DraftWorkspace | null> {
    try {
      const channelName = buildDraftChannelName(profile);
      this.logger.info(
        `Creating Spark draft channel for ${profile.userId} (${channelName})`
      );
      const channel: ConversationsCreateResponse =
        await client.conversations.create({
          name: channelName,
          is_private: true,
        });

      if (!channel.channel?.id || !channel.channel.name) {
        this.logger.warn(
          `Draft channel creation failed${channel.error ? `: ${channel.error}` : '.'}`
        );
        return null;
      }

      if (pkg.reviewerUserIds.length > 0) {
        await client.conversations.invite({
          channel: channel.channel.id,
          users: pkg.reviewerUserIds.join(','),
        });
      }

      const canvas = await this.createChannelCanvas(
        client,
        channel.channel.id,
        `${profile.firstName}'s onboarding workspace`,
        buildDraftCanvasMarkdown(pkg, profile)
      );

      return {
        channelId: channel.channel.id,
        channelName: channel.channel.name,
        canvasId: canvas?.canvasId,
        canvasUrl: canvas?.canvasUrl,
      };
    } catch (error) {
      if (isMissingScopeError(error, 'canvases:write')) {
        this.logger.info(
          'Draft channel canvas creation skipped until the Slack app has the `canvases:write` scope.'
        );
        return null;
      }

      this.logger.warn(
        'Draft workspace creation failed, continuing without a collaborative draft channel.',
        error
      );
      return null;
    }
  }

  async publishWorkspace(
    client: App['client'],
    pkg: OnboardingPackage,
    profile: TeamProfile,
    state: JourneyState
  ): Promise<void> {
    if (pkg.draftChannelId) {
      await this.inviteUserToWorkspace(client, pkg.draftChannelId, pkg.userId);
    }
    if (!pkg.draftCanvasId) {
      return;
    }

    try {
      await this.replaceManagedSection(
        client,
        pkg.draftCanvasId,
        'Workspace status',
        buildPublishedWorkspaceStatusMarkdown(pkg, profile)
      );
      await this.syncSharedProgress(client, pkg, state);
    } catch (error) {
      if (
        isMissingScopeError(error, 'canvases:write') ||
        isMissingScopeError(error, 'canvases:read')
      ) {
        this.logger.info(
          'Shared onboarding workspace sync skipped until the Slack app has the required canvases scopes.'
        );
        return;
      }

      this.logger.warn(
        `Failed to publish shared onboarding workspace for ${pkg.userId}.`,
        error
      );
    }
  }

  async syncDraftWorkspace(
    client: App['client'],
    pkg: OnboardingPackage,
    profile: TeamProfile
  ): Promise<void> {
    if (!pkg.draftCanvasId) {
      return;
    }

    try {
      for (const managedSection of buildDraftManagedSections(pkg, profile)) {
        await this.replaceManagedSection(
          client,
          pkg.draftCanvasId,
          managedSection.title,
          managedSection.markdown
        );
      }
    } catch (error) {
      if (
        isMissingScopeError(error, 'canvases:write') ||
        isMissingScopeError(error, 'canvases:read')
      ) {
        this.logger.info(
          'Draft onboarding workspace sync skipped until the Slack app has the required canvases scopes.'
        );
        return;
      }

      this.logger.warn(
        `Failed to sync draft onboarding workspace for ${pkg.userId}.`,
        error
      );
    }
  }

  async syncDraftWorkspaceMembers(
    client: App['client'],
    pkg: OnboardingPackage
  ): Promise<void> {
    if (!pkg.draftChannelId) {
      return;
    }

    for (const userId of pkg.reviewerUserIds) {
      await this.inviteUserToWorkspace(client, pkg.draftChannelId, userId);
    }
  }

  async syncSharedProgress(
    client: App['client'],
    pkg: OnboardingPackage,
    state: JourneyState
  ): Promise<void> {
    if (!pkg.draftCanvasId) {
      return;
    }

    try {
      await this.replaceManagedSection(
        client,
        pkg.draftCanvasId,
        'Progress sync',
        buildSharedProgressMarkdown(pkg, state)
      );
    } catch (error) {
      if (
        isMissingScopeError(error, 'canvases:write') ||
        isMissingScopeError(error, 'canvases:read')
      ) {
        this.logger.info(
          'Shared onboarding progress sync skipped until the Slack app has the required canvases scopes.'
        );
        return;
      }

      this.logger.warn(
        `Failed to sync onboarding progress canvas for ${pkg.userId}.`,
        error
      );
    }
  }

  private async createChannelCanvas(
    client: App['client'],
    channelId: string,
    title: string,
    markdown: string
  ): Promise<{canvasId: string; canvasUrl?: string} | null> {
    try {
      const result: ConversationsCanvasesCreateResponse =
        await client.conversations.canvases.create({
          channel_id: channelId,
          title,
          document_content: {
            type: 'markdown',
            markdown,
          },
        });

      if (!result.ok || !result.canvas_id) {
        this.logger.warn(
          `Canvas creation failed${result.error ? `: ${result.error}` : '.'}`
        );
        return null;
      }

      const auth: AuthTestResponse = await client.auth.test();
      return {
        canvasId: result.canvas_id,
        canvasUrl: buildCanvasUrl(auth, result.canvas_id),
      };
    } catch (error) {
      if (hasSlackErrorCode(error, 'channel_canvas_already_exists')) {
        const info: ConversationsInfoWithCanvasResponse =
          await client.conversations.info({
            channel: channelId,
          });
        const canvasId = info.channel?.properties?.canvas?.canvas_id;
        if (!canvasId) {
          return null;
        }

        const auth: AuthTestResponse = await client.auth.test();
        return {
          canvasId,
          canvasUrl: buildCanvasUrl(auth, canvasId),
        };
      }

      this.logger.warn(
        'Canvas creation failed, continuing without canvas.',
        error
      );
      return null;
    }
  }

  private async replaceManagedSection(
    client: App['client'],
    canvasId: string,
    sectionTitle: string,
    markdown: string
  ): Promise<void> {
    const sectionId = await this.lookupSectionId(
      client,
      canvasId,
      sectionTitle
    );
    const documentContent = {
      type: 'markdown' as const,
      markdown,
    };
    const change = sectionId
      ? {
          operation: 'replace' as const,
          section_id: sectionId,
          document_content: documentContent,
        }
      : {
          operation: 'insert_at_start' as const,
          document_content: documentContent,
        };
    const result: CanvasesEditResponse = await client.canvases.edit({
      canvas_id: canvasId,
      changes: [change],
    });

    if (!result.ok) {
      throw new Error(result.error || 'Canvas edit failed');
    }
  }

  private async lookupSectionId(
    client: App['client'],
    canvasId: string,
    sectionTitle: string
  ): Promise<string | undefined> {
    const result: CanvasesSectionsLookupResponse =
      await client.canvases.sections.lookup({
        canvas_id: canvasId,
        criteria: {
          section_types: ['h2'],
          contains_text: sectionTitle,
        },
      });

    if (!result.ok) {
      throw new Error(result.error || 'Canvas section lookup failed');
    }

    return result.sections?.[0]?.id;
  }

  private async inviteUserToWorkspace(
    client: App['client'],
    channelId: string,
    userId: string
  ): Promise<void> {
    try {
      await client.conversations.invite({
        channel: channelId,
        users: userId,
      });
    } catch (error) {
      if (hasSlackErrorCode(error, 'already_in_channel')) {
        return;
      }
      this.logger.warn(
        `Failed to invite ${userId} into shared onboarding workspace ${channelId}.`,
        error
      );
    }
  }
}

function buildDraftCanvasMarkdown(
  pkg: OnboardingPackage,
  profile: TeamProfile
): string {
  return buildDraftManagedSections(pkg, profile)
    .map((section) => section.markdown)
    .join('\n\n');
}

function buildDraftManagedSections(
  pkg: OnboardingPackage,
  profile: TeamProfile
): Array<{title: string; markdown: string}> {
  return [
    {
      title: `Onboarding workspace for ${profile.displayName}`,
      markdown: buildWorkspaceIntroMarkdown(profile),
    },
    {
      title: 'Workspace status',
      markdown: buildDraftWorkspaceStatusMarkdown(),
    },
    {
      title: 'Progress sync',
      markdown: buildDraftProgressMarkdown(),
    },
    {
      title: 'Team setup notes',
      markdown: buildTeamSetupNotesMarkdown(),
    },
    {
      title: 'Welcome',
      markdown: buildWelcomeCanvasMarkdown(pkg),
    },
    {
      title: 'Onboarding Checklist',
      markdown: buildChecklistCanvasMarkdown(
        pkg.sections.onboardingChecklist.sections
      ),
    },
    {
      title: 'Onboarding journey',
      markdown: buildJourneyCanvasMarkdown(
        pkg.sections.onboardingChecklist.sections,
        pkg.sections.welcome.journeyMilestones
      ),
    },
    {
      title: 'People to Meet',
      markdown: buildPeopleCanvasMarkdown(pkg.sections.peopleToMeet.people),
    },
    {
      title: 'Tools Access Checklist',
      markdown: buildToolsCanvasMarkdown(pkg.sections.toolsAccess.tools),
    },
    {
      title: 'Slack',
      markdown: buildSlackCanvasMarkdown(pkg.sections.slack.channels),
    },
    {
      title: 'Initial Engineering Tasks',
      markdown: buildInitialTasksCanvasMarkdown(pkg),
    },
    {
      title: 'Rituals',
      markdown: buildRitualsCanvasMarkdown(pkg.sections.rituals.rituals),
    },
    {
      title: 'Engineering Resource Library',
      markdown: buildResourceLibraryCanvasMarkdown(
        pkg.sections.engineeringResourceLibrary
      ),
    },
  ];
}

function buildWorkspaceIntroMarkdown(profile: TeamProfile): string {
  return [
    `# Onboarding workspace for ${profile.displayName}`,
    '',
    `Built for **${profile.teamName}**${
      profile.pillarName ? ` in **${profile.pillarName}**.` : '.'
    }`,
  ].join('\n');
}

function buildTeamSetupNotesMarkdown(): string {
  return [
    '## Team setup notes',
    '',
    '- Use the draft review buttons in Slack to update the welcome note, onboarding buddy, reviewers, and publish status.',
    '- Use this canvas for team-specific notes, links, and longer context you want everyone to keep close after publish.',
  ].join('\n');
}

function buildWelcomeCanvasMarkdown(pkg: OnboardingPackage): string {
  return [
    '## Welcome',
    '',
    pkg.sections.welcome.intro,
    ...(pkg.sections.welcome.personalizedNote
      ? ['', `> ${pkg.sections.welcome.personalizedNote}`]
      : []),
  ].join('\n');
}

function buildChecklistCanvasMarkdown(
  checklist: OnboardingPackage['sections']['onboardingChecklist']['sections']
): string {
  return [
    '## Onboarding Checklist',
    '',
    ...checklist.flatMap((section) => [
      `### ${section.title}`,
      section.goal,
      '',
      ...section.items.flatMap((item) => formatCanvasChecklistItem(item)),
      '',
    ]),
  ].join('\n');
}

function buildJourneyCanvasMarkdown(
  checklist: OnboardingPackage['sections']['onboardingChecklist']['sections'],
  milestones: OnboardingPackage['sections']['welcome']['journeyMilestones']
): string {
  return [
    '## Onboarding journey',
    '',
    ...milestones.flatMap((milestone) => {
      const links = linkedChecklistItemsForMilestone(
        checklist,
        milestone.label
      );
      return [
        `### ${milestone.label}`,
        `- New hire focus: ${milestone.keyActivities}`,
        `- Manager / buddy support: ${milestone.supportActions}`,
        ...(links.length > 0
          ? [
              `- Key links: ${links
                .map(formatCanvasChecklistResourceLink)
                .join(', ')}`,
            ]
          : []),
        '',
      ];
    }),
  ].join('\n');
}

function buildPeopleCanvasMarkdown(people: OnboardingPerson[]): string {
  return ['## People to Meet', '', ...renderPeopleByBucket(people)].join('\n');
}

function buildToolsCanvasMarkdown(
  tools: OnboardingPackage['sections']['toolsAccess']['tools']
): string {
  return [
    '## Tools Access Checklist',
    '',
    ...tools.map((tool) => `- [ ] **${tool.tool}** — ${tool.description}`),
  ].join('\n');
}

function buildSlackCanvasMarkdown(
  channels: OnboardingPackage['sections']['slack']['channels']
): string {
  return [
    '## Slack',
    '',
    ...channels.map(
      (channel) => `- **${channel.channel}** — ${channel.description}`
    ),
  ].join('\n');
}

function buildInitialTasksCanvasMarkdown(pkg: OnboardingPackage): string {
  const tasks = pkg.sections.initialEngineeringTasks.tasks;
  return [
    '## Initial Engineering Tasks',
    '',
    pkg.sections.initialEngineeringTasks.managerPrompt,
    ...(tasks.length > 0
      ? [
          '',
          ...tasks.flatMap((task) => [
            `- **${task.title}** — ${task.description}`,
            `  - Why it works well for ramp-up: ${task.rationale}`,
          ]),
        ]
      : ['', '- Add or confirm a few scoped Jira tickets before publishing.']),
  ].join('\n');
}

function buildRitualsCanvasMarkdown(
  rituals: OnboardingPackage['sections']['rituals']['rituals']
): string {
  return [
    '## Rituals',
    '',
    ...rituals.map(
      (ritual) =>
        `- **${ritual.meeting}** — ${ritual.cadence}, ${ritual.attendance.toLowerCase()}`
    ),
  ].join('\n');
}

function buildResourceLibraryCanvasMarkdown(
  resources: OnboardingPackage['sections']['engineeringResourceLibrary']
): string {
  return [
    '## Engineering Resource Library',
    '',
    ...resources.docs.map((doc) =>
      doc.url
        ? `- [${doc.title}](${doc.url}) — ${doc.description}`
        : `- ${doc.title} — ${doc.description}`
    ),
    ...(resources.references.teamPage
      ? [
          '',
          `- [${resources.references.teamPage.title}](${resources.references.teamPage.url}) — ${resources.references.teamPage.summary}`,
        ]
      : []),
    ...(resources.references.pillarPage
      ? [
          `- [${resources.references.pillarPage.title}](${resources.references.pillarPage.url}) — ${resources.references.pillarPage.summary}`,
        ]
      : []),
    ...(resources.references.newHireGuide
      ? [
          `- [${resources.references.newHireGuide.title}](${resources.references.newHireGuide.url}) — ${resources.references.newHireGuide.summary}`,
        ]
      : []),
    '',
    '## Key repo paths',
    '',
    ...(resources.keyPaths.length > 0
      ? resources.keyPaths.map((path) => `- \`${path}\``)
      : ['- Ask your buddy which CODEOWNERS paths matter most for your team.']),
  ].join('\n');
}

function renderPeopleByBucket(people: OnboardingPerson[]): string[] {
  const lines: string[] = [];
  for (const bucket of groupPeopleByWeek(people)) {
    lines.push(`### ${bucket.label}`, '');
    for (const person of bucket.people) {
      lines.push(
        `- **${formatCanvasPerson(person)}** — ${person.role}. ${person.discussionPoints}`
      );
    }
    lines.push('');
  }

  return lines;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

function buildDraftWorkspaceStatusMarkdown(): string {
  return [
    '## Workspace status',
    '',
    'This canvas starts as the team onboarding workspace before it is shared with the new hire.',
    '- Review the package in Slack before you publish it.',
    '- Keep team-specific notes, links, and longer context in the sections below.',
    '- After publish, the progress sync section stays current for the manager, onboarding buddy, and new hire.',
  ].join('\n');
}

function buildDraftProgressMarkdown(): string {
  return [
    '## Progress sync',
    '',
    'This section updates automatically after publish, so the manager, onboarding buddy, and new hire can stay aligned in one place.',
    '- Status: Draft review',
    '- Checklist progress: Not started yet',
    '- Onboarding journey: Starts after publish',
    '- Current ramp task: Confirm a starter task before you publish',
  ].join('\n');
}

function buildPublishedWorkspaceStatusMarkdown(
  pkg: OnboardingPackage,
  profile: TeamProfile
): string {
  return [
    '## Workspace status',
    '',
    'This is the shared onboarding workspace for the new hire, manager, and onboarding buddy.',
    `- New hire: ${formatCanvasUser(pkg.userId, profile.displayName)}`,
    `- Manager: ${formatCanvasUser(pkg.managerUserId, profile.manager.name)}`,
    ...(pkg.buddyUserId
      ? [
          `- Onboarding buddy: ${formatCanvasUser(pkg.buddyUserId, profile.buddy.name)}`,
        ]
      : []),
    '- The progress sync section stays current as the new hire updates Home and moves through the guided flow.',
    '- Keep any team-specific notes, edits, or follow-up details in the sections below.',
  ].join('\n');
}

function buildSharedProgressMarkdown(
  pkg: OnboardingPackage,
  state: JourneyState
): string {
  const checklistSections = pkg.sections.onboardingChecklist.sections;
  const notStarted: string[] = [];
  const inProgress: string[] = [];
  const done: string[] = [];

  for (const section of checklistSections) {
    const sectionStatuses = section.items.map(
      (_, itemIndex) =>
        state.itemStatuses[
          buildChecklistItemStatusKey(section.id, itemIndex)
        ] ?? 'not-started'
    );
    const completedCount = sectionStatuses.filter(
      (status) => status === 'completed'
    ).length;
    const line = `- ${section.title} (${completedCount}/${section.items.length})`;
    if (
      completedCount === 0 &&
      sectionStatuses.every((status) => status === 'not-started')
    ) {
      notStarted.push(line);
      continue;
    }
    if (completedCount === section.items.length) {
      done.push(line);
      continue;
    }
    inProgress.push(line);
  }

  const totalChecklistItems = checklistSections.reduce(
    (sum, section) => sum + section.items.length,
    0
  );
  const completedChecklistItems = checklistSections.reduce(
    (sum, section) =>
      sum +
      section.items.filter(
        (_, itemIndex) =>
          state.itemStatuses[
            buildChecklistItemStatusKey(section.id, itemIndex)
          ] === 'completed'
      ).length,
    0
  );
  const tasks = pkg.sections.initialEngineeringTasks.tasks;
  const selectedTask = tasks.find((task) => task.id === state.selectedTaskId);
  const progressStart = pkg.publishedAt ?? state.startedAt;
  const daysSinceStart = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(progressStart)) / 86400000)
  );

  return [
    '## Progress sync',
    '',
    'This section updates automatically from Home activity and guided onboarding progress.',
    `- Current guided step: ${JOURNEY_LABELS[state.currentStep] ?? state.currentStep}`,
    `- Checklist progress: ${completedChecklistItems}/${totalChecklistItems}`,
    `- Last synced: ${formatTimestamp(state.updatedAt)}`,
    ...(pkg.publishedByUserId
      ? [
          `- Published by: ${formatCanvasUser(pkg.publishedByUserId, 'manager')}`,
        ]
      : []),
    '',
    '### Not started',
    '',
    ...(notStarted.length > 0 ? notStarted : ['- None']),
    '',
    '### In progress',
    '',
    ...(inProgress.length > 0 ? inProgress : ['- None']),
    '',
    '### Done',
    '',
    ...(done.length > 0 ? done : ['- None yet']),
    '',
    '### Onboarding journey',
    '',
    ...pkg.sections.welcome.journeyMilestones.map(
      (milestone) =>
        `- ${milestone.label}: ${milestoneStatus(milestone.label, daysSinceStart)} — ${milestone.keyActivities}`
    ),
    '',
    '### Current ramp tasks',
    '',
    ...(tasks.length > 0
      ? tasks.map(
          (task) =>
            `- ${task.title}${
              selectedTask?.id === task.id ? ' (selected starter task)' : ''
            } — ${task.description}`
        )
      : ['- No starter task has been added yet.']),
  ].join('\n');
}

function milestoneStatus(timeframe: string, daysSinceStart: number): string {
  const normalized = timeframe.toLowerCase();
  if (normalized.includes('30')) {
    return daysSinceStart >= 30 ? 'Complete' : 'Current';
  }
  if (normalized.includes('60')) {
    if (daysSinceStart >= 60) {
      return 'Complete';
    }
    return daysSinceStart >= 30 ? 'Current' : 'Up next';
  }
  if (normalized.includes('90')) {
    if (daysSinceStart >= 90) {
      return 'Complete';
    }
    return daysSinceStart >= 60 ? 'Current' : 'Up next';
  }
  return 'Planned';
}

function formatCanvasUser(
  userId: string | undefined,
  fallback: string
): string {
  return userId ? `![](@${userId})` : fallback;
}

function formatTimestamp(value: string): string {
  return new Date(value).toISOString().replace('T', ' ').slice(0, 16);
}

function buildCanvasUrl(
  auth: AuthTestResponse,
  canvasId: string
): string | undefined {
  return auth.url && auth.team_id
    ? `${ensureTrailingSlash(auth.url)}docs/${auth.team_id}/${canvasId}`
    : undefined;
}

function buildDraftChannelName(profile: TeamProfile): string {
  const slug = profile.displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `spark-${slug || 'new-hire'}-${profile.userId.toLowerCase().slice(-6)}`;
}
