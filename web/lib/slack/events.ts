/**
 * Slack Events API router.
 *
 * Every inbound event hits route.ts, which verifies the HMAC
 * signature (or skips verify in dev sandbox mode), then calls
 * `dispatchSlackEvent` with the parsed payload + a HandlerCtx.
 * Each handler below takes (event, ctx) and is responsible for its
 * own logic and outbound Slack calls.
 *
 * The router itself is thin: it pattern-matches on event.type and
 * routes to handler modules. Unknown events log + drop (200 OK so
 * Slack doesn't retry).
 */

import type { HandlerCtx } from "../ctx";
import { handleAppHomeOpened } from "./handlers/home";
import {
  handleAppMention,
  handleMessageIm,
  handleMemberJoinedChannel,
} from "./handlers/onboarding";
import {
  handleAssistantThreadStarted,
  handleAssistantThreadContextChanged,
} from "./handlers/assistant";

export interface SlackEventEnvelope {
  type?: string;
  token?: string;
  team_id?: string;
  api_app_id?: string;
  event_id?: string;
  event_time?: number;
  challenge?: string;
  event?: {
    type?: string;
    [key: string]: unknown;
  };
}

export interface DispatchOutcome {
  /** HTTP response body the route should send. */
  body: unknown;
  /** HTTP status the route should send. Default 200. */
  status?: number;
  /** Background work to hand off to ctx.waitUntil. */
  background?: Array<Promise<unknown>>;
}

export async function dispatchSlackEvent(
  envelope: SlackEventEnvelope,
  ctx: HandlerCtx,
): Promise<DispatchOutcome> {
  // URL verification handshake — Slack sends this once when you
  // save the Events Request URL. Echo the challenge back in the
  // body verbatim.
  if (envelope.type === "url_verification" && envelope.challenge) {
    return { body: { challenge: envelope.challenge } };
  }

  if (envelope.type !== "event_callback" || !envelope.event) {
    return { body: { ok: true, skipped: "not an event_callback" } };
  }

  const background: Array<Promise<unknown>> = [];
  const event = envelope.event;
  const eventType = event.type;
  ctx.logger.info(`Slack event received: ${eventType}`);

  // Cast once at the boundary — the envelope's `event` shape is
  // `{ [key: string]: unknown }`, but each handler has a narrow
  // event type mirroring the Slack Events API payload. Unknown
  // cast is safe here since the route has already verified the
  // HMAC signature (or we're in dev-sandbox mode).
  const ev = event as unknown;
  try {
    switch (eventType) {
      case "app_home_opened":
        background.push(
          handleAppHomeOpened(
            ev as Parameters<typeof handleAppHomeOpened>[0],
            ctx,
          ),
        );
        break;
      case "app_mention":
        background.push(
          handleAppMention(ev as Parameters<typeof handleAppMention>[0], ctx),
        );
        break;
      case "message":
        if ((event as { channel_type?: string }).channel_type === "im") {
          background.push(
            handleMessageIm(ev as Parameters<typeof handleMessageIm>[0], ctx),
          );
        }
        break;
      case "member_joined_channel":
        background.push(
          handleMemberJoinedChannel(
            ev as Parameters<typeof handleMemberJoinedChannel>[0],
            ctx,
          ),
        );
        break;
      case "assistant_thread_started":
        background.push(
          handleAssistantThreadStarted(
            ev as Parameters<typeof handleAssistantThreadStarted>[0],
            ctx,
          ),
        );
        break;
      case "assistant_thread_context_changed":
        background.push(
          handleAssistantThreadContextChanged(
            ev as Parameters<typeof handleAssistantThreadContextChanged>[0],
            ctx,
          ),
        );
        break;
      default:
        ctx.logger.warn(`Unhandled Slack event type: ${eventType}`);
    }
  } catch (error) {
    ctx.logger.error(`dispatcher sync threw for ${eventType}`, error);
  }

  return { body: { ok: true }, background };
}

/**
 * Block Kit interactivity dispatcher. Payload arrives
 * url-form-encoded as `payload=<JSON>`.
 */
export interface InteractivityPayload {
  type?: "block_actions" | "view_submission" | string;
  actions?: Array<{
    action_id?: string;
    block_id?: string;
    value?: string;
    type?: string;
  }>;
  user?: { id?: string };
  team?: { id?: string };
  view?: { id?: string; callback_id?: string };
  response_url?: string;
  trigger_id?: string;
}

export async function dispatchInteractivity(
  payload: InteractivityPayload,
  ctx: HandlerCtx,
): Promise<DispatchOutcome> {
  const background: Array<Promise<unknown>> = [];
  const firstAction = payload.actions?.[0];
  if (payload.type === "block_actions" && firstAction) {
    ctx.logger.info(
      `Slack interactivity: action=${firstAction.action_id} user=${payload.user?.id}`,
    );
    // For the hackathon we acknowledge but don't mutate state —
    // interactivity UI actions (mark-complete, etc.) can reconnect
    // via ctx.db in a follow-up. This keeps the round-trip green
    // so Slack doesn't show "didn't work" in the UI.
    background.push(Promise.resolve());
  } else {
    ctx.logger.warn(
      `Slack interactivity: unhandled payload type=${payload.type}`,
    );
  }
  return { body: { ok: true }, background };
}
