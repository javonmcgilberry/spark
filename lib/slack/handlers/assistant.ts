/**
 * Assistant thread handler — responds to `assistant_thread_started`
 * and `assistant_thread_context_changed` events. Sets the thread
 * title + suggested prompts and posts the opening greeting.
 */

import type {HandlerCtx} from '../../ctx';
import {resolveFromSlack} from '../../services/identityResolver';
import {APP_NAME} from '../../branding';

interface AssistantThreadStartedEvent {
  type: 'assistant_thread_started';
  assistant_thread: {
    user_id: string;
    channel_id: string;
    thread_ts: string;
    context?: {
      channel_id?: string;
      team_id?: string;
      enterprise_id?: string | null;
    };
  };
  event_ts: string;
}

interface AssistantThreadContextChangedEvent {
  type: 'assistant_thread_context_changed';
  assistant_thread: AssistantThreadStartedEvent['assistant_thread'];
  event_ts: string;
}

export async function handleAssistantThreadStarted(
  event: AssistantThreadStartedEvent,
  ctx: HandlerCtx
): Promise<void> {
  const userId = event.assistant_thread.user_id;
  const channel = event.assistant_thread.channel_id;
  const thread_ts = event.assistant_thread.thread_ts;
  ctx.logger.info(`Assistant thread started for ${userId}`);

  const profile = await resolveFromSlack(ctx, userId).catch((error) => {
    ctx.logger.warn('resolveFromSlack failed for assistant thread', error);
    return null;
  });
  const firstName = profile?.firstName ?? 'there';

  await ctx.slack.assistant.threads.setTitle({
    channel_id: channel,
    thread_ts,
    title: `${APP_NAME} for ${firstName}`,
  });

  await ctx.slack.assistant.threads.setSuggestedPrompts({
    channel_id: channel,
    thread_ts,
    prompts: [
      {
        title: 'Which Slack channels first?',
        message: 'Which Slack channels should I join first?',
      },
      {
        title: "What's in week 1?",
        message: 'What does my week 1 checklist look like?',
      },
      {
        title: 'Who should I meet?',
        message: 'Who should I meet this week?',
      },
      {
        title: 'Help me write my user guide',
        message: 'Can you help me draft my Webflow user guide?',
      },
    ],
  });

  await ctx.slack.chat.postMessage({
    channel,
    thread_ts,
    text: `Hey ${firstName} 👋 I'm ${APP_NAME}. Ask me about your onboarding checklist, people to meet, Slack channels, or anything else on your ramp. I can also help you draft your Webflow user guide.`,
  });
}

export async function handleAssistantThreadContextChanged(
  event: AssistantThreadContextChangedEvent,
  ctx: HandlerCtx
): Promise<void> {
  // Log-only — no per-channel state to invalidate on context change.
  ctx.logger.info(
    `Assistant thread context changed for ${event.assistant_thread.user_id}`
  );
}
