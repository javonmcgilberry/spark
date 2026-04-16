import Anthropic from '@anthropic-ai/sdk';
import type {
  ContentBlock,
  MessageParam,
  ToolUnion,
  ToolUseBlock,
} from '@anthropic-ai/sdk/resources/messages/messages.mjs';
import type {Logger} from '../app/logger.js';
import {APP_NAME} from '../config/constants.js';
import {
  buildDefaultChannels,
  buildDefaultRituals,
  buildDefaultTools,
} from '../onboarding/catalog.js';
import {
  USER_GUIDE_SECTION_IDS,
  USER_GUIDE_SECTIONS,
  isUserGuideSectionId,
  type UserGuideSectionId,
} from '../onboarding/userGuide.js';
import type {OnboardingStage} from '../onboarding/weeklyAgenda.js';
import type {
  ContributionTask,
  OnboardingPackage,
  OnboardingPerson,
  TeamProfile,
} from '../onboarding/types.js';
import {
  inferGithubUsername,
  type GitHubPullRequest,
  type GitHubService,
} from './githubService.js';
import type {JiraService, JiraIssue} from './jiraService.js';
import type {OnboardingPackageService} from './onboardingPackageService.js';

const DEFAULT_MODEL = 'claude-3-5-sonnet-latest';
const DEFAULT_MAX_TOKENS = 700;
const MAX_AGENT_STEPS = 6;

export interface SuggestedPrompt {
  title: string;
  message: string;
}

export interface ConversationHistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface UserGuideProgress {
  answered: UserGuideSectionId[];
  remaining: UserGuideSectionId[];
  completedAt?: string;
}

export interface AnswerUserInput {
  question: string;
  profile: TeamProfile;
  history?: ConversationHistoryTurn[];
  onboardingStage?: OnboardingStage;
  /**
   * Slack channel names (lowercased, no `#` prefix) the user has already
   * joined. When provided, the list_slack_channels tool annotates each
   * channel with a `joined` flag so the agent can strike through channels
   * the user is already in.
   */
  joinedSlackChannels?: Set<string>;
  /**
   * Current progress in the User Guide intake. When provided, the agent
   * is nudged to continue the intake (one remaining section at a time)
   * via the save_user_guide_answer and finalize_user_guide tools.
   */
  userGuideProgress?: UserGuideProgress;
}

export interface AnswerUserResult {
  text: string;
  suggestedPrompts: SuggestedPrompt[] | null;
}

/**
 * Minimal contract the LLM tools use to persist user-guide intake
 * answers. A narrow interface keeps `LlmService` decoupled from
 * `JourneyService` so we don't introduce a circular import.
 */
export interface UserGuideIntakeSink {
  saveAnswer(
    userId: string,
    sectionId: UserGuideSectionId,
    answer: string
  ): void;
  finalize(profile: TeamProfile): {
    markdown: string;
    missing: UserGuideSectionId[];
  };
}

export interface LlmAgentToolkit {
  github?: GitHubService;
  jira?: JiraService;
  onboardingPackages?: OnboardingPackageService;
  userGuideIntake?: UserGuideIntakeSink;
}

export class LlmService {
  private readonly client: Anthropic | null;
  private readonly github?: GitHubService;
  private readonly jira?: JiraService;
  private readonly onboardingPackages?: OnboardingPackageService;
  private userGuideIntake?: UserGuideIntakeSink;

  constructor(
    apiKey: string | undefined,
    private readonly logger: Logger,
    private readonly model: string = DEFAULT_MODEL,
    toolkit: LlmAgentToolkit = {}
  ) {
    this.client = apiKey ? new Anthropic({apiKey}) : null;
    this.github = toolkit.github;
    this.jira = toolkit.jira;
    this.onboardingPackages = toolkit.onboardingPackages;
    this.userGuideIntake = toolkit.userGuideIntake;
  }

  /**
   * Late-bind the User Guide intake sink. `JourneyService` depends on
   * `LlmService` at construction, so the sink (which wraps Journey) can
   * only be supplied after both are built.
   */
  setUserGuideIntake(sink: UserGuideIntakeSink): void {
    this.userGuideIntake = sink;
  }

