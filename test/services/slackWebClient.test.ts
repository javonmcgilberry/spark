import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createSilentLogger} from '../../lib/ctx';
import {makeSlackWebClient} from '../../lib/services/slack';

describe('makeSlackWebClient transport encoding', () => {
  const fetchMock =
    vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('posts users.lookupByEmail as form-urlencoded so Slack sees the email field', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ok: true, user: {id: 'U123'}}), {
        status: 200,
      })
    );

    const slack = makeSlackWebClient('xoxb-test-token', createSilentLogger());
    const result = await slack.users.lookupByEmail({
      email: 'javon.mcgilberry@webflow.com',
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://slack.com/api/users.lookupByEmail');
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe(
      'application/x-www-form-urlencoded; charset=utf-8'
    );
    expect(init?.body).toBe('email=javon.mcgilberry%40webflow.com');
  });

  it('keeps rich payload methods on JSON so blocks and views still work', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ok: true, ts: '123.456'}), {status: 200})
    );

    const slack = makeSlackWebClient('xoxb-test-token', createSilentLogger());
    await slack.chat.postMessage({
      channel: 'C123',
      text: 'hi',
      blocks: [{type: 'section', text: {type: 'mrkdwn', text: 'hi'}}],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json; charset=utf-8'
    );
    expect(init?.body).toContain('"channel":"C123"');
    expect(init?.body).toContain('"blocks"');
  });
});
