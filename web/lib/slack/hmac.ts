/**
 * Slack signature helpers using Web Crypto (available on Workers and
 * modern Node). Same primitive used to verify inbound events and to
 * mint test requests — by sharing the helper the sandbox page's
 * outgoing signature provably matches what Slack would send.
 *
 * Reference: https://api.slack.com/authentication/verifying-requests-from-slack
 */

const encoder = new TextEncoder();

/** Compute `v0:<timestamp>:<body>` HMAC-SHA256, hex-encoded. */
export async function computeSlackSignatureBase(
  timestamp: string,
  body: string,
  signingSecret: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const basestring = `v0:${timestamp}:${body}`;
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(basestring),
  );
  return `v0=${bufferToHex(signature)}`;
}

export interface VerifyOptions {
  /** Max clock skew in seconds. Default 5 minutes per Slack's recommendation. */
  maxSkewSeconds?: number;
  /** Override `Date.now()` (ms). Useful for tests. */
  now?: () => number;
}

/**
 * Verify an inbound Slack request's HMAC signature + timestamp skew.
 * Returns the reason a request was rejected, or null on success.
 */
export async function verifySlackSignature(
  body: string,
  signature: string | null,
  timestamp: string | null,
  signingSecret: string,
  options: VerifyOptions = {},
): Promise<null | string> {
  if (!signature || !timestamp) return "missing signature or timestamp";
  const now = (options.now ?? Date.now)();
  const maxSkew = (options.maxSkewSeconds ?? 300) * 1000;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return "invalid timestamp";
  if (Math.abs(now - ts * 1000) > maxSkew) return "timestamp outside skew";
  const expected = await computeSlackSignatureBase(
    timestamp,
    body,
    signingSecret,
  );
  if (!constantTimeEqual(expected, signature)) return "signature mismatch";
  return null;
}

function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = "";
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, "0");
  }
  return out;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
