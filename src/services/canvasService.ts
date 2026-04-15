import type {App} from '@slack/bolt';
import type {Logger} from '../app/logger.js';
import {formatCanvasPerson, groupPeopleByWeek} from '../onboarding/display.js';
import type {
  JourneyState,
  OnboardingPerson,
  TeamProfile,
} from '../onboarding/types.js';

interface CanvasCreateResponse {
  ok?: boolean;
  canvas_id?: string;
  error?: string;
}

interface AuthTestResponse {
  ok?: boolean;
  team_id?: string;
  url?: string;
}

interface SlackPlatformError {
  code?: string;
  data?: {
    error?: string;
    needed?: string;
  };
}

export interface CreatedCanvas {
  canvasId: string;
  canvasUrl?: string;
}

export class CanvasService {
  constructor(private readonly logger: Logger) {}

  async createOnboardingCanvas(
    client: App['client'],
    profile: TeamProfile,
    state: JourneyState
  ): Promise<CreatedCanvas | null> {
    try {
      const result = (await client.apiCall('canvases.create', {
        title: `${profile.firstName}'s Spark onboarding`,
        document_content: {
          type: 'markdown',
          markdown: buildCanvasMarkdown(profile, state),
        },
      })) as CanvasCreateResponse;

      if (!result.ok || !result.canvas_id) {
        this.logger.warn(
          `Canvas creation failed${result.error ? `: ${result.error}` : '.'}`
        );
        return null;
      }

      const auth = (await client.auth.test()) as AuthTestResponse;
      return {
        canvasId: result.canvas_id,
        canvasUrl:
          auth.url && auth.team_id
            ? `${ensureTrailingSlash(auth.url)}docs/${auth.team_id}/${result.canvas_id}`
            : undefined,
      };
    } catch (error) {
      if (isMissingScopeError(error, 'canvases:write')) {
        this.logger.info(
          'Canvas creation skipped until the Slack app has the `canvases:write` scope.'
        );
        return null;
      }

      this.logger.warn(
        'Canvas creation failed, continuing without canvas.',
        error
      );
      return null;
    }
  }
}

function buildCanvasMarkdown(
  profile: TeamProfile,
  state: JourneyState
): string {
  const people = [profile.manager, profile.buddy, ...profile.teammates];

  return [
    `# Spark onboarding for ${profile.displayName}`,
    '',
    `Spark pulled this guide together for **${profile.teamName}**${
      profile.pillarName ? ` in **${profile.pillarName}**.` : '.'
    }`,
    '',
    '## Checklist',
    '',
    ...profile.checklist.flatMap((section) => [
      `### ${section.title}`,
      section.goal,
      '',
      ...section.items.flatMap((item) => [
        `- [${state.completedChecklist.includes(item.label) ? 'x' : ' '}] ${item.label}`,
        `  - ${item.notes}`,
      ]),
      '',
    ]),
    '## People to meet',
    '',
    ...renderPeopleByBucket(people),
    '## Docs',
    '',
    ...profile.docs.map((doc) =>
      doc.url
        ? `- [${doc.title}](${doc.url}) — ${doc.description}`
        : `- ${doc.title} — ${doc.description}`
    ),
    ...(profile.confluenceLinks.length > 0
      ? [
          '',
          '## Confluence pages',
          '',
          ...profile.confluenceLinks.map(
            (link) => `- [${link.title}](${link.url}) — ${link.summary}`
          ),
        ]
      : []),
    '',
    '## Channels',
    '',
    ...profile.recommendedChannels.map(
      (channel) => `- **${channel.channel}** — ${channel.description}`
    ),
    '',
    '## Tools',
    '',
    ...profile.tools.map((tool) => `- **${tool.tool}** — ${tool.description}`),
    '',
    '## Rituals',
    '',
    ...profile.rituals.map(
      (ritual) =>
        `- **${ritual.meeting}** — ${ritual.cadence}, ${ritual.attendance.toLowerCase()}`
    ),
    '',
    '## Key repo paths',
    '',
    ...(profile.keyPaths.length > 0
      ? profile.keyPaths.map((path) => `- \`${path}\``)
      : ['- Ask your buddy which CODEOWNERS paths matter most for your team.']),
    '',
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

function isMissingScopeError(
  error: unknown,
  neededScope: string
): error is SlackPlatformError {
  const platformError = error as SlackPlatformError;
  return (
    platformError.code === 'slack_webapi_platform_error' &&
    platformError.data?.error === 'missing_scope' &&
    platformError.data?.needed === neededScope
  );
}
