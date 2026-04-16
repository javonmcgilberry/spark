import type {TeamProfile} from '../onboarding/types.js';
import type {OnboardingStage} from '../onboarding/weeklyAgenda.js';
import type {
  ConversationHistoryTurn,
  JourneyReply,
  JourneyService,
  SuggestedPrompt,
} from '../services/journeyService.js';

export type JourneyTextResult =
  | {
      kind: 'reply';
      reply: JourneyReply;
      status: string;
      title: string;
    }
  | {
      kind: 'answer';
      answer: string;
      suggestedPrompts: SuggestedPrompt[] | null;
      status: string;
      title: string;
    };

export interface ResolveJourneyTextOptions {
  history?: ConversationHistoryTurn[];
  onboardingStage?: OnboardingStage;
  joinedSlackChannels?: Set<string>;
}

const JIRA_KEY_PATTERN = /\b([A-Z][A-Z0-9]+-\d+)\b/;

export async function resolveJourneyText(
  profile: TeamProfile,
  originalText: string,
  journey: JourneyService,
  options: ResolveJourneyTextOptions = {}
): Promise<JourneyTextResult> {
  const jiraKeyMatch = originalText.match(JIRA_KEY_PATTERN);
  if (jiraKeyMatch) {
    return {
      kind: 'reply',
      reply: await journey.showJiraTickets(profile, {
        issueKey: jiraKeyMatch[1],
      }),
      status: `Looking up ${jiraKeyMatch[1]}...`,
      title: `Jira ${jiraKeyMatch[1]}`,
    };
  }

  const {text, suggestedPrompts} = await journey.answerUser(
    profile,
    originalText,
    {
      history: options.history,
      onboardingStage: options.onboardingStage,
      joinedSlackChannels: options.joinedSlackChannels,
    }
  );

  return {
    kind: 'answer',
    answer: text,
    suggestedPrompts,
    status: 'Thinking through the best next step...',
    title: 'Onboarding help',
  };
}
