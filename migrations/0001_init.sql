-- GENERATED schema.
-- Legacy tables matching types.ts contract

CREATE TABLE IF NOT EXISTS readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  photo TEXT,
  latitude REAL,
  longitude REAL,
  numeric_value REAL,
  timestamp TEXT,
  encrypted_blob TEXT,
  sync_status TEXT,
  sync_attempts INTEGER,
  dedupe_id TEXT,
  site_id INTEGER,
  device_id INTEGER,
  equipment_id INTEGER,
  calibration_id INTEGER,
  row_version INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS readings_site_id_idx ON readings (site_id);
CREATE INDEX IF NOT EXISTS readings_device_id_idx ON readings (device_id);
CREATE INDEX IF NOT EXISTS readings_equipment_id_idx ON readings (equipment_id);
CREATE INDEX IF NOT EXISTS readings_calibration_id_idx ON readings (calibration_id);

CREATE TABLE IF NOT EXISTS sites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  latitude REAL,
  longitude REAL,
  mean_value REAL,
  std_dev REAL,
  last_sync TEXT,
  sync_success_rate REAL,
  technician_email TEXT,
  status TEXT,
  zone_id INTEGER,
  row_version INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS sites_zone_id_idx ON sites (zone_id);
CREATE INDEX IF NOT EXISTS sites_status_idx ON sites (status);

CREATE TABLE IF NOT EXISTS sync_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reading_id INTEGER,
  attempted_at TEXT,
  status TEXT,
  response_code INTEGER,
  error_message TEXT,
  sync_policy_id INTEGER,
  row_version INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS sync_logs_reading_id_idx ON sync_logs (reading_id);
CREATE INDEX IF NOT EXISTS sync_logs_sync_policy_id_idx ON sync_logs (sync_policy_id);

CREATE TABLE IF NOT EXISTS encryption_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  derived_key TEXT,
  salt TEXT,
  iterations INTEGER,
  device_fingerprint TEXT,
  created_at TEXT,
  is_active INTEGER,
  device_id INTEGER,
  row_version INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS encryption_keys_device_id_idx ON encryption_keys (device_id);

CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_agent TEXT,
  screen_width INTEGER,
  screen_height INTEGER,
  hardware_concurrency INTEGER,
  last_seen TEXT,
  technician_email TEXT,
  status TEXT,
  battery_level INTEGER,
  row_version INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS devices_status_idx ON devices (status);

CREATE TABLE IF NOT EXISTS outliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reading_id INTEGER,
  detected_at TEXT,
  z_score REAL,
  is_resolved INTEGER,
  resolved_at TEXT,
  resolved_by TEXT,
  site_id INTEGER,
  notification_id INTEGER,
  row_version INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS outliers_reading_id_idx ON outliers (reading_id);
CREATE INDEX IF NOT EXISTS outliers_site_id_idx ON outliers (site_id);
CREATE INDEX IF NOT EXISTS outliers_notification_id_idx ON outliers (notification_id);

CREATE TABLE IF NOT EXISTS sync_thresholds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  max_attempts INTEGER,
  action TEXT,
  is_active INTEGER,
  created_at TEXT,
  updated_at TEXT,
  row_version INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS sync_thresholds_action_idx ON sync_thresholds (action);

CREATE TABLE IF NOT EXISTS passphrases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hash TEXT,
  salt TEXT,
  is_set INTEGER,
  set_at TEXT,
  device_id INTEGER,
  failed_attempts INTEGER,
  row_version INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS passphrases_device_id_idx ON passphrases (device_id);

CREATE TABLE IF NOT EXISTS daily_aggregates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT,
  total_readings INTEGER,
  synced_readings INTEGER,
  failed_readings INTEGER,
  avg_numeric_value REAL,
  site_id INTEGER,
  zone_id INTEGER,
  row_version INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS daily_aggregates_site_id_idx ON daily_aggregates (site_id);
CREATE INDEX IF NOT EXISTS daily_aggregates_zone_id_idx ON daily_aggregates (zone_id);

CREATE TABLE IF NOT EXISTS connectivity_zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  polygon_geojson TEXT,
  sync_success_rate REAL,
  last_updated TEXT,
  technician_email TEXT,
  status TEXT,
  row_version INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS connectivity_zones_status_idx ON connectivity_zones (status);

CREATE TABLE IF NOT EXISTS reading_historys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reading_id INTEGER,
  changed_field TEXT,
  old_value TEXT,
  new_value TEXT,
  changed_at TEXT,
  changed_by TEXT,
  revision_id INTEGER,
  row_version INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS reading_historys_reading_id_idx ON reading_historys (reading_id);

CREATE TABLE IF NOT EXISTS site_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER,
  visit_date TEXT,
  purpose TEXT,
  notes TEXT,
  technician_email TEXT,
  status TEXT,
  equipment_id INTEGER,
  row_version INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS site_visits_site_id_idx ON site_visits (site_id);
CREATE INDEX IF NOT EXISTS site_visits_equipment_id_idx ON site_visits (equipment_id);

CREATE TABLE IF NOT EXISTS equipments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  serial_number TEXT,
  type TEXT,
  installation_date TEXT,
  last_calibration TEXT,
  site_id INTEGER,
  status TEXT,
  warranty_expiry TEXT,
  row_version INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS equipments_site_id_idx ON equipments (site_id);

CREATE TABLE IF NOT EXISTS calibration_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipment_id INTEGER,
  calibrated_at TEXT,
  calibrated_by TEXT,
  next_calibration TEXT,
  notes TEXT,
  status TEXT,
  reading_id INTEGER,
  row_version INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS calibration_logs_equipment_id_idx ON calibration_logs (equipment_id);
CREATE INDEX IF NOT EXISTS calibration_logs_reading_id_idx ON calibration_logs (reading_id);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient_email TEXT,
  type TEXT,
  content TEXT,
  is_read INTEGER,
  created_at TEXT,
  related_entity_id INTEGER,
  related_entity_type TEXT,
  row_version INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS sync_policys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  min_battery_level INTEGER,
  min_network_strength INTEGER,
  retry_interval INTEGER,
  is_active INTEGER,
  created_at TEXT,
  updated_at TEXT,
  zone_id INTEGER,
  row_version INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS sync_policys_zone_id_idx ON sync_policys (zone_id);

CREATE TABLE IF NOT EXISTS audit_trails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT,
  entity_id INTEGER,
  action TEXT,
  performed_at TEXT,
  performed_by TEXT,
  metadata TEXT,
  device_id INTEGER,
  row_version INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS audit_trails_entity_idx ON audit_trails (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_trails_device_id_idx ON audit_trails (device_id);

CREATE TABLE IF NOT EXISTS maintenance_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipment_id INTEGER,
  scheduled_date TEXT,
  type TEXT,
  status TEXT,
  notes TEXT,
  technician_email TEXT,
  row_version INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS maintenance_schedules_equipment_id_idx ON maintenance_schedules (equipment_id);