  async answerUser(input: AnswerUserInput): Promise<AnswerUserResult> {
    const sanitizedQuestion = sanitizeForLlm(input.question);
    if (!this.client) {
      this.logger.warn(
        'LLM answerUser: Anthropic client not configured (ANTHROPIC_API_KEY missing). Returning fallback.'
      );
      return {text: FALLBACK_UNREACHABLE, suggestedPrompts: null};
    }
    if (!sanitizedQuestion) {
      this.logger.warn(
        'LLM answerUser: question was empty after sanitization. Returning fallback.'
      );
      return {text: FALLBACK_UNREACHABLE, suggestedPrompts: null};
    }

    try {
      return await this.runAgentLoop(input, sanitizedQuestion);
    } catch (error) {
      this.logger.warn(
        `LLM answerUser: agent loop threw (${describeError(error)}). Returning fallback.`,
        error
      );
      return {text: FALLBACK_UNREACHABLE, suggestedPrompts: null};
    }
  }

  async explainTasks(
    profile: TeamProfile,
    tasks: ContributionTask[]
  ): Promise<string> {
    if (!this.client || tasks.length === 0) {
      return `I found ${tasks.length} scoped contribution option${
        tasks.length === 1 ? '' : 's'
      } in your area. Each one is small on purpose, so you can learn the review flow without getting buried in project-sized work.`;
    }

    const taskSummary = tasks
      .map(
        (task, index) =>
          `${index + 1}. ${task.title} | ${task.type} | ${task.difficulty} | ${task.rationale}`
      )
      .join('\n');

    return this.generateText(
      [
        `You are ${APP_NAME}, an onboarding companion for Webflow engineers.`,
        'Write a short intro before a list of contribution tasks.',
        'Explain why these tasks are good onboarding tasks for a new hire.',
        'Use 2 sentences max.',
        `Role track: ${profile.roleTrack}`,
      ].join('\n'),
      `Tasks:\n${taskSummary}`
    ).catch(
      () =>
        'I picked these because they are real work with a small blast radius, which makes them good first contributions while you get comfortable in the repo.'
    );
  }

  async draftPullRequestBody(task: ContributionTask): Promise<string> {
    if (!this.client) {
      return [
        '## Summary',
        `- ${task.title}`,
        `- ${task.description}`,
        '',
        '## Why this change',
        `- ${task.suggestedPurpose}`,
        '',
        '## Post-Deploy Monitoring & Validation',
        '- No additional operational monitoring required: onboarding contribution cleanup task.',
      ].join('\n');
    }

    const taskContext = [
      `Task: ${task.title}`,
      `Type: ${task.type}`,
      `Description: ${task.description}`,
      `Purpose: ${task.suggestedPurpose}`,
      `Files: ${task.filePaths.join(', ')}`,
    ].join('\n');

    return this.generateText(
      [
        'You are writing a GitHub PR body for a small engineering cleanup task.',
        'Return markdown with sections: Summary, Why this change, Post-Deploy Monitoring & Validation.',
        'If there is no runtime impact, explicitly say so in the monitoring section.',
      ].join('\n'),
      taskContext
    );
  }

  async writePersonBlurb(input: {
    person: OnboardingPerson;
    teamName: string;
    tickets: JiraIssue[];
    prs: GitHubPullRequest[];
  }): Promise<string | null> {
    if (!this.client) {
      return null;
    }

    const person = input.person;
    const ticketLines = input.tickets
      .slice(0, 5)
      .map((ticket) => `- ${ticket.key}: ${ticket.summary} (${ticket.status})`);
    const prLines = input.prs
      .slice(0, 5)
      .map((pr) => `- #${pr.number} ${pr.title}`);

    const contextLines = [
      `Person: ${person.name}`,
      `Role: ${person.role}${person.title ? ` (${person.title})` : ''}`,
      `Team: ${input.teamName}`,
      person.discussionPoints
        ? `Existing notes: ${person.discussionPoints}`
        : null,
      ticketLines.length > 0
        ? `Recent Jira tickets:\n${ticketLines.join('\n')}`
        : null,
      prLines.length > 0 ? `Recent GitHub PRs:\n${prLines.join('\n')}` : null,
    ].filter((line): line is string => Boolean(line));

    const systemPrompt = [
      `You are ${APP_NAME}, writing a warm, conversational one-liner about a person a new hire should meet.`,
      'Start the sentence with "Ask me about" (or a close equivalent) and keep it to 1-2 sentences.',
      'Weave in any recent Jira tickets or GitHub PRs when present to make it concrete and current.',
      'If no live data is available, lean on their role and team to write something specific and inviting.',
      'Do not mention Jira or GitHub by name. Do not list ticket keys or PR numbers inline; pick the theme.',
      'Never invent work that is not in the provided data.',
    ].join('\n');

    try {
      const text = await this.generateText(
        systemPrompt,
        contextLines.join('\n')
      );
      return text || null;
    } catch (error) {
      this.logger.warn('LLM writePersonBlurb failed.', error);
      return null;
    }
  }

