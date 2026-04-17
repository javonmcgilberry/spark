/**
 * Given a HandlerCtx, returns the current viewer's live Atlassian
 * OAuth token — refreshing transparently if the stored access_token
 * expires within 60s. Returns null if:
 *
 *   - the viewer has not connected (no row in atlassian_tokens)
 *   - the viewer email is unknown (no session)
 *   - the D1 binding is missing (local dev w/ in-memory store only)
 *   - refresh failed (token revoked, client secret rotated, etc.)
 *
 * Cached in ctx.scratch so a single request doesn't hit D1 twice.
 */

import type {Logger} from '../logger';
import {
  makeD1AtlassianTokenStore,
  makeMemoryAtlassianTokenStore,
  type AtlassianTokenRecord,
  type AtlassianTokenStore,
} from './atlassianTokenStore';
import {
  AtlassianOAuthError,
  refreshAccessToken,
  type TokenResponse,
} from './atlassianOAuth';

export interface AtlassianOAuthHandle {
  accessToken: string;
  cloudId: string;
  cloudUrl: string;
  cloudName: string;
  scope: string;
  expiresAt: number;
}

const SCRATCH_KEY = '__atlassianOAuthResolution';
const REFRESH_LEEWAY_MS = 60 * 1000;

/**
 * Minimal shape of HandlerCtx that this module cares about. Declared
 * inline so we don't circular-import HandlerCtx from ../ctx.
 */
export interface AtlassianSessionCtx {
  env: CloudflareEnv;
  logger: Logger;
  scratch: Record<string, unknown>;
  viewerEmail?: string;
}

/**
 * Resolve (and cache) the viewer's Atlassian OAuth token. Returns null
 * when disconnected or misconfigured — callers should fall back to
 * Basic auth via env when null.
 */
export async function resolveAtlassianOAuth(
  ctx: AtlassianSessionCtx
): Promise<AtlassianOAuthHandle | null> {
  if (SCRATCH_KEY in ctx.scratch) {
    return ctx.scratch[SCRATCH_KEY] as AtlassianOAuthHandle | null;
  }
  const handle = await resolveUncached(ctx);
  ctx.scratch[SCRATCH_KEY] = handle;
  return handle;
}

async function resolveUncached(
  ctx: AtlassianSessionCtx
): Promise<AtlassianOAuthHandle | null> {
  if (!ctx.viewerEmail) return null;
  const store = resolveStore(ctx);
  if (!store) return null;

  const stored = await store.get(ctx.viewerEmail);
  if (!stored) return null;

  if (stored.expiresAt > Date.now() + REFRESH_LEEWAY_MS) {
    return toHandle(stored);
  }

  const clientId = ctx.env.ATLASSIAN_OAUTH_CLIENT_ID;
  const clientSecret = ctx.env.ATLASSIAN_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    ctx.logger.warn(
      'Atlassian token needs refresh but ATLASSIAN_OAUTH_CLIENT_ID / SECRET are not set.'
    );
    return null;
  }

  try {
    const refreshed = await refreshAccessToken({
      clientId,
      clientSecret,
      refreshToken: stored.refreshToken,
    });
    const updated = applyRefresh(stored, refreshed);
    await store.save(updated);
    return toHandle(updated);
  } catch (error: unknown) {
    if (error instanceof AtlassianOAuthError && error.status === 400) {
      // Refresh token was revoked or rotated out from under us.
      // Clean up so the UI shows "Connect Jira" again instead of
      // looping on an unrecoverable token.
      ctx.logger.warn(
        `Atlassian refresh failed for ${ctx.viewerEmail}: ${error.message}. Clearing stored token.`
      );
      await store.delete(ctx.viewerEmail);
      return null;
    }
    ctx.logger.warn(
      `Atlassian refresh failed for ${ctx.viewerEmail}; falling back to Basic auth.`,
      error
    );
    return null;
  }
}

function applyRefresh(
  previous: AtlassianTokenRecord,
  response: TokenResponse
): AtlassianTokenRecord {
  const now = Date.now();
  return {
    ...previous,
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    scope: response.scope || previous.scope,
    expiresAt: now + response.expiresIn * 1000,
    updatedAt: now,
  };
}

function toHandle(record: AtlassianTokenRecord): AtlassianOAuthHandle {
  return {
    accessToken: record.accessToken,
    cloudId: record.cloudId,
    cloudUrl: record.cloudUrl,
    cloudName: record.cloudName,
    scope: record.scope,
    expiresAt: record.expiresAt,
  };
}

/**
 * Picks the right token store for the current env — D1 in prod, memory
 * elsewhere. Memory store is request-scoped so "connected" state is
 * only meaningful in a single test or dev-sandbox invocation; that's
 * the point (no D1 binding = no persistence).
 */
export function resolveStore(
  ctx: AtlassianSessionCtx
): AtlassianTokenStore | null {
  const db = (ctx.env as unknown as {DRAFTS_DB?: unknown}).DRAFTS_DB;
  if (
    db &&
    typeof db === 'object' &&
    typeof (db as {prepare?: unknown}).prepare === 'function'
  ) {
    return makeD1AtlassianTokenStore(
      db as Parameters<typeof makeD1AtlassianTokenStore>[0]
    );
  }
  return resolveMemoryStoreFor(ctx);
}

const MEMORY_STORES = new WeakMap<
  Record<string, unknown>,
  AtlassianTokenStore
>();

function resolveMemoryStoreFor(
  ctx: AtlassianSessionCtx
): AtlassianTokenStore | null {
  // Tests and local dev: share one memory store per ctx.scratch so a
  // test can seed a token and then observe it via the service layer.
  // Returns null only when neither D1 nor scratch exists, which shouldn't
  // happen in practice.
  if (!ctx.scratch) return null;
  const existing = MEMORY_STORES.get(ctx.scratch);
  if (existing) return existing;
  const fresh = makeMemoryAtlassianTokenStore();
  MEMORY_STORES.set(ctx.scratch, fresh);
  return fresh;
}
