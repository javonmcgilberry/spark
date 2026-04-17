-- Per-viewer Atlassian OAuth tokens.
--
-- Keyed on the viewer's email (the same identity CF Access asserts for
-- the manager session) so lookups during a request are a single
-- prepared-statement round trip. Each row binds to a single Atlassian
-- cloud (site) because that's what Atlassian's OAuth access tokens are
-- scoped to. If we ever need multi-site-per-user, add a composite key.

CREATE TABLE IF NOT EXISTS atlassian_tokens (
  user_email    TEXT PRIMARY KEY,
  access_token  TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  cloud_id      TEXT NOT NULL,
  cloud_url     TEXT NOT NULL,
  cloud_name    TEXT NOT NULL,
  scope         TEXT NOT NULL,
  expires_at    INTEGER NOT NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
