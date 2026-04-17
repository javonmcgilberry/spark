import {computeSlackSignatureBase} from '../../lib/slack/hmac';

/**
 * Build a signed Slack Events API Request suitable for passing straight
 * into the route handler's POST function. This mirrors exactly what
 * Slack sends, so the same signature-verify path runs in tests that
 * runs in prod.
 *
 * Usage in tests:
 *     const req = await postSignedEvent(fixture);
 *     const res = await POST(req);
 */
export async function postSignedEvent(
  fixture: unknown,
  options: {
    secret?: string;
    timestamp?: number;
    url?: string;
    devSandbox?: boolean;
  } = {}
): Promise<Request> {
  const secret = options.secret ?? 'test-signing-secret';
  const ts = String(options.timestamp ?? Math.floor(Date.now() / 1000));
  const body = JSON.stringify(fixture);
  const signature = await computeSlackSignatureBase(ts, body, secret);

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-slack-signature': signature,
    'x-slack-request-timestamp': ts,
  };
  if (options.devSandbox) {
    headers['x-dev-sandbox'] = '1';
  }

  return new Request(options.url ?? 'https://test.local/api/slack/events', {
    method: 'POST',
    headers,
    body,
  });
}

/**
 * Build an unsigned request — useful for testing signature rejection.
 */
export function postUnsignedEvent(fixture: unknown): Request {
  return new Request('https://test.local/api/slack/events', {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(fixture),
  });
}
