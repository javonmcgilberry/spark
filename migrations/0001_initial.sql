-- Spark: initial D1 schema.
--
-- One row per onboarding package, keyed by the hire's Slack user id.
-- The full package JSON lives in `data` so schema drift in
-- OnboardingPackage never requires a D1 migration. `manager_id` and
-- `status` are denormalized so we can index lookups by manager without
-- parsing JSON.

CREATE TABLE IF NOT EXISTS drafts (
  user_id    TEXT PRIMARY KEY,
  manager_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('draft', 'published')),
  data       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_drafts_manager
  ON drafts (manager_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_drafts_created_by
  ON drafts (created_by, status, updated_at DESC);
