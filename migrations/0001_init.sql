-- GENERATED schema.
CREATE TABLE IF NOT EXISTS readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL DEFAULT 'default',
  capture_timestamp TEXT,
  latitude REAL,
  longitude REAL,
  numeric_value REAL,
  photo_blob_id TEXT,
  encrypted_blob TEXT,
  sync_status TEXT,
  sync_attempts INTEGER,
  device_fingerprint TEXT,
  dedupe_id TEXT,
  erasure_policy_id INTEGER,
  reading_type_id INTEGER,
  site_id INTEGER,
  technician_id INTEGER,
  weather_conditions TEXT,
  equipment_used TEXT,
  notes TEXT,
  UNIQUE (id, tenant),
  FOREIGN KEY (erasure_policy_id, tenant) REFERENCES erasure_policys(id, tenant),
  FOREIGN KEY (reading_type_id, tenant) REFERENCES reading_types(id, tenant),
  FOREIGN KEY (site_id, tenant) REFERENCES sites(id, tenant),
  FOREIGN KEY (technician_id, tenant) REFERENCES technicians(id, tenant)
);
CREATE INDEX IF NOT EXISTS readings_tenant_erasure_policy_id_idx ON readings (tenant, erasure_policy_id);
CREATE INDEX IF NOT EXISTS readings_tenant_reading_type_id_idx ON readings (tenant, reading_type_id);
CREATE INDEX IF NOT EXISTS readings_tenant_site_id_idx ON readings (tenant, site_id);
CREATE INDEX IF NOT EXISTS readings_tenant_technician_id_idx ON readings (tenant, technician_id);
CREATE INDEX IF NOT EXISTS readings_tenant_sync_status_idx ON readings (tenant, sync_status);

CREATE TABLE IF NOT EXISTS sync_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL DEFAULT 'default',
  reading_id INTEGER,
  attempt_timestamp TEXT,
  status TEXT,
  http_status INTEGER,
  error_message TEXT,
  retry_count INTEGER,
  sync_session_id INTEGER,
  bytes_transferred INTEGER,
  duration_ms INTEGER,
  endpoint_url TEXT,
  UNIQUE (id, tenant),
  FOREIGN KEY (reading_id, tenant) REFERENCES readings(id, tenant),
  FOREIGN KEY (sync_session_id, tenant) REFERENCES sync_sessions(id, tenant)
);
CREATE INDEX IF NOT EXISTS sync_logs_tenant_reading_id_idx ON sync_logs (tenant, reading_id);
CREATE INDEX IF NOT EXISTS sync_logs_tenant_sync_session_id_idx ON sync_logs (tenant, sync_session_id);

CREATE TABLE IF NOT EXISTS encryption_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL DEFAULT 'default',
  salt TEXT,
  derived_at TEXT,
  device_fingerprint TEXT,
  is_active INTEGER,
  erased_at TEXT,
  device_id INTEGER,
  key_status TEXT,
  passphrase_strength INTEGER,
  key_algorithm TEXT,
  key_iterations INTEGER,
  UNIQUE (id, tenant),
  FOREIGN KEY (device_id, tenant) REFERENCES devices(id, tenant)
);
CREATE INDEX IF NOT EXISTS encryption_keys_tenant_device_id_idx ON encryption_keys (tenant, device_id);
CREATE INDEX IF NOT EXISTS encryption_keys_tenant_key_status_idx ON encryption_keys (tenant, key_status);

CREATE TABLE IF NOT EXISTS erasure_policys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL DEFAULT 'default',
  name TEXT,
  max_attempts INTEGER,
  erase_after_days INTEGER,
  description TEXT,
  is_active INTEGER,
  policy_type TEXT,
  notification_days INTEGER,
  created_by TEXT,
  created_at TEXT,
  updated_at TEXT,
  UNIQUE (id, tenant)
);
CREATE INDEX IF NOT EXISTS erasure_policys_tenant_idx ON erasure_policys (tenant);

CREATE TABLE IF NOT EXISTS anomalys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL DEFAULT 'default',
  reading_id INTEGER,
  grid_cell_id INTEGER,
  cell_mean REAL,
  cell_stddev REAL,
  z_score REAL,
  detected_at TEXT,
  resolved_at TEXT,
  resolution_notes TEXT,
  status TEXT,
  assigned_to INTEGER,
  severity TEXT,
  follow_up_required INTEGER,
  UNIQUE (id, tenant),
  FOREIGN KEY (reading_id, tenant) REFERENCES readings(id, tenant),
  FOREIGN KEY (grid_cell_id, tenant) REFERENCES grid_cells(id, tenant),
  FOREIGN KEY (assigned_to, tenant) REFERENCES technicians(id, tenant)
);
CREATE INDEX IF NOT EXISTS anomalys_tenant_reading_id_idx ON anomalys (tenant, reading_id);
CREATE INDEX IF NOT EXISTS anomalys_tenant_grid_cell_id_idx ON anomalys (tenant, grid_cell_id);
CREATE INDEX IF NOT EXISTS anomalys_tenant_assigned_to_idx ON anomalys (tenant, assigned_to);
CREATE INDEX IF NOT EXISTS anomalys_tenant_status_idx ON anomalys (tenant, status);

