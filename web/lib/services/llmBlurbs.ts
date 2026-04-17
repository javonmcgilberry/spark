/**
 * Short-form LLM helpers that sit on top of the generic LlmClient.
 * Free functions so ctx threading stays explicit and tests don't need
 * to instantiate a class.
 */

import type {HandlerCtx} from '../ctx';
import type {OnboardingPerson, ContributionTask} from '../types';
import type {GitHubPullRequest} from './github';
import type {JiraIssue} from './jira';

const APP_NAME = 'Spark';

export async function writePersonBlurb(
  ctx: HandlerCtx,
  input: {
    person: OnboardingPerson;
    teamName: string;
    tickets: JiraIssue[];
    prs: GitHubPullRequest[];
  }
): Promise<string | null> {
  if (!ctx.llm.isConfigured()) return null;

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
    const text = await ctx.llm.generate(systemPrompt, contextLines.join('\n'));
    return text || null;
  } catch (error) {
    ctx.logger.warn('LLM writePersonBlurb failed.', error);
    return null;
  }
}

export async function explainTasks(
  ctx: HandlerCtx,
  profile: {roleTrack: string},
  tasks: ContributionTask[]
): Promise<string> {
  if (tasks.length === 0 || !ctx.llm.isConfigured()) {
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

  try {
    return await ctx.llm.generate(
      [
        `You are ${APP_NAME}, an onboarding companion for Webflow engineers.`,
        'Write a short intro before a list of contribution tasks.',
        'Explain why these tasks are good onboarding tasks for a new hire.',
        'Use 2 sentences max.',
        `Role track: ${profile.roleTrack}`,
      ].join('\n'),
      `Tasks:\n${taskSummary}`
    );
  } catch {
    return 'I picked these because they are real work with a small blast radius, which makes them good first contributions while you get comfortable in the repo.';
  }
}
