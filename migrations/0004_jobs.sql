-- GENERATED jobs schema. A row here IS the queue: a Cron Trigger drains this
-- table (see src/lib/jobs.ts + scheduled() in src/index.ts). status moves
-- pending -> running -> done; a failed attempt goes back to 'pending' with an
-- exponentially later run_at until attempts reaches max_attempts, at which point
-- it becomes 'dead' — the dead-letter, which is never retried and never lost.
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT 'null',   -- JSON
  -- The state machine is a DB constraint, not a convention: a typo'd status can
  -- never be written, so the drain's WHERE clauses can be trusted.
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'dead')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  run_at TEXT NOT NULL,                   -- ISO-8601: lexicographic order IS chronological
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- (1) The operator's view: one workspace's queue and dead-letter, newest first.
-- Tenant-leading, like every other index in a generated app — without the leading
-- column one workspace's page scans every other workspace's rows.
CREATE INDEX IF NOT EXISTS jobs_tenant_status_idx ON jobs (tenant, status, created_at DESC, id DESC);
-- (2) The drain's one query, on every cron tick and ACROSS tenants: due pending
-- work. It leads with (status, run_at) on purpose — a tenant-leading index cannot
-- serve a query that has no tenant, and this is the only such read in the app.
CREATE INDEX IF NOT EXISTS jobs_due_idx ON jobs (status, run_at);
