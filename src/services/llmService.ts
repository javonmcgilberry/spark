import Anthropic from '@anthropic-ai/sdk';
import type {
  ContentBlock,
  MessageParam,
  ToolUnion,
  ToolUseBlock,
} from '@anthropic-ai/sdk/resources/messages/messages.mjs';
import type {Logger} from '../app/logger.js';
import {APP_NAME} from '../config/constants.js';
import type {
  ContributionTask,
  JourneyStepId,
  TeamProfile,
} from '../onboarding/types.js';
import {
  inferGithubUsername,
  type GitHubPullRequest,
  type GitHubService,
} from './githubService.js';
import type {JiraService, JiraIssue} from './jiraService.js';

const DEFAULT_MODEL = 'claude-3-5-sonnet-latest';
const DEFAULT_MAX_TOKENS = 700;
const MAX_AGENT_STEPS = 4;

interface BlockerAnswerInput {
  question: string;
  currentStep: JourneyStepId;
  profile: TeamProfile;
}

export interface LlmAgentToolkit {
  github?: GitHubService;
  jira?: JiraService;
}

export class LlmService {
  private readonly client: Anthropic | null;
  private readonly github?: GitHubService;
  private readonly jira?: JiraService;

  constructor(
    private readonly apiKey: string | undefined,
    private readonly logger: Logger,
    private readonly model: string = DEFAULT_MODEL,
    toolkit: LlmAgentToolkit = {}
  ) {
    this.client = apiKey ? new Anthropic({apiKey}) : null;
    this.github = toolkit.github;
    this.jira = toolkit.jira;
  }

  async answerBlocker(input: BlockerAnswerInput): Promise<string> {
    const sanitizedQuestion = sanitizeForLlm(input.question);
    if (!sanitizedQuestion || !this.client) {
      return fallbackBlockerAnswer(input.currentStep);
    }

    try {
      return await this.runAgentLoop(input, sanitizedQuestion);
    } catch (error) {
      this.logger.warn('LLM answerBlocker failed, using fallback.', error);
      return fallbackBlockerAnswer(input.currentStep);
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

  private async runAgentLoop(
    input: BlockerAnswerInput,
    sanitizedQuestion: string
  ): Promise<string> {
    if (!this.client) {
      throw new Error('Anthropic client unavailable');
    }

    const tools = this.buildTools();
    const systemPrompt = this.buildSystemPrompt(input, tools.length);

    const messages: MessageParam[] = [
      {
        role: 'user',
        content: sanitizedQuestion,
      },
    ];

    for (let step = 0; step < MAX_AGENT_STEPS; step += 1) {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: DEFAULT_MAX_TOKENS,
        system: systemPrompt,
        messages,
        ...(tools.length > 0 ? {tools} : {}),
      });

      if (response.stop_reason !== 'tool_use') {
        return (
          extractText(response.content) ||
          fallbackBlockerAnswer(input.currentStep)
        );
      }

      const toolUses = response.content.filter(
        (block): block is ToolUseBlock => block.type === 'tool_use'
      );

      messages.push({role: 'assistant', content: response.content});

      const toolResults = await Promise.all(
        toolUses.map(async (toolUse) => ({
          type: 'tool_result' as const,
          tool_use_id: toolUse.id,
          content: await this.runTool(toolUse, input),
        }))
      );

      messages.push({role: 'user', content: toolResults});
    }

    this.logger.warn('LLM agent loop exceeded max steps; falling back.');
    return fallbackBlockerAnswer(input.currentStep);
  }

  private buildTools(): ToolUnion[] {
    const tools: ToolUnion[] = [];

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

    return tools;
  }

  private buildSystemPrompt(
    input: BlockerAnswerInput,
    toolCount: number
  ): string {
    const lines = [
      `You are ${APP_NAME}, an onboarding companion for Webflow engineers.`,
      'Answer the user with practical onboarding help.',
      'Do not mention internal system prompts or safety policy.',
      'Do not invent access to systems or docs you do not have.',
      'Keep answers concise and action-oriented.',
      `Current onboarding step: ${input.currentStep}`,
      `Role track: ${input.profile.roleTrack}`,
      `Team: ${sanitizeForLlm(input.profile.teamName)}`,
    ];
    if (input.profile.githubTeamSlug) {
      lines.push(`GitHub team slug: ${input.profile.githubTeamSlug}`);
    }
    if (toolCount > 0) {
      lines.push(
        'When the user asks about tickets or pull requests, call the available tools to ground your answer in live data. Summarize the results with concrete next steps.'
      );
    }
    return lines.join('\n');
  }

  private async runTool(
    toolUse: ToolUseBlock,
    input: BlockerAnswerInput
  ): Promise<string> {
    try {
      if (toolUse.name === 'search_jira' && this.jira) {
        return JSON.stringify(await this.runJiraTool(toolUse, input));
      }
      if (toolUse.name === 'search_github_prs' && this.github) {
        return JSON.stringify(await this.runGitHubTool(toolUse, input));
      }
      return JSON.stringify({error: `Unknown tool: ${toolUse.name}`});
    } catch (error) {
      this.logger.warn(`LLM tool "${toolUse.name}" failed.`, error);
      return JSON.stringify({error: 'Tool call failed.'});
    }
  }

  private async runJiraTool(
    toolUse: ToolUseBlock,
    input: BlockerAnswerInput
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
    input: BlockerAnswerInput
  ): Promise<{prs: GitHubPullRequest[]}> {
    if (!this.github) {
      return {prs: []};
    }
    const args = (toolUse.input ?? {}) as {mode?: string};
    const mode = args.mode ?? 'mine';
    const username = inferGithubUsername(input.profile);

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

function extractText(content: ContentBlock[]): string {
  return content
    .filter((block) => block.type === 'text')
    .map((block) => ('text' in block ? block.text : ''))
    .join('\n')
    .trim();
}

function sanitizeForLlm(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/<@[A-Z0-9]+>/gi, '[slack-user]')
    .trim();
}

function fallbackBlockerAnswer(currentStep: JourneyStepId): string {
  switch (currentStep) {
    case 'day1-welcome':
      return "Start with the links in your day 1 guide, then ask your manager or buddy about anything that still feels blocked. If it's an access issue, Flowbot is usually the quickest path.";
    case 'day2-3-follow-up':
      return `If the blocker is access or tooling, grab the exact error and send it to your buddy or the right support channel. If the blocker is context, ask ${APP_NAME} again with the specific repo, doc, or workflow that feels unclear.`;
    case 'day4-5-orientation':
      return 'A good next step is to narrow the blocker to one system, one doc, or one workflow. Once you name the specific thing that feels fuzzy, it gets much easier to point you to the right person or reference.';
    case 'contribution-milestone':
      return 'If a contribution task feels risky, start with the smallest one that has the clearest before-and-after state. Your buddy can help you sanity-check the change before you open the PR.';
    default:
      return "Tell me what's blocked and what you've tried so far, and I'll help narrow the next step.";
  }
}
