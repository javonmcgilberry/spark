/**
 * Slack Block Kit interactivity webhook.
 *
 * Slack POSTs form-encoded `payload=<JSON>` here when a user
 * clicks a button, submits a modal, etc. Signature verify uses
 * the same rawBody helper as /api/slack/events.
 */

import {buildRouteCtx, handleRouteError} from '../../../../lib/routeCtx';
import {dispatchInteractivity} from '../../../../lib/slack/events';
import {verifySlackSignature} from '../../../../lib/slack/hmac';
import {makeRecordingSlackClient} from '../../../../lib/services/slack';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const isDevSandbox =
      request.headers.get('x-dev-sandbox') === '1' &&
      process.env.NODE_ENV !== 'production';

    if (!isDevSandbox) {
      const {env} = await buildRouteCtx();
      const signingSecret = env.SLACK_SIGNING_SECRET;
      if (!signingSecret) {
        return Response.json(
          {error: 'SLACK_SIGNING_SECRET not configured'},
          {status: 503}
        );
      }
      const reason = await verifySlackSignature(
        rawBody,
        request.headers.get('x-slack-signature'),
        request.headers.get('x-slack-request-timestamp'),
        signingSecret
      );
      if (reason) {
        return Response.json(
          {error: `signature verification failed: ${reason}`},
          {status: 401}
        );
      }
    }

    const payload = parsePayload(rawBody);
    if (!payload) {
      return Response.json({error: 'invalid payload body'}, {status: 400});
    }

    const {ctx} = await buildRouteCtx();
    if (isDevSandbox) {
      ctx.slack = makeRecordingSlackClient();
    }

    const outcome = await dispatchInteractivity(payload, ctx);

    const headers = new Headers({'content-type': 'application/json'});
    if (isDevSandbox && ctx.slack._calls) {
      headers.set('x-spark-slack-calls', JSON.stringify(ctx.slack._calls));
    }

    if (outcome.background?.length && !isDevSandbox) {
      for (const task of outcome.background) ctx.waitUntil(task);
    } else if (outcome.background?.length) {
      await Promise.allSettled(outcome.background);
    }

    return new Response(JSON.stringify(outcome.body), {
      status: outcome.status ?? 200,
      headers,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * Slack sends interactivity payloads URL-encoded with a single
 * `payload` field containing the JSON. Parse the form-encoded body
 * and pull that JSON out.
 */
function parsePayload(raw: string): unknown {
  try {
    const params = new URLSearchParams(raw);
    const payload = params.get('payload');
    if (payload) return JSON.parse(payload);
    // Some Slack configurations send JSON directly (rare but allowed).
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
