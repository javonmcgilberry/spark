import {Assistant, type App} from '@slack/bolt';
import type {Services} from '../../app/services.js';
import {resolveJourneyText} from '../journeyText.js';
import {
  publishPreparedHome,
  syncSharedOnboardingWorkspace,
} from '../publishHome.js';

const DEFAULT_PROMPTS = {
  title: 'Try one of these',
  prompts: [
    {
      title: 'Start onboarding',
      message: 'Start my onboarding',
    },
    {
      title: 'People to meet',
      message: 'Who should I meet first?',
    },
    {
      title: 'Week 1 context',
      message: 'Show me my docs and channels',
    },
    {
      title: 'First contribution',
      message: 'Find my first contribution task',
    },
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
          status: 'Loading your onboarding guide...',
          loading_messages: [
            'Looking up your team',
            'Pulling together your onboarding plan',
            'Getting Spark ready',
          ],
        });

        const profile = await identityResolver.resolveFromSlack(app, userId);
        const prepared = await journey.prepareStart(profile);
        const reply = journey.buildStartReply(prepared);

        await setTitle(`Spark for ${profile.firstName}`);
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
        const response = await resolveJourneyText(profile, text, journey);

        await setTitle(response.title);

        if (response.kind === 'reply') {
          await setStatus(response.status);
          await say({
            text: response.reply.text,
            blocks: response.reply.blocks,
          });
          if (response.syncProgress) {
            await syncSharedOnboardingWorkspace(
              app,
              services,
              message.user,
              client
            );
          }
          return;
        }

        await setStatus({
          status: response.status,
          loading_messages: [
            'Thinking through your question',
            'Grounding the answer in your onboarding step',
            'Putting together the clearest next step',
          ],
        });

        const stream = sayStream({buffer_size: 96});
        for (const chunk of chunkMarkdown(response.answer)) {
          await stream.append({markdown_text: chunk});
        }
        await stream.stop();
      },
    })
  );
}

function chunkMarkdown(text: string): string[] {
  const normalized = text.trim();
  if (!normalized) {
    return ['I hit an empty response. Try asking that one more time.'];
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
