/**
 * Onboarding-side Slack event handlers:
 *   - app_mention: hire pings @Spark in a channel.
 *   - message (im): hire DMs Spark.
 *   - member_joined_channel: hire joins a watched channel.
 *
 * Each handler does a minimal-useful acknowledgement in the Webflow
 * Cloud port: short LLM reply via ctx.llm, no streaming. The Node
 * bot's rich journey/state logic isn't ported in this phase — that
 * was tightly coupled to the JourneyService which lived in
 * spark/src and used in-memory state. A later pass can bring the
 * journey back if we need it; for now the published OnboardingPackage
 * and the hire's Home tab carry the structure.
 */

import type { HandlerCtx } from "../../ctx";
import { resolveFromSlack } from "../../services/identityResolver";

interface AppMentionEvent {
  type: "app_mention";
  user: string;
  text: string;
  ts: string;
  channel: string;
  thread_ts?: string;
}

interface MessageImEvent {
  type: "message";
  channel_type: "im";
  user?: string;
  text?: string;
  ts: string;
  channel: string;
  subtype?: string;
  thread_ts?: string;
  bot_id?: string;
}

interface MemberJoinedChannelEvent {
  type: "member_joined_channel";
  user: string;
  channel: string;
  channel_type?: string;
  team?: string;
}

export async function handleAppMention(
  event: AppMentionEvent,
  ctx: HandlerCtx,
): Promise<void> {
  const profile = await resolveFromSlack(ctx, event.user).catch(() => null);
  const firstName = profile?.firstName ?? "there";
  const response = await generateConversationalReply(
    ctx,
    firstName,
    stripBotMention(event.text),
  );
  await ctx.slack.chat.postMessage({
    channel: event.channel,
    thread_ts: event.thread_ts ?? event.ts,
    text: response,
  });
}

export async function handleMessageIm(
  event: MessageImEvent,
  ctx: HandlerCtx,
): Promise<void> {
  if (event.subtype || event.bot_id || !event.user || !event.text) return;
  const profile = await resolveFromSlack(ctx, event.user).catch(() => null);
  const firstName = profile?.firstName ?? "there";
  const response = await generateConversationalReply(
    ctx,
    firstName,
    event.text,
  );
  await ctx.slack.chat.postMessage({
    channel: event.channel,
    thread_ts: event.thread_ts,
    text: response,
  });
}

export async function handleMemberJoinedChannel(
  event: MemberJoinedChannelEvent,
  ctx: HandlerCtx,
): Promise<void> {
  // Hackathon scope: log only. The Node bot greeted new joiners in
  // specific channels; that state (which channels to watch) lived
  // in env config. Reintroducing that requires a channel allowlist
  // that's outside the minimum-viable migration.
  ctx.logger.info(
    `member_joined_channel: user=${event.user} channel=${event.channel}`,
  );
}

async function generateConversationalReply(
  ctx: HandlerCtx,
  firstName: string,
  text: string,
): Promise<string> {
  const sanitized = text.trim() || "Say hello";
  if (!ctx.llm.isConfigured()) {
    return `Hey ${firstName} 👋 I'm Spark. My AI is offline right now — your Home tab has your onboarding plan while I catch up.`;
  }
  try {
    const reply = await ctx.llm.generate(
      [
        `You are Spark, a friendly onboarding companion for Webflow engineers.`,
        `Keep replies short (2-4 sentences) and concrete.`,
        `If the user needs something you cannot do, point them to the "Request Help" workflow in #triage-build-loop.`,
      ].join("\n"),
      `${firstName} said: ${sanitized}`,
    );
    return reply || `Thanks ${firstName} — I'll follow up shortly.`;
  } catch (error) {
    ctx.logger.warn("LLM conversational reply failed", error);
    return `Thanks ${firstName} — I'm having trouble reaching my assistant right now. Try again in a moment, or check your Home tab for the onboarding plan.`;
  }
}

function stripBotMention(text: string): string {
  return text.replace(/<@[A-Z0-9]+>/g, "").trim();
}
