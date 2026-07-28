-- GENERATED uploads schema. The bytes live in R2 (binding: UPLOADS); this table
-- is the index over them, and the authority on WHO owns each object. `key` is
-- the R2 object key, always '<tenant>/<uuid>' — namespaced so a listing of one
-- workspace's objects is a prefix scan and a cross-tenant key is visibly wrong.
CREATE TABLE IF NOT EXISTS uploads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL,
  key TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  uploaded_by INTEGER NOT NULL
);
-- A key is one object. UNIQUE so a retried write can never leave two rows
-- claiming the same bytes with two different owners.
CREATE UNIQUE INDEX IF NOT EXISTS uploads_key_idx ON uploads (key);
-- The attachment list: one workspace, newest first. Tenant-leading, like every
-- other index in a generated app — without the leading column one workspace's
-- page scans every other workspace's rows.
CREATE INDEX IF NOT EXISTS uploads_tenant_created_idx ON uploads (tenant, created_at DESC, id DESC);
