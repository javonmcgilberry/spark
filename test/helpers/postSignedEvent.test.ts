import {describe, expect, it} from 'vitest';
import {postSignedEvent, postUnsignedEvent} from './postSignedEvent';
import {verifySlackSignature} from '../../lib/slack/hmac';
import urlVerificationFixture from '../fixtures/slack-events/url-verification.json';

describe('postSignedEvent', () => {
  it('produces a request whose signature matches what Slack would compute', async () => {
    const req = await postSignedEvent(urlVerificationFixture, {
      secret: 'test-secret',
      timestamp: 1_700_000_000,
    });

    const body = await req.clone().text();
    const signature = req.headers.get('x-slack-signature');
    const ts = req.headers.get('x-slack-request-timestamp');
    expect(signature).toMatch(/^v0=[0-9a-f]+$/);
    expect(ts).toBe('1700000000');

    const reason = await verifySlackSignature(
      body,
      signature,
      ts,
      'test-secret',
      {now: () => 1_700_000_000_000}
    );
    expect(reason).toBeNull();
  });

  it('rejects a wrong-secret signature', async () => {
    const req = await postSignedEvent(urlVerificationFixture, {
      secret: 'test-secret',
      timestamp: 1_700_000_000,
    });
    const body = await req.clone().text();
    const signature = req.headers.get('x-slack-signature');
    const ts = req.headers.get('x-slack-request-timestamp');

    const reason = await verifySlackSignature(
      body,
      signature,
      ts,
      'different-secret',
      {now: () => 1_700_000_000_000}
    );
    expect(reason).toBe('signature mismatch');
  });

  it('rejects a stale timestamp', async () => {
    const req = await postSignedEvent(urlVerificationFixture, {
      secret: 'test-secret',
      timestamp: 1_700_000_000,
    });
    const body = await req.clone().text();
    const signature = req.headers.get('x-slack-signature');
    const ts = req.headers.get('x-slack-request-timestamp');

    const reason = await verifySlackSignature(
      body,
      signature,
      ts,
      'test-secret',
      {now: () => 1_700_000_000_000 + 10 * 60 * 1000}
    );
    expect(reason).toBe('timestamp outside skew');
  });

  it('produces dev-sandbox header when requested', async () => {
    const req = await postSignedEvent(urlVerificationFixture, {
      devSandbox: true,
    });
    expect(req.headers.get('x-dev-sandbox')).toBe('1');
  });

  it('postUnsignedEvent omits signature headers', () => {
    const req = postUnsignedEvent(urlVerificationFixture);
    expect(req.headers.get('x-slack-signature')).toBeNull();
    expect(req.headers.get('x-slack-request-timestamp')).toBeNull();
  });
});