  private async runAgentLoop(
    input: AnswerUserInput,
    sanitizedQuestion: string
  ): Promise<AnswerUserResult> {
    if (!this.client) {
      throw new Error('Anthropic client unavailable');
    }

    const tools = this.buildTools();
    const systemPrompt = this.buildSystemPrompt(input);

    const messages: MessageParam[] = [
      ...mapHistoryToMessages(input.history ?? []),
      {role: 'user', content: sanitizedQuestion},
    ];

    let capturedPrompts: SuggestedPrompt[] | null = null;
    // Claude can emit text AND tool_use in the same turn; we need to keep
    // text from every intermediate turn so it isn't lost when stop_reason
    // is 'tool_use' on a turn that also included user-visible text.
    const textChunks: string[] = [];

    for (let step = 0; step < MAX_AGENT_STEPS; step += 1) {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: DEFAULT_MAX_TOKENS,
        system: systemPrompt,
        messages,
        tools,
      });

      const turnText = extractText(response.content);
      if (turnText) {
        textChunks.push(turnText);
      }

      if (response.stop_reason !== 'tool_use') {
        const text = textChunks.join('\n\n').trim();
        if (!text) {
          this.logger.warn(
            `LLM agent loop returned empty text (stop_reason=${response.stop_reason}, step=${step}). Returning fallback.`
          );
          return {
            text: FALLBACK_UNREACHABLE,
            suggestedPrompts: capturedPrompts,
          };
        }
        return {text, suggestedPrompts: capturedPrompts};
      }

      const toolUses = response.content.filter(
        (block): block is ToolUseBlock => block.type === 'tool_use'
      );

      messages.push({role: 'assistant', content: response.content});

      const toolResults = await Promise.all(
        toolUses.map(async (toolUse) => {
          if (toolUse.name === 'set_suggested_prompts') {
            capturedPrompts = extractSuggestedPrompts(toolUse);
            return {
              type: 'tool_result' as const,
              tool_use_id: toolUse.id,
              content: 'ok',
            };
          }

          return {
            type: 'tool_result' as const,
            tool_use_id: toolUse.id,
            content: await this.runCatalogOrSearchTool(toolUse, input),
          };
        })
      );

