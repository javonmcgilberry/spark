import type {ContributionTask, TeamProfile} from '../onboarding/types.js';
import {LlmService} from './llmService.js';

export interface ContributionGuide {
  branchName: string;
  jiraTitle: string;
  jiraDescription: string;
  steps: string[];
  prBodyDraft: string;
}

export class ContributionGuideService {
  constructor(private readonly llmService: LlmService) {}

  async build(
    profile: TeamProfile,
    task: ContributionTask
  ): Promise<ContributionGuide> {
    const branchName = buildBranchName(profile, task);
    const jiraTitle = task.title.replace(/`/g, '');
    const jiraDescription = buildJiraDescription(task);
    const prBodyDraft = await this.llmService.draftPullRequestBody(task);

    const steps = [
      `*1. Make sure the repo is cloned and your local environment is running.*\nFollow the setup guide in the <https://webflow.atlassian.net/wiki/spaces/ENG/pages/39914077|Developer Onboarding> doc. If you have not finished local setup yet, the <https://webflow.atlassian.net/wiki/spaces/ENG/pages/2682421264|CDE Sandbox Quick-Start> is the fastest way to get moving.`,
      `*2. Create a Jira ticket for this work.*\nSuggested title: \`${jiraTitle}\`\nDescription: ${jiraDescription}\nIf you are not sure which board to use, your manager or buddy can point you in the right direction.`,
      `*3. Create your branch.* Use your ticket number once you have it:\n\`\`\`\ngit checkout -b <your-name>/<ticket-number>\n\`\`\`\nExample: \`git checkout -b ${branchName}\``,
      `*4. Run the AgentFlow skill in Claude Code or Cursor.*\n\`\`\`\n${task.skillCommand}\n\`\`\`\nThe skill will walk you through the change. Give the diff a quick review before you commit.`,
      `*5. Open a draft PR.* Here's a draft PR description to help you get started:\n_Copy this into the PR body when you're ready._`,
    ];

    return {branchName, jiraTitle, jiraDescription, steps, prBodyDraft};
  }
}

function buildBranchName(profile: TeamProfile, task: ContributionTask): string {
  const who = profile.firstName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const kind = task.type;
  const suffix = task.id
    .split(':')
    .slice(1)
    .join('-')
    .replace(/[^a-z0-9-]+/g, '-')
    .slice(0, 30);
  return `${who}/${kind}-${suffix}`.replace(/-+/g, '-').replace(/-$/, '');
}

function buildJiraDescription(task: ContributionTask): string {
  return [
    task.description,
    '',
    `*Files affected:* ${task.filePaths.join(', ')}`,
    '',
    `*Purpose:* ${task.suggestedPurpose}`,
  ].join('\n');
}
