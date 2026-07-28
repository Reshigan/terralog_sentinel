-- GENERATED soft delete: the tombstone column + the index the live filter rides.
ALTER TABLE readings ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS readings_tenant_live_idx ON readings (tenant, id) WHERE deleted_at IS NULL;

ALTER TABLE sync_logs ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS sync_logs_tenant_live_idx ON sync_logs (tenant, id) WHERE deleted_at IS NULL;

ALTER TABLE encryption_keys ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS encryption_keys_tenant_live_idx ON encryption_keys (tenant, id) WHERE deleted_at IS NULL;

ALTER TABLE erasure_policys ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS erasure_policys_tenant_live_idx ON erasure_policys (tenant, id) WHERE deleted_at IS NULL;

ALTER TABLE anomalys ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS anomalys_tenant_live_idx ON anomalys (tenant, id) WHERE deleted_at IS NULL;

ALTER TABLE grid_cells ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS grid_cells_tenant_live_idx ON grid_cells (tenant, id) WHERE deleted_at IS NULL;

ALTER TABLE technicians ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS technicians_tenant_live_idx ON technicians (tenant, id) WHERE deleted_at IS NULL;

ALTER TABLE sites ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS sites_tenant_live_idx ON sites (tenant, id) WHERE deleted_at IS NULL;

ALTER TABLE reading_types ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS reading_types_tenant_live_idx ON reading_types (tenant, id) WHERE deleted_at IS NULL;

ALTER TABLE sync_policys ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS sync_policys_tenant_live_idx ON sync_policys (tenant, id) WHERE deleted_at IS NULL;

ALTER TABLE devices ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS devices_tenant_live_idx ON devices (tenant, id) WHERE deleted_at IS NULL;

ALTER TABLE permissions ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS permissions_tenant_live_idx ON permissions (tenant, id) WHERE deleted_at IS NULL;

ALTER TABLE audit_logs ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS audit_logs_tenant_live_idx ON audit_logs (tenant, id) WHERE deleted_at IS NULL;

ALTER TABLE regions ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS regions_tenant_live_idx ON regions (tenant, id) WHERE deleted_at IS NULL;

ALTER TABLE maintenance_schedules ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS maintenance_schedules_tenant_live_idx ON maintenance_schedules (tenant, id) WHERE deleted_at IS NULL;

ALTER TABLE photo_blobs ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS photo_blobs_tenant_live_idx ON photo_blobs (tenant, id) WHERE deleted_at IS NULL;

ALTER TABLE sync_sessions ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS sync_sessions_tenant_live_idx ON sync_sessions (tenant, id) WHERE deleted_at IS NULL;