      messages.push({role: 'user', content: toolResults});
    }

    this.logger.warn(
      `LLM agent loop exceeded max steps (${MAX_AGENT_STEPS}); returning accumulated text or fallback.`
    );
    const text = textChunks.join('\n\n').trim();
    return {
      text: text || FALLBACK_UNREACHABLE,
      suggestedPrompts: capturedPrompts,
    };
  }

  private buildTools(): ToolUnion[] {
    const tools: ToolUnion[] = [
      {
        name: 'list_slack_channels',
        description:
          'Return the catalog of recommended Slack channels grouped by category. ' +
          'When the host knows which channels the user has already joined, each channel includes `joined: true|false` and the result includes a `joinedCount` summary. ' +
          'When recommending, emphasize channels the user has NOT joined yet and strike through ones they already have (`~#channel~`). Always available.',
        input_schema: {type: 'object', properties: {}},
      },
      {
        name: 'list_tools',
        description:
          'Return the catalog of internal tools the new hire should request access to, grouped by category. Always available.',
        input_schema: {type: 'object', properties: {}},
      },
      {
        name: 'list_rituals',
        description:
          'Return the catalog of engineering and company rituals grouped by category. Always available.',
        input_schema: {type: 'object', properties: {}},
      },
      {
        name: 'list_checklist',
        description:
          "Return the user's week-by-week onboarding checklist with item status. Returns empty weeks when the user has no published plan yet.",
        input_schema: {type: 'object', properties: {}},
      },
      {
        name: 'list_people_to_meet',
        description:
          'Return the people the new hire should meet, grouped by week bucket. Returns empty when the user has no published plan yet.',
        input_schema: {type: 'object', properties: {}},
      },
      {
        name: 'set_suggested_prompts',
        description:
          'Set the follow-up prompt pills under the assistant reply. ' +
          'Call this at most once per turn with up to 4 context-relevant prompts. ' +
          'Prefer action-oriented pills that only you can perform (quizzing, drafting, correlating data, personalizing). ' +
          'Do NOT suggest pills that just restate content the user could already read in their Home tab (e.g. "show my checklist", "list my tools"). ' +
          'Result is not fed back to you.',
        input_schema: {
          type: 'object',
          properties: {
            prompts: {
              type: 'array',
              maxItems: 4,
              items: {
                type: 'object',
                properties: {
                  title: {
                    type: 'string',
                    description:
                      'Pill label shown to the user, under 24 characters.',
                  },
                  message: {
                    type: 'string',
                    description:
                      'Full prompt that is sent if the user clicks the pill.',
                  },
                },
                required: ['title', 'message'],
              },
            },
          },
          required: ['prompts'],
        },
      },
    ];

    if (this.jira?.isConfigured()) {
      tools.push({
        name: 'search_jira',
        description:
          'Search Jira for tickets. Use when the user asks about their work, tickets, sprint, or mentions a Jira key like ABC-123.',
        input_schema: {
          type: 'object',
          properties: {
            mode: {
              type: 'string',
              enum: ['assigned_to_me', 'by_key', 'free_text'],
              description:
                "assigned_to_me for the user's open tickets, by_key for a specific ticket, free_text for searching by keyword.",
            },
            query: {
              type: 'string',
              description:
                'Issue key (for by_key mode) or free text (for free_text mode). Ignored for assigned_to_me.',
            },
          },
          required: ['mode'],
        },
      });
    }

    if (this.github?.isConfigured()) {
      tools.push({
        name: 'search_github_prs',
        description:
          "Find pull requests in github.com/webflow. Use when the user asks about PRs they authored, PRs awaiting their review, or their team's PRs.",
        input_schema: {
          type: 'object',
          properties: {
            mode: {
              type: 'string',
              enum: ['mine', 'review', 'team'],
              description:
                'mine for PRs the user authored, review for PRs awaiting their review, team for PRs pending their team.',
            },
          },
          required: ['mode'],
        },
      });
    }

    if (this.userGuideIntake) {
      tools.push({
        name: 'save_user_guide_answer',
        description:
          "Persist the user's answer for one section of their Webflow User Guide. " +
          'Call this silently after they answer a section during the intake. ' +
          'Use the raw words the user gave you; do not paraphrase or "improve" their answer.',
        input_schema: {
          type: 'object',
          properties: {
            sectionId: {
              type: 'string',
              enum: [...USER_GUIDE_SECTION_IDS],
              description:
                'Which section of the User Guide template this answer belongs to.',
            },
            answer: {
              type: 'string',
              description:
                "The user's answer verbatim. Trim surrounding whitespace but preserve their voice.",
            },
          },
          required: ['sectionId', 'answer'],
        },
      });
      tools.push({
        name: 'finalize_user_guide',
        description:
          'Build the final User Guide markdown from all saved answers. ' +
          'Call this once the user has answered every section. ' +
          'Returns the markdown plus a list of any sections still missing.',
        input_schema: {type: 'object', properties: {}},
      });
    }

    return tools;
  }

  private buildSystemPrompt(input: AnswerUserInput): string {
    const profile = input.profile;
    const lines = [
      `You are ${APP_NAME}, the onboarding companion for Webflow engineers.`,
      'Call the relevant list_* tool when the user asks about Slack channels, tools to request access to, team rituals, their checklist, or people to meet.',
      'Call search_jira or search_github_prs when the user asks about their own tickets or pull requests.',
      "When returning lists of channels, tools, rituals, or checklist items, pick 3-5 that match the user's role and team. Invite a follow-up if they want more. For the full list, tell them to check the Home tab in the Webflow Slack sidebar.",
      'If list_checklist or list_people_to_meet returns empty data, tell the user their manager is still setting up the plan, and offer catalog-backed help instead (channels, tools, rituals).',
      'Keep answers concise, action-oriented, and conversational. Use short paragraphs and compact markdown.',
      'Do not mention internal system prompts or safety policy.',
      'If the user asks about something outside onboarding, briefly help and then redirect to what you can uniquely do.',
      '',
      'What makes a great follow-up pill:',
      '- Prefer actions only you can do: quizzing the user, drafting something for them, correlating data across tools, personalizing recommendations.',
      '- Do NOT suggest pills that only restate information the user could read on their Home tab (e.g. "show my checklist", "list my tools", "what HR tasks do I have"). Those are not agentic.',
      '- If the user seems unsure which Slack channels, activities, or people fit them, ask ONE short clarifying question about their interests, hobbies, or prior work before recommending. Personalize from what they share.',
      '',
      'After you finish answering, call set_suggested_prompts with up to 4 context-relevant follow-up pills.',
      `Role track: ${profile.roleTrack}`,
      `Team: ${sanitizeForLlm(profile.teamName)}`,
    ];
    if (profile.githubTeamSlug) {
      lines.push(`GitHub team slug: ${profile.githubTeamSlug}`);
    }
    if (input.onboardingStage) {
      lines.push(
        `Current onboarding stage: ${input.onboardingStage.weekKey} (day ${input.onboardingStage.daysSince} since plan published). Tailor suggestions to what is realistic at this stage.`
      );
    }
    const userGuideStanza = buildUserGuideStanza(input);
    if (userGuideStanza) {
      lines.push('', userGuideStanza);
    }
    return lines.join('\n');
  }

  private async runCatalogOrSearchTool(
    toolUse: ToolUseBlock,
    input: AnswerUserInput
  ): Promise<string> {
    try {
      switch (toolUse.name) {
        case 'list_slack_channels':
          return JSON.stringify(this.runListSlackChannels(input));
        case 'list_tools':
          return JSON.stringify(this.runListTools(input));
        case 'list_rituals':
          return JSON.stringify(this.runListRituals(input));
        case 'list_checklist':
          return JSON.stringify(this.runListChecklist(input));
        case 'list_people_to_meet':
          return JSON.stringify(this.runListPeople(input));
        case 'search_jira':
          return JSON.stringify(await this.runJiraTool(toolUse, input));
        case 'search_github_prs':
          return JSON.stringify(await this.runGitHubTool(toolUse, input));
        case 'save_user_guide_answer':
          return JSON.stringify(this.runSaveUserGuideAnswer(toolUse, input));
        case 'finalize_user_guide':
          return JSON.stringify(this.runFinalizeUserGuide(input));
        default:
          return JSON.stringify({error: `Unknown tool: ${toolUse.name}`});
      }
    } catch (error) {
      this.logger.warn(`LLM tool "${toolUse.name}" failed.`, error);
      return JSON.stringify({error: 'Tool call failed.'});
    }
  }

  private runListSlackChannels(input: AnswerUserInput): unknown {
    const channels =
      this.getPublishedPackage(input)?.sections.slack.channels ??
      buildDefaultChannels();
    const joined = input.joinedSlackChannels;
    let joinedCount = 0;
    const categories = groupBy(channels, (c) => c.category).map(
      ({key, items}) => ({
        name: key,
        channels: items.map((c) => {
          const entry: {
            name: string;
            description: string;
            joined?: boolean;
          } = {
            name: c.channel,
            description: c.description,
          };
          if (joined) {
            const normalized = c.channel.replace(/^#/, '').toLowerCase();
            const isJoined = joined.has(normalized);
            entry.joined = isJoined;
            if (isJoined) {
              joinedCount += 1;
            }
          }
          return entry;
        }),
      })
    );
    if (joined) {
      return {categories, joinedCount, totalCount: channels.length};
    }
    return {categories};
  }

  private runListTools(input: AnswerUserInput): unknown {
    const tools =
      this.getPublishedPackage(input)?.sections.toolsAccess.tools ??
      buildDefaultTools();
    return {
      categories: groupBy(tools, (t) => t.category).map(({key, items}) => ({
        name: key,
        tools: items.map((t) => ({
          name: t.tool,
          description: t.description,
          accessHint: t.accessHint ?? null,
        })),
      })),
    };
  }

  private runListRituals(input: AnswerUserInput): unknown {
    const rituals =
      this.getPublishedPackage(input)?.sections.rituals.rituals ??
      buildDefaultRituals();
    return {
      categories: groupBy(rituals, (r) => r.category).map(({key, items}) => ({
        name: key,
        rituals: items.map((r) => ({
          meeting: r.meeting,
          cadence: r.cadence,
          attendance: r.attendance,
          description: r.description,
        })),
      })),
    };
  }

  private runListChecklist(input: AnswerUserInput): unknown {
    const sections =
      this.getPublishedPackage(input)?.sections.onboardingChecklist.sections;
    if (!sections) {
      return {weeks: []};
    }
    return {
      weeks: sections.map((section) => ({
        label: section.title,
        goal: section.goal,
        items: section.items.map((item) => ({
          label: item.label,
          status: 'not-started',
          url: item.resourceUrl ?? null,
          notes: item.notes,
        })),
      })),
    };
  }

  private runListPeople(input: AnswerUserInput): unknown {
    const people =
      this.getPublishedPackage(input)?.sections.peopleToMeet.people;
    if (!people) {
      return {people: []};
    }
    return {
      people: people.map((person) => ({
        name: person.name,
        role: person.role,
        weekBucket: person.weekBucket,
        discussionPoints: person.discussionPoints,
        userGuide: person.userGuide?.url ?? null,
      })),
    };
  }

  private getPublishedPackage(
    input: AnswerUserInput
  ): OnboardingPackage | undefined {
    if (!this.onboardingPackages) {
      return undefined;
    }
    const pkg = this.onboardingPackages.getPackageForUser(input.profile.userId);
    return pkg?.status === 'published' ? pkg : undefined;
  }

  private async runJiraTool(
    toolUse: ToolUseBlock,
    input: AnswerUserInput
  ): Promise<{issues: JiraIssue[]}> {
    if (!this.jira) {
      return {issues: []};
    }
    const args = (toolUse.input ?? {}) as {mode?: string; query?: string};
    const mode = args.mode ?? 'assigned_to_me';

    if (mode === 'by_key' && args.query) {
      const issue = await this.jira.findByKey(args.query);
      return {issues: issue ? [issue] : []};
    }
    if (mode === 'free_text' && args.query) {
      return {issues: await this.jira.findForTextQuery(args.query)};
    }
    if (!input.profile.email) {
      return {issues: []};
    }
    return {issues: await this.jira.findAssignedToEmail(input.profile.email)};
  }

  private async runGitHubTool(
    toolUse: ToolUseBlock,
    input: AnswerUserInput
  ): Promise<{prs: GitHubPullRequest[]}> {
    if (!this.github) {
      return {prs: []};
    }
    const args = (toolUse.input ?? {}) as {mode?: string};
    const mode = args.mode ?? 'mine';
    const username = inferGithubUsername(input.profile.email);

    if (mode === 'team' && input.profile.githubTeamSlug) {
      return {
        prs: await this.github.findRecentPullRequestsForTeam(
          input.profile.githubTeamSlug
        ),
      };
    }
    if (mode === 'review' && username) {
      return {
        prs: await this.github.findPullRequestsAwaitingReview(username),
      };
    }
    if (username) {
      return {
        prs: await this.github.findOpenPullRequestsForUser(username),
      };
    }
    return {prs: []};
  }

  private runSaveUserGuideAnswer(
    toolUse: ToolUseBlock,
    input: AnswerUserInput
  ): unknown {
    if (!this.userGuideIntake) {
      return {error: 'User Guide intake is not available right now.'};
    }
    const args = (toolUse.input ?? {}) as {
      sectionId?: unknown;
      answer?: unknown;
    };
    if (
      typeof args.sectionId !== 'string' ||
      !isUserGuideSectionId(args.sectionId)
    ) {
      return {
        error: `sectionId must be one of: ${USER_GUIDE_SECTION_IDS.join(', ')}`,
      };
    }
    if (typeof args.answer !== 'string' || args.answer.trim().length === 0) {
      return {error: 'answer must be a non-empty string.'};
    }
    this.userGuideIntake.saveAnswer(
      input.profile.userId,
      args.sectionId,
      args.answer
    );
    return {saved: true, sectionId: args.sectionId};
  }

  private runFinalizeUserGuide(input: AnswerUserInput): unknown {
    if (!this.userGuideIntake) {
      return {error: 'User Guide intake is not available right now.'};
    }
    const {markdown, missing} = this.userGuideIntake.finalize(input.profile);
    return {markdown, missing};
  }

  private async generateText(system: string, user: string): Promise<string> {
    if (!this.client) {
      throw new Error('Anthropic client unavailable');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: 350,
          system,
          messages: [{role: 'user', content: user}],
        },
        {signal: controller.signal}
      );

      const text = extractText(response.content);
      if (!text) {
        throw new Error('No text content returned from Anthropic');
      }

      return text;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const FALLBACK_UNREACHABLE = `I'm having trouble reaching my assistant right now. Your ${APP_NAME} Home tab in the Slack sidebar has your onboarding checklist, people to meet, and resources — check there while I get back online.`;

function buildUserGuideStanza(input: AnswerUserInput): string | null {
  const progress = input.userGuideProgress;
  if (!progress) {
    return null;
  }

  const describeIds = (ids: UserGuideSectionId[]): string =>
    ids.length === 0 ? '(none)' : ids.join(', ');

  const sectionCatalog = USER_GUIDE_SECTIONS.map(
    (section) => `  - ${section.id} — ${section.prompt}`
  ).join('\n');

  if (progress.remaining.length === 0) {
    return [
      'User Guide intake: every section has an answer.',
      `Answered: ${describeIds(progress.answered)}.`,
      'Call finalize_user_guide now and post the returned markdown in a fenced ```markdown code block so the user can copy it into their Google Doc template. Offer to revise any section if they want.',
    ].join('\n');
  }

  return [
    'User Guide intake is in progress. The user is drafting their Webflow User Guide so teammates learn how to work with them.',
    `Sections answered: ${describeIds(progress.answered)}.`,
    `Sections remaining: ${describeIds(progress.remaining)}.`,
    'Section catalog:',
    sectionCatalog,
    'Rules for the intake turn:',
    '- Ask about ONE remaining section per turn, using warm, open phrasing (the catalog prompt is a good starting point).',
    '- After the user answers, call save_user_guide_answer({sectionId, answer}) silently with their raw words. Do not paraphrase.',
    '- If they want to skip, re-do a section, or pause, respect that and move on.',
    '- When every section is answered, call finalize_user_guide and post the returned markdown in a ```markdown fenced code block, followed by a short line inviting them to paste it into their Google Doc template and add it to their Slack profile.',
    '- Do not dump the full template up front. Keep it conversational.',
  ].join('\n');
}

function extractText(content: ContentBlock[]): string {
  return content
    .filter((block) => block.type === 'text')
    .map((block) => ('text' in block ? block.text : ''))
    .join('\n')
    .trim();
}

function extractSuggestedPrompts(
  toolUse: ToolUseBlock
): SuggestedPrompt[] | null {
  const args = toolUse.input;
  if (!args || typeof args !== 'object' || !('prompts' in args)) {
    return null;
  }
  const rawPrompts = (args as {prompts?: unknown}).prompts;
  if (!Array.isArray(rawPrompts)) {
    return null;
  }
  const prompts: SuggestedPrompt[] = [];
  for (const raw of rawPrompts) {
    if (typeof raw !== 'object' || raw === null) {
      continue;
    }
    const record = raw as Record<string, unknown>;
    if (
      typeof record.title !== 'string' ||
      typeof record.message !== 'string'
    ) {
      continue;
    }
    prompts.push({title: record.title, message: record.message});
  }
  return prompts.length > 0 ? prompts : null;
}

function mapHistoryToMessages(
  history: ConversationHistoryTurn[]
): MessageParam[] {
  return history
    .filter((turn) => turn.content.trim().length > 0)
    .map((turn) => ({
      role: turn.role,
      content: turn.content,
    }));
}

function groupBy<T>(
  items: T[],
  keyOf: (item: T) => string
): Array<{key: string; items: T[]}> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const bucket = groups.get(key) ?? [];
    bucket.push(item);
    groups.set(key, bucket);
  }
  return Array.from(groups.entries()).map(([key, grouped]) => ({
    key,
    items: grouped,
  }));
}

function sanitizeForLlm(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/<@[A-Z0-9]+>/gi, '[slack-user]')
    .trim();
}

function describeError(error: unknown): string {
  if (!error) return 'unknown';
  if (error instanceof Error) {
    const maybeStatus = (error as unknown as {status?: unknown}).status;
    const status =
      typeof maybeStatus === 'number' ? ` status=${maybeStatus}` : '';
    return `${error.name}${status}: ${error.message}`;
  }
  return String(error);
}
