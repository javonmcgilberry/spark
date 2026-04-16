import {Assistant, type App} from '@slack/bolt';
import type {Services} from '../../app/services.js';
import {APP_NAME} from '../../config/constants.js';
import type {
  ConversationHistoryTurn,
  SuggestedPrompt,
} from '../../services/journeyService.js';
import {resolveJourneyText} from '../journeyText.js';
import {
  publishPreparedHome,
  syncSharedOnboardingWorkspace,
} from '../publishHome.js';

const HISTORY_LIMIT = 10;

const HOME_TAB_PROMPT: SuggestedPrompt = {
  title: 'Open my Home tab',
  message: 'open my home tab',
};

export const DEFAULT_PROMPTS: {
  title: string;
  prompts: SuggestedPrompt[];
} = {
  title: 'Try one of these next',
  prompts: [
    HOME_TAB_PROMPT,
    {title: 'My checklist today', message: "what's on my checklist today?"},
    {title: 'Who should I meet', message: 'who should I meet this week?'},
    {title: 'Find a starter task', message: 'find me a starter task'},
  ],
};

export function registerAssistantHandlers(app: App, services: Services): void {
  const {logger, identityResolver, journey} = services;

  app.assistant(
    new Assistant({
      threadStarted: async ({
        event,
        client,
        setSuggestedPrompts,
        setTitle,
        setStatus,
        say,
      }) => {
        const userId = event.assistant_thread.user_id;
        logger.info(`Assistant thread started for ${userId}`);

        await setStatus({
          status: 'Getting your onboarding plan ready...',
          loading_messages: [
            'Looking up your team',
            'Pulling together your plan',
            `Getting ${APP_NAME} ready`,
          ],
        });

        const profile = await identityResolver.resolveFromSlack(app, userId);
        const prepared = await journey.prepareStart(profile);
        const reply = journey.buildStartReply(prepared);

        await setTitle(`${APP_NAME} for ${profile.firstName}`);
        await setSuggestedPrompts(DEFAULT_PROMPTS);
        await say({
          text: reply.text,
          blocks: reply.blocks,
        });
        await publishPreparedHome(services, client, userId, prepared);
      },
      userMessage: async ({
        message,
        client,
        setStatus,
        setTitle,
        setSuggestedPrompts,
        say,
        sayStream,
      }) => {
        if (message.subtype || !message.user) {
          return;
        }

        const text = message.text ?? '';
        const profile = await identityResolver.resolveFromSlack(
          app,
          message.user
        );

        const history = await fetchThreadHistory(
          client,
          message.channel,
          message.thread_ts ?? message.ts
        );

        const response = await resolveJourneyText(
          profile,
          text,
          journey,
          history
        );

        await setTitle(response.title);

        if (response.kind === 'reply') {
          await setStatus(response.status);
          await say({
            text: response.reply.text,
            blocks: response.reply.blocks,
          });
          await setSuggestedPrompts(DEFAULT_PROMPTS);
          return;
        }

        await setStatus({
          status: response.status,
          loading_messages: [
            'Thinking through your question',
            'Grounding the answer in your onboarding',
            'Putting together a clear next step',
          ],
        });

        const stream = sayStream({buffer_size: 96});
        for (const chunk of chunkMarkdown(response.answer)) {
          await stream.append({markdown_text: chunk});
        }
        await stream.stop();

        // setSuggestedPrompts AFTER stopStream per Slack canonical order.
        await setSuggestedPrompts(
          mergeWithPinnedHome(response.suggestedPrompts)
        );
      },
    })
  );
}

export function mergeWithPinnedHome(agentPrompts: SuggestedPrompt[] | null): {
  title: string;
  prompts: SuggestedPrompt[];
} {
  if (!agentPrompts || agentPrompts.length === 0) {
    return DEFAULT_PROMPTS;
  }

  const dedupedAgentPrompts = agentPrompts.filter(
    (prompt) =>
      prompt.title.trim().toLowerCase() !== HOME_TAB_PROMPT.title.toLowerCase()
  );

  return {
    title: 'Try one of these next',
    prompts: [HOME_TAB_PROMPT, ...dedupedAgentPrompts].slice(0, 4),
  };
}

export async function fetchThreadHistory(
  client: App['client'],
  channel: string | undefined,
  threadTs: string | undefined
): Promise<ConversationHistoryTurn[]> {
  if (!channel || !threadTs) {
    return [];
  }

  try {
    const response = await client.conversations.replies({
      channel,
      ts: threadTs,
      oldest: threadTs,
      limit: HISTORY_LIMIT,
    });

    const messages = response.messages ?? [];
    return messages
      .slice(0, -1) // exclude the current user message we are about to answer
      .map((m) => ({
        role: (m.bot_id ? 'assistant' : 'user') as 'user' | 'assistant',
        content: m.text ?? '',
      }))
      .filter((turn) => turn.content.trim().length > 0)
      .slice(-HISTORY_LIMIT);
  } catch {
    // If history lookup fails, fall back to zero-shot.
    return [];
  }
}

function chunkMarkdown(text: string): string[] {
  const normalized = text.trim();
  if (!normalized) {
    return ["I didn't get a response that time. Try asking again."];
  }

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length > 0) {
    return paragraphs.map((paragraph, index) =>
      index === paragraphs.length - 1 ? paragraph : `${paragraph}\n\n`
    );
  }

  return [normalized];
}
