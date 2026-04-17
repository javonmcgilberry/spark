/**
 * Onboarding-side Slack event handlers:
 *   - app_mention: hire pings @Spark in a channel.
 *   - message (im): hire DMs Spark.
 *   - member_joined_channel: hire joins a watched channel.
 *
 * Each handler produces a short LLM reply via ctx.llm. The published
 * OnboardingPackage + hire Home tab carry the structural state; these
 * handlers are conversational acknowledgements on top.
 */

import type {HandlerCtx} from '../../ctx';
import {resolveFromSlack} from '../../services/identityResolver';

interface AppMentionEvent {
  type: 'app_mention';
  user: string;
  text: string;
  ts: string;
  channel: string;
  thread_ts?: string;
}

interface MessageImEvent {
  type: 'message';
  channel_type: 'im';
  user?: string;
  text?: string;
  ts: string;
  channel: string;
  subtype?: string;
  thread_ts?: string;
  bot_id?: string;
}

interface MemberJoinedChannelEvent {
  type: 'member_joined_channel';
  user: string;
  channel: string;
  channel_type?: string;
  team?: string;
}

export async function handleAppMention(
  event: AppMentionEvent,
  ctx: HandlerCtx
): Promise<void> {
  const profile = await resolveFromSlack(ctx, event.user).catch(() => null);
  const firstName = profile?.firstName ?? 'there';
  const response = await generateConversationalReply(
    ctx,
    firstName,
    stripBotMention(event.text)
  );
  await ctx.slack.chat.postMessage({
    channel: event.channel,
    thread_ts: event.thread_ts ?? event.ts,
    text: response,
  });
}

export async function handleMessageIm(
  event: MessageImEvent,
  ctx: HandlerCtx
): Promise<void> {
  if (event.subtype || event.bot_id || !event.user || !event.text) return;
  const profile = await resolveFromSlack(ctx, event.user).catch(() => null);
  const firstName = profile?.firstName ?? 'there';
  const response = await generateConversationalReply(
    ctx,
    firstName,
    event.text
  );
  await ctx.slack.chat.postMessage({
    channel: event.channel,
    thread_ts: event.thread_ts,
    text: response,
  });
}

export async function handleMemberJoinedChannel(
  event: MemberJoinedChannelEvent,
  ctx: HandlerCtx
): Promise<void> {
  // Log-only today. A per-channel greet flow needs a channel allowlist
  // (which channels warrant an auto-greet) — add that here when we
  // decide to ship it.
  ctx.logger.info(
    `member_joined_channel: user=${event.user} channel=${event.channel}`
  );
}

async function generateConversationalReply(
  ctx: HandlerCtx,
  firstName: string,
  text: string
): Promise<string> {
  const sanitized = text.trim() || 'Say hello';
  if (!ctx.llm.isConfigured()) {
    return `Hey ${firstName} 👋 I'm Spark. My AI is offline right now — your Home tab has your onboarding plan while I catch up.`;
  }
  try {
    const reply = await ctx.llm.generate(
      [
        `You are Spark, a friendly onboarding companion for Webflow engineers.`,
        `Keep replies short (2-4 sentences) and concrete.`,
        `If the user needs something you cannot do, point them to the "Request Help" workflow in #triage-build-loop.`,
      ].join('\n'),
      `${firstName} said: ${sanitized}`
    );
    return reply || `Thanks ${firstName} — I'll follow up shortly.`;
  } catch (error) {
    ctx.logger.warn('LLM conversational reply failed', error);
    return `Thanks ${firstName} — I'm having trouble reaching my assistant right now. Try again in a moment, or check your Home tab for the onboarding plan.`;
  }
}

function stripBotMention(text: string): string {
  return text.replace(/<@[A-Z0-9]+>/g, '').trim();
}
