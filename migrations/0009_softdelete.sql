-- GENERATED soft delete: the tombstone column + the index the live filter rides.
ALTER TABLE readings ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS readings_tenant_live_idx ON readings (tenant, id) WHERE deleted_at IS NULL;

ALTER TABLE sites ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS sites_tenant_live_idx ON sites (tenant, id) WHERE deleted_at IS NULL;

ALTER TABLE sync_logs ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS sync_logs_tenant_live_idx ON sync_logs (tenant, id) WHERE deleted_at IS NULL;

ALTER TABLE encryption_keys ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS encryption_keys_tenant_live_idx ON encryption_keys (tenant, id) WHERE deleted_at IS NULL;

ALTER TABLE devices ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS devices_tenant_live_idx ON devices (tenant, id) WHERE deleted_at IS NULL;

ALTER TABLE outliers ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS outliers_tenant_live_idx ON outliers (tenant, id) WHERE deleted_at IS NULL;

ALTER TABLE sync_thresholds ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS sync_thresholds_tenant_live_idx ON sync_thresholds (tenant, id) WHERE deleted_at IS NULL;

ALTER TABLE passphrases ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS passphrases_tenant_live_idx ON passphrases (tenant, id) WHERE deleted_at IS NULL;

ALTER TABLE daily_aggregates ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS daily_aggregates_tenant_live_idx ON daily_aggregates (tenant, id) WHERE deleted_at IS NULL;

ALTER TABLE connectivity_zones ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS connectivity_zones_tenant_live_idx ON connectivity_zones (tenant, id) WHERE deleted_at IS NULL;

ALTER TABLE reading_historys ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS reading_historys_tenant_live_idx ON reading_historys (tenant, id) WHERE deleted_at IS NULL;

ALTER TABLE site_visits ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS site_visits_tenant_live_idx ON site_visits (tenant, id) WHERE deleted_at IS NULL;

ALTER TABLE equipments ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS equipments_tenant_live_idx ON equipments (tenant, id) WHERE deleted_at IS NULL;

ALTER TABLE calibration_logs ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS calibration_logs_tenant_live_idx ON calibration_logs (tenant, id) WHERE deleted_at IS NULL;

ALTER TABLE notifications ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS notifications_tenant_live_idx ON notifications (tenant, id) WHERE deleted_at IS NULL;

ALTER TABLE sync_policys ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS sync_policys_tenant_live_idx ON sync_policys (tenant, id) WHERE deleted_at IS NULL;

ALTER TABLE audit_trails ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS audit_trails_tenant_live_idx ON audit_trails (tenant, id) WHERE deleted_at IS NULL;

ALTER TABLE maintenance_schedules ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS maintenance_schedules_tenant_live_idx ON maintenance_schedules (tenant, id) WHERE deleted_at IS NULL;
