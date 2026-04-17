/**
 * Per-viewer Atlassian OAuth token storage.
 *
 * Tokens are keyed on the viewer's email (the identity Cloudflare
 * Access asserts on every Webflow Inside request), not on Slack user
 * id — because email is what Atlassian's OAuth flow already round-trips
 * and we want a single consistent identity across integrations.
 *
 * Two implementations:
 *   - D1-backed for prod / Workers preview (reads from
 *     `env.DRAFTS_DB`; the existing binding covers both migrations).
 *   - In-memory for tests and local dev without a D1 binding.
 */

export interface AtlassianTokenRecord {
  userEmail: string;
  accessToken: string;
  refreshToken: string;
  cloudId: string;
  cloudUrl: string;
  cloudName: string;
  scope: string;
  expiresAt: number; // epoch ms
  createdAt: number; // epoch ms
  updatedAt: number; // epoch ms
}

export interface AtlassianTokenStore {
  get(userEmail: string): Promise<AtlassianTokenRecord | null>;
  save(record: AtlassianTokenRecord): Promise<void>;
  delete(userEmail: string): Promise<void>;
}

interface D1Like {
  prepare(query: string): D1PreparedLike;
}
interface D1PreparedLike {
  bind(...values: unknown[]): D1PreparedLike;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<unknown>;
}

interface RawTokenRow {
  user_email: string;
  access_token: string;
  refresh_token: string;
  cloud_id: string;
  cloud_url: string;
  cloud_name: string;
  scope: string;
  expires_at: number;
  created_at: number;
  updated_at: number;
}

export function makeD1AtlassianTokenStore(db: D1Like): AtlassianTokenStore {
  return {
    async get(userEmail) {
      const row = await db
        .prepare(
          `SELECT user_email, access_token, refresh_token, cloud_id,
                  cloud_url, cloud_name, scope, expires_at, created_at,
                  updated_at
             FROM atlassian_tokens
             WHERE user_email = ?`
        )
        .bind(userEmail)
        .first<RawTokenRow>();
      return row ? fromRow(row) : null;
    },
    async save(record) {
      await db
        .prepare(
          `INSERT INTO atlassian_tokens (
             user_email, access_token, refresh_token, cloud_id,
             cloud_url, cloud_name, scope, expires_at, created_at,
             updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_email) DO UPDATE SET
             access_token  = excluded.access_token,
             refresh_token = excluded.refresh_token,
             cloud_id      = excluded.cloud_id,
             cloud_url     = excluded.cloud_url,
             cloud_name    = excluded.cloud_name,
             scope         = excluded.scope,
             expires_at    = excluded.expires_at,
             updated_at    = excluded.updated_at`
        )
        .bind(
          record.userEmail,
          record.accessToken,
          record.refreshToken,
          record.cloudId,
          record.cloudUrl,
          record.cloudName,
          record.scope,
          record.expiresAt,
          record.createdAt,
          record.updatedAt
        )
        .run();
    },
    async delete(userEmail) {
      await db
        .prepare(`DELETE FROM atlassian_tokens WHERE user_email = ?`)
        .bind(userEmail)
        .run();
    },
  };
}

export function makeMemoryAtlassianTokenStore(): AtlassianTokenStore {
  const records = new Map<string, AtlassianTokenRecord>();
  return {
    async get(email) {
      return records.get(email) ?? null;
    },
    async save(record) {
      records.set(record.userEmail, record);
    },
    async delete(email) {
      records.delete(email);
    },
  };
}

function fromRow(row: RawTokenRow): AtlassianTokenRecord {
  return {
    userEmail: row.user_email,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    cloudId: row.cloud_id,
    cloudUrl: row.cloud_url,
    cloudName: row.cloud_name,
    scope: row.scope,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
