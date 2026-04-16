import type {TeamProfile} from '../onboarding/types.js';
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

const JIRA_KEY_PATTERN = /\b([A-Z][A-Z0-9]+-\d+)\b/;

export async function resolveJourneyText(
  profile: TeamProfile,
  originalText: string,
  journey: JourneyService,
  history: ConversationHistoryTurn[] = []
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
    {history}
  );

  return {
    kind: 'answer',
    answer: text,
    suggestedPrompts,
    status: 'Thinking through the best next step...',
    title: 'Onboarding help',
  };
}
