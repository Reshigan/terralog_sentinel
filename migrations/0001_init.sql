-- Schema: Terminus field data collection
-- Tables: readings, sync_logs, encryption_keys

CREATE TABLE IF NOT EXISTS readings (
  id TEXT PRIMARY KEY,
  tenant TEXT NOT NULL DEFAULT 'default',
  photo_iv TEXT,
  photo_ciphertext TEXT,
  latitude REAL,
  longitude REAL,
  numeric_value REAL,
  timestamp TEXT,
  sync_status TEXT DEFAULT 'pending',
  sync_attempts INTEGER DEFAULT 0,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS readings_tenant_idx ON readings (tenant);
CREATE INDEX IF NOT EXISTS readings_sync_status_idx ON readings (sync_status);
CREATE INDEX IF NOT EXISTS readings_created_at_idx ON readings (created_at);

CREATE TABLE IF NOT EXISTS sync_logs (
  id TEXT PRIMARY KEY,
  tenant TEXT NOT NULL DEFAULT 'default',
  reading_id TEXT,
  status TEXT,
  attempt_at TEXT,
  error TEXT
);
CREATE INDEX IF NOT EXISTS sync_logs_tenant_idx ON sync_logs (tenant);
CREATE INDEX IF NOT EXISTS sync_logs_reading_id_idx ON sync_logs (reading_id);
CREATE INDEX IF NOT EXISTS sync_logs_created_at_idx ON sync_logs (attempt_at);

CREATE TABLE IF NOT EXISTS encryption_keys (
  tenant TEXT PRIMARY KEY,
  salt TEXT,
  key_iv TEXT,
  encrypted_key TEXT,
  created_at TEXT
);