CREATE TABLE IF NOT EXISTS grid_cells (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL DEFAULT 'default',
  grid_size_meters INTEGER,
  cell_hash TEXT,
  latitude_min REAL,
  latitude_max REAL,
  longitude_min REAL,
  longitude_max REAL,
  last_updated TEXT,
  site_id INTEGER,
  reading_count INTEGER,
  avg_value REAL,
  UNIQUE (id, tenant),
  FOREIGN KEY (site_id, tenant) REFERENCES sites(id, tenant)
);
CREATE INDEX IF NOT EXISTS grid_cells_tenant_site_id_idx ON grid_cells (tenant, site_id);

CREATE TABLE IF NOT EXISTS technicians (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL DEFAULT 'default',
  name TEXT,
  email TEXT,
  device_id TEXT,
  last_active TEXT,
  is_active INTEGER,
  status TEXT,
  hire_date TEXT,
  supervisor_id INTEGER,
  certification_level TEXT,
  phone_number TEXT,
  emergency_contact TEXT,
  UNIQUE (id, tenant),
  FOREIGN KEY (supervisor_id, tenant) REFERENCES technicians(id, tenant)
);
CREATE INDEX IF NOT EXISTS technicians_tenant_supervisor_id_idx ON technicians (tenant, supervisor_id);
CREATE INDEX IF NOT EXISTS technicians_tenant_status_idx ON technicians (tenant, status);

CREATE TABLE IF NOT EXISTS sites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL DEFAULT 'default',
  name TEXT,
  latitude REAL,
  longitude REAL,
  description TEXT,
  is_active INTEGER,
  site_type TEXT,
  region_id INTEGER,
  status TEXT,
  installation_date TEXT,
  last_inspection_date TEXT,
  maintenance_frequency_days INTEGER,
  UNIQUE (id, tenant),
  FOREIGN KEY (region_id, tenant) REFERENCES regions(id, tenant)
);
CREATE INDEX IF NOT EXISTS sites_tenant_region_id_idx ON sites (tenant, region_id);
CREATE INDEX IF NOT EXISTS sites_tenant_status_idx ON sites (tenant, status);

CREATE TABLE IF NOT EXISTS reading_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL DEFAULT 'default',
  name TEXT,
  unit TEXT,
  description TEXT,
  min_value REAL,
  max_value REAL,
  is_active INTEGER,
  category TEXT,
  expected_frequency_hours INTEGER,
  critical_threshold REAL,
  warning_threshold REAL,
  UNIQUE (id, tenant)
);
CREATE INDEX IF NOT EXISTS reading_types_tenant_idx ON reading_types (tenant);

CREATE TABLE IF NOT EXISTS sync_policys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL DEFAULT 'default',
  name TEXT,
  max_attempts INTEGER,
  retry_interval_seconds INTEGER,
  description TEXT,
  is_active INTEGER,
  backoff_strategy TEXT,
  min_backoff_seconds INTEGER,
  max_backoff_seconds INTEGER,
  created_by TEXT,
  created_at TEXT,
  UNIQUE (id, tenant)
);
CREATE INDEX IF NOT EXISTS sync_policys_tenant_idx ON sync_policys (tenant);

CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL DEFAULT 'default',
  fingerprint TEXT,
  user_agent TEXT,
  screen_width INTEGER,
  screen_height INTEGER,
  hardware_concurrency INTEGER,
  last_seen TEXT,
  status TEXT,
  technician_id INTEGER,
  os_version TEXT,
  battery_level INTEGER,
  storage_available_mb INTEGER,
  UNIQUE (id, tenant),
  FOREIGN KEY (technician_id, tenant) REFERENCES technicians(id, tenant)
);
CREATE INDEX IF NOT EXISTS devices_tenant_technician_id_idx ON devices (tenant, technician_id);
CREATE INDEX IF NOT EXISTS devices_tenant_status_idx ON devices (tenant, status);

