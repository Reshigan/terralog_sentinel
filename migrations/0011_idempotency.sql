-- GENERATED idempotency ledger. One row per (tenant, key, endpoint) accepted.
CREATE TABLE IF NOT EXISTS idempotency (
  tenant TEXT NOT NULL,
  key TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  row_id INTEGER NOT NULL,
  at TEXT NOT NULL,
  PRIMARY KEY (tenant, key, endpoint)
);
-- Retention sweep: the ledger is only useful for as long as a client might retry.
-- Nothing prunes it automatically (a generated app has no cron beyond the job
-- drain); this index is what makes "DELETE FROM idempotency WHERE at < ?" cheap
-- when an operator or a later migration wants the space back.
CREATE INDEX IF NOT EXISTS idempotency_at_idx ON idempotency (at);
