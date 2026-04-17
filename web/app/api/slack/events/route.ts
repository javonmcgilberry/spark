/**
 * Slack Events API webhook.
 *
 * Slack POSTs JSON here for every subscribed event. We:
 *   1. Read the raw body (needed for HMAC verify).
 *   2. Verify the signature + timestamp skew — unless the request
 *      has `x-dev-sandbox: 1`, which the /dev/slack-sandbox page
 *      uses to bypass verification for local iteration.
 *   3. Parse + dispatch via dispatchSlackEvent.
 *   4. Return 200 immediately; hand background work off to
 *      ctx.waitUntil so Slack doesn't time out at 3 seconds.
 *
 * The sandbox path returns recorded outbound Slack calls in the
 * `x-spark-slack-calls` header so the UI can render them.
 */

import { buildRouteCtx, handleRouteError } from "../../../../lib/routeCtx";
import { dispatchSlackEvent } from "../../../../lib/slack/events";
import { verifySlackSignature } from "../../../../lib/slack/hmac";
import { makeRecordingSlackClient } from "../../../../lib/services/slack";

export const dynamic = "force-dynamic";

export async function GET() {
  return new Response("spark events endpoint", { status: 200 });
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const isDevSandbox =
      request.headers.get("x-dev-sandbox") === "1" &&
      process.env.NODE_ENV !== "production";

    if (!isDevSandbox) {
      const { env } = await buildRouteCtx();
      const signingSecret = env.SLACK_SIGNING_SECRET;
      if (!signingSecret) {
        return Response.json(
          { error: "SLACK_SIGNING_SECRET not configured" },
          { status: 503 },
        );
      }
      const reason = await verifySlackSignature(
        rawBody,
        request.headers.get("x-slack-signature"),
        request.headers.get("x-slack-request-timestamp"),
        signingSecret,
      );
      if (reason) {
        return Response.json(
          { error: `signature verification failed: ${reason}` },
          { status: 401 },
        );
      }
    }

    const envelope = parseEnvelope(rawBody);
    if (!envelope) {
      return Response.json({ error: "invalid JSON body" }, { status: 400 });
    }

    // Build a fresh ctx — in sandbox mode we override ctx.slack with
    // a recording mock so the response can surface calls inline.
    const { ctx } = await buildRouteCtx();
    if (isDevSandbox) {
      ctx.slack = makeRecordingSlackClient();
    }

    const outcome = await dispatchSlackEvent(envelope, ctx);

    const headers = new Headers({ "content-type": "application/json" });
    if (isDevSandbox && ctx.slack._calls) {
      headers.set("x-spark-slack-calls", JSON.stringify(ctx.slack._calls));
    }

    // Schedule background work via waitUntil. In the sandbox we
    // await inline so the recorded-call list includes their effects.
    if (outcome.background?.length) {
      if (isDevSandbox) {
        await Promise.allSettled(outcome.background);
        if (ctx.slack._calls) {
          headers.set("x-spark-slack-calls", JSON.stringify(ctx.slack._calls));
        }
      } else {
        for (const task of outcome.background) ctx.waitUntil(task);
      }
    }

    return new Response(JSON.stringify(outcome.body), {
      status: outcome.status ?? 200,
      headers,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

function parseEnvelope(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