CREATE TABLE IF NOT EXISTS permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL DEFAULT 'default',
  technician_id INTEGER,
  site_id INTEGER,
  can_read INTEGER,
  can_write INTEGER,
  can_erase INTEGER,
  is_active INTEGER,
  granted_by TEXT,
  granted_at TEXT,
  expires_at TEXT,
  notes TEXT,
  UNIQUE (id, tenant),
  FOREIGN KEY (technician_id, tenant) REFERENCES technicians(id, tenant),
  FOREIGN KEY (site_id, tenant) REFERENCES sites(id, tenant)
);
CREATE INDEX IF NOT EXISTS permissions_tenant_technician_id_idx ON permissions (tenant, technician_id);
CREATE INDEX IF NOT EXISTS permissions_tenant_site_id_idx ON permissions (tenant, site_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL DEFAULT 'default',
  entity_type TEXT,
  entity_id INTEGER,
  action TEXT,
  performed_by TEXT,
  performed_at TEXT,
  metadata TEXT,
  ip_address TEXT,
  user_agent TEXT,
  changes TEXT,
  session_id TEXT,
  UNIQUE (id, tenant)
);
CREATE INDEX IF NOT EXISTS audit_logs_tenant_idx ON audit_logs (tenant);

CREATE TABLE IF NOT EXISTS regions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL DEFAULT 'default',
  name TEXT,
  description TEXT,
  is_active INTEGER,
  manager_id INTEGER,
  latitude REAL,
  longitude REAL,
  geofence_radius_meters INTEGER,
  timezone TEXT,
  operational_hours TEXT,
  UNIQUE (id, tenant),
  FOREIGN KEY (manager_id, tenant) REFERENCES technicians(id, tenant)
);
CREATE INDEX IF NOT EXISTS regions_tenant_manager_id_idx ON regions (tenant, manager_id);

CREATE TABLE IF NOT EXISTS maintenance_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL DEFAULT 'default',
  site_id INTEGER,
  scheduled_date TEXT,
  description TEXT,
  status TEXT,
  technician_id INTEGER,
  completed_at TEXT,
  priority TEXT,
  estimated_duration_hours INTEGER,
  actual_duration_hours INTEGER,
  notes TEXT,
  UNIQUE (id, tenant),
  FOREIGN KEY (site_id, tenant) REFERENCES sites(id, tenant),
  FOREIGN KEY (technician_id, tenant) REFERENCES technicians(id, tenant)
);
CREATE INDEX IF NOT EXISTS maintenance_schedules_tenant_site_id_idx ON maintenance_schedules (tenant, site_id);
CREATE INDEX IF NOT EXISTS maintenance_schedules_tenant_technician_id_idx ON maintenance_schedules (tenant, technician_id);
CREATE INDEX IF NOT EXISTS maintenance_schedules_tenant_status_idx ON maintenance_schedules (tenant, status);

CREATE TABLE IF NOT EXISTS photo_blobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL DEFAULT 'default',
  blob_id TEXT,
  reading_id INTEGER,
  uploaded_at TEXT,
  size_bytes INTEGER,
  mime_type TEXT,
  storage_path TEXT,
  checksum TEXT,
  is_encrypted INTEGER,
  encryption_key_id INTEGER,
  thumbnail_blob_id TEXT,
  UNIQUE (id, tenant),
  FOREIGN KEY (reading_id, tenant) REFERENCES readings(id, tenant),
  FOREIGN KEY (encryption_key_id, tenant) REFERENCES encryption_keys(id, tenant)
);
CREATE INDEX IF NOT EXISTS photo_blobs_tenant_reading_id_idx ON photo_blobs (tenant, reading_id);
CREATE INDEX IF NOT EXISTS photo_blobs_tenant_encryption_key_id_idx ON photo_blobs (tenant, encryption_key_id);

CREATE TABLE IF NOT EXISTS sync_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL DEFAULT 'default',
  started_at TEXT,
  ended_at TEXT,
  status TEXT,
  readings_count INTEGER,
  bytes_transferred INTEGER,
  technician_id INTEGER,
  device_id INTEGER,
  sync_policy_id INTEGER,
  network_type TEXT,
  duration_seconds INTEGER,
  UNIQUE (id, tenant),
  FOREIGN KEY (technician_id, tenant) REFERENCES technicians(id, tenant),
  FOREIGN KEY (device_id, tenant) REFERENCES devices(id, tenant),
  FOREIGN KEY (sync_policy_id, tenant) REFERENCES sync_policys(id, tenant)
);
CREATE INDEX IF NOT EXISTS sync_sessions_tenant_technician_id_idx ON sync_sessions (tenant, technician_id);
CREATE INDEX IF NOT EXISTS sync_sessions_tenant_device_id_idx ON sync_sessions (tenant, device_id);
CREATE INDEX IF NOT EXISTS sync_sessions_tenant_sync_policy_id_idx ON sync_sessions (tenant, sync_policy_id);
CREATE INDEX IF NOT EXISTS sync_sessions_tenant_status_idx ON sync_sessions (tenant, status);
