-- GENERATED schema.
CREATE TABLE IF NOT EXISTS readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL DEFAULT 'default',
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
  created_at TEXT,
  row_version INTEGER,
  UNIQUE (id, tenant),
  FOREIGN KEY (site_id, tenant) REFERENCES sites(id, tenant),
  FOREIGN KEY (device_id, tenant) REFERENCES devices(id, tenant),
  FOREIGN KEY (equipment_id, tenant) REFERENCES equipments(id, tenant),
  FOREIGN KEY (calibration_id, tenant) REFERENCES calibration_logs(id, tenant)
);
CREATE INDEX IF NOT EXISTS readings_tenant_site_id_idx ON readings (tenant, site_id);
CREATE INDEX IF NOT EXISTS readings_tenant_device_id_idx ON readings (tenant, device_id);
CREATE INDEX IF NOT EXISTS readings_tenant_equipment_id_idx ON readings (tenant, equipment_id);
CREATE INDEX IF NOT EXISTS readings_tenant_calibration_id_idx ON readings (tenant, calibration_id);
CREATE INDEX IF NOT EXISTS readings_sync_status_idx ON readings (sync_status);
CREATE INDEX IF NOT EXISTS readings_created_at_idx ON readings (created_at);

CREATE TABLE IF NOT EXISTS sites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL DEFAULT 'default',
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
  created_at TEXT,
  row_version INTEGER,
  UNIQUE (id, tenant),
  FOREIGN KEY (zone_id, tenant) REFERENCES connectivity_zones(id, tenant)
);
CREATE INDEX IF NOT EXISTS sites_tenant_zone_id_idx ON sites (tenant, zone_id);
CREATE INDEX IF NOT EXISTS sites_tenant_status_idx ON sites (tenant, status);
CREATE INDEX IF NOT EXISTS sites_created_at_idx ON sites (created_at);

CREATE TABLE IF NOT EXISTS sync_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL DEFAULT 'default',
  reading_id INTEGER,
  attempted_at TEXT,
  status TEXT,
  response_code INTEGER,
  error_message TEXT,
  sync_policy_id INTEGER,
  created_at TEXT,
  row_version INTEGER,
  UNIQUE (id, tenant),
  FOREIGN KEY (reading_id, tenant) REFERENCES readings(id, tenant),
  FOREIGN KEY (sync_policy_id, tenant) REFERENCES sync_policys(id, tenant)
);
CREATE INDEX IF NOT EXISTS sync_logs_tenant_reading_id_idx ON sync_logs (tenant, reading_id);
CREATE INDEX IF NOT EXISTS sync_logs_tenant_sync_policy_id_idx ON sync_logs (tenant, sync_policy_id);
CREATE INDEX IF NOT EXISTS sync_logs_created_at_idx ON sync_logs (created_at);

CREATE TABLE IF NOT EXISTS encryption_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL DEFAULT 'default',
  derived_key TEXT,
  salt TEXT,
  iterations INTEGER,
  device_fingerprint TEXT,
  created_at TEXT,
  is_active INTEGER,
  device_id INTEGER,
  row_version INTEGER,
  UNIQUE (id, tenant),
  FOREIGN KEY (device_id, tenant) REFERENCES devices(id, tenant)
);
CREATE INDEX IF NOT EXISTS encryption_keys_tenant_device_id_idx ON encryption_keys (tenant, device_id);
CREATE INDEX IF NOT EXISTS encryption_keys_created_at_idx ON encryption_keys (created_at);

CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL DEFAULT 'default',
  user_agent TEXT,
  screen_width INTEGER,
  screen_height INTEGER,
  hardware_concurrency INTEGER,
  last_seen TEXT,
  technician_email TEXT,
  status TEXT,
  battery_level INTEGER,
  created_at TEXT,
  row_version INTEGER,
  UNIQUE (id, tenant)
);
CREATE INDEX IF NOT EXISTS devices_tenant_status_idx ON devices (tenant, status);
CREATE INDEX IF NOT EXISTS devices_created_at_idx ON devices (created_at);

CREATE TABLE IF NOT EXISTS outliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL DEFAULT 'default',
  reading_id INTEGER,
  detected_at TEXT,
  z_score REAL,
  is_resolved INTEGER,
  resolved_at TEXT,
  resolved_by TEXT,
  site_id INTEGER,
  notification_id INTEGER,
  created_at TEXT,
  row_version INTEGER,
  UNIQUE (id, tenant),
  FOREIGN KEY (reading_id, tenant) REFERENCES readings(id, tenant),
  FOREIGN KEY (site_id, tenant) REFERENCES sites(id, tenant),
  FOREIGN KEY (notification_id, tenant) REFERENCES notifications(id, tenant)
);
CREATE INDEX IF NOT EXISTS outliers_tenant_reading_id_idx ON outliers (tenant, reading_id);
CREATE INDEX IF NOT EXISTS outliers_tenant_site_id_idx ON outliers (tenant, site_id);
CREATE INDEX IF NOT EXISTS outliers_tenant_notification_id_idx ON outliers (tenant, notification_id);
CREATE INDEX IF NOT EXISTS outliers_created_at_idx ON outliers (created_at);

CREATE TABLE IF NOT EXISTS sync_thresholds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL DEFAULT 'default',
  max_attempts INTEGER,
  action TEXT,
  is_active INTEGER,
  created_at TEXT,
  updated_at TEXT,
  row_version INTEGER,
  UNIQUE (id, tenant)
);
CREATE INDEX IF NOT EXISTS sync_thresholds_tenant_action_idx ON sync_thresholds (tenant, action);
CREATE INDEX IF NOT EXISTS sync_thresholds_created_at_idx ON sync_thresholds (created_at);

CREATE TABLE IF NOT EXISTS passphrases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL DEFAULT 'default',
  hash TEXT,
  salt TEXT,
  is_set INTEGER,
  set_at TEXT,
  device_id INTEGER,
  failed_attempts INTEGER,
  created_at TEXT,
  row_version INTEGER,
  UNIQUE (id, tenant),
  FOREIGN KEY (device_id, tenant) REFERENCES devices(id, tenant)
);
CREATE INDEX IF NOT EXISTS passphrases_tenant_device_id_idx ON passphrases (tenant, device_id);
CREATE INDEX IF NOT EXISTS passphrases_created_at_idx ON passphrases (created_at);

CREATE TABLE IF NOT EXISTS daily_aggregates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL DEFAULT 'default',
  date TEXT,
  total_readings INTEGER,
  synced_readings INTEGER,
  failed_readings INTEGER,
  avg_numeric_value REAL,
  site_id INTEGER,
  zone_id INTEGER,
  created_at TEXT,
  row_version INTEGER,
  UNIQUE (id, tenant),
  FOREIGN KEY (site_id, tenant) REFERENCES sites(id, tenant),
  FOREIGN KEY (zone_id, tenant) REFERENCES connectivity_zones(id, tenant)
);
CREATE INDEX IF NOT EXISTS daily_aggregates_tenant_site_id_idx ON daily_aggregates (tenant, site_id);
CREATE INDEX IF NOT EXISTS daily_aggregates_tenant_zone_id_idx ON daily_aggregates (tenant, zone_id);
CREATE INDEX IF NOT EXISTS daily_aggregates_created_at_idx ON daily_aggregates (created_at);

CREATE TABLE IF NOT EXISTS connectivity_zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL DEFAULT 'default',
  name TEXT,
  polygon_geojson TEXT,
  sync_success_rate REAL,
  last_updated TEXT,
  technician_email TEXT,
  status TEXT,
  created_at TEXT,
  row_version INTEGER,
  UNIQUE (id, tenant)
);
CREATE INDEX IF NOT EXISTS connectivity_zones_tenant_status_idx ON connectivity_zones (tenant, status);
CREATE INDEX IF NOT EXISTS connectivity_zones_created_at_idx ON connectivity_zones (created_at);

CREATE TABLE IF NOT EXISTS reading_historys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL DEFAULT 'default',
  reading_id INTEGER,
  changed_field TEXT,
  old_value TEXT,
  new_value TEXT,
  changed_at TEXT,
  changed_by TEXT,
  revision_id INTEGER,
  created_at TEXT,
  row_version INTEGER,
  UNIQUE (id, tenant),
  FOREIGN KEY (reading_id, tenant) REFERENCES readings(id, tenant)
);
CREATE INDEX IF NOT EXISTS reading_historys_tenant_reading_id_idx ON reading_historys (tenant, reading_id);
CREATE INDEX IF NOT EXISTS reading_historys_created_at_idx ON reading_historys (created_at);

CREATE TABLE IF NOT EXISTS site_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL DEFAULT 'default',
  site_id INTEGER,
  visit_date TEXT,
  purpose TEXT,
  notes TEXT,
  technician_email TEXT,
  status TEXT,
  equipment_id INTEGER,
  created_at TEXT,
  row_version INTEGER,
  UNIQUE (id, tenant),
  FOREIGN KEY (site_id, tenant) REFERENCES sites(id, tenant),
  FOREIGN KEY (equipment_id, tenant) REFERENCES equipments(id, tenant)
);
CREATE INDEX IF NOT EXISTS site_visits_tenant_site_id_idx ON site_visits (tenant, site_id);
CREATE INDEX IF NOT EXISTS site_visits_tenant_equipment_id_idx ON site_visits (tenant, equipment_id);
CREATE INDEX IF NOT EXISTS site_visits_tenant_status_idx ON site_visits (tenant, status);
CREATE INDEX IF NOT EXISTS site_visits_created_at_idx ON site_visits (created_at);

CREATE TABLE IF NOT EXISTS equipments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL DEFAULT 'default',
  serial_number TEXT,
  type TEXT,
  installation_date TEXT,
  last_calibration TEXT,
  site_id INTEGER,
  status TEXT,
  warranty_expiry TEXT,
  created_at TEXT,
  row_version INTEGER,
  UNIQUE (id, tenant),
  FOREIGN KEY (site_id, tenant) REFERENCES sites(id, tenant)
);
CREATE INDEX IF NOT EXISTS equipments_tenant_site_id_idx ON equipments (tenant, site_id);
CREATE INDEX IF NOT EXISTS equipments_tenant_status_idx ON equipments (tenant, status);
CREATE INDEX IF NOT EXISTS equipments_created_at_idx ON equipments (created_at);

CREATE TABLE IF NOT EXISTS calibration_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL DEFAULT 'default',
  equipment_id INTEGER,
  calibrated_at TEXT,
  calibrated_by TEXT,
  next_calibration TEXT,
  notes TEXT,
  status TEXT,
  reading_id INTEGER,
  created_at TEXT,
  row_version INTEGER,
  UNIQUE (id, tenant),
  FOREIGN KEY (equipment_id, tenant) REFERENCES equipments(id, tenant),
  FOREIGN KEY (reading_id, tenant) REFERENCES readings(id, tenant)
);
CREATE INDEX IF NOT EXISTS calibration_logs_tenant_equipment_id_idx ON calibration_logs (tenant, equipment_id);
CREATE INDEX IF NOT EXISTS calibration_logs_tenant_reading_id_idx ON calibration_logs (tenant, reading_id);
CREATE INDEX IF NOT EXISTS calibration_logs_tenant_status_idx ON calibration_logs (tenant, status);
CREATE INDEX IF NOT EXISTS calibration_logs_created_at_idx ON calibration_logs (created_at);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL DEFAULT 'default',
  recipient_email TEXT,
  type TEXT,
  content TEXT,
  is_read INTEGER,
  created_at TEXT,
  related_entity_id INTEGER,
  related_entity_type TEXT,
  row_version INTEGER,
  UNIQUE (id, tenant)
);
CREATE INDEX IF NOT EXISTS notifications_tenant_idx ON notifications (tenant);
CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON notifications (created_at);

CREATE TABLE IF NOT EXISTS sync_policys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL DEFAULT 'default',
  name TEXT,
  min_battery_level INTEGER,
  min_network_strength INTEGER,
  retry_interval INTEGER,
  is_active INTEGER,
  created_at TEXT,
  updated_at TEXT,
  zone_id INTEGER,
  row_version INTEGER,
  UNIQUE (id, tenant),
  FOREIGN KEY (zone_id, tenant) REFERENCES connectivity_zones(id, tenant)
);
CREATE INDEX IF NOT EXISTS sync_policys_tenant_zone_id_idx ON sync_policys (tenant, zone_id);
CREATE INDEX IF NOT EXISTS sync_policys_created_at_idx ON sync_policys (created_at);

CREATE TABLE IF NOT EXISTS audit_trails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL DEFAULT 'default',
  entity_type TEXT,
  entity_id INTEGER,
  action TEXT,
  performed_at TEXT,
  performed_by TEXT,
  metadata TEXT,
  device_id INTEGER,
  created_at TEXT,
  row_version INTEGER,
  UNIQUE (id, tenant),
  FOREIGN KEY (device_id, tenant) REFERENCES devices(id, tenant)
);
CREATE INDEX IF NOT EXISTS audit_trails_tenant_device_id_idx ON audit_trails (tenant, device_id);
CREATE INDEX IF NOT EXISTS audit_trails_created_at_idx ON audit_trails (created_at);

CREATE TABLE IF NOT EXISTS maintenance_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL DEFAULT 'default',
  equipment_id INTEGER,
  scheduled_date TEXT,
  type TEXT,
  status TEXT,
  notes TEXT,
  technician_email TEXT,
  created_at TEXT,
  row_version INTEGER,
  UNIQUE (id, tenant),
  FOREIGN KEY (equipment_id, tenant) REFERENCES equipments(id, tenant)
);
CREATE INDEX IF NOT EXISTS maintenance_schedules_tenant_equipment_id_idx ON maintenance_schedules (tenant, equipment_id);
CREATE INDEX IF NOT EXISTS maintenance_schedules_tenant_status_idx ON maintenance_schedules (tenant, status);
CREATE INDEX IF NOT EXISTS maintenance_schedules_created_at_idx ON maintenance_schedules (created_at);

CREATE TABLE IF NOT EXISTS chain_of_custody (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL DEFAULT 'default',
  reading_id INTEGER,
  device_id INTEGER,
  technician_email TEXT,
  action TEXT,
  action_timestamp TEXT,
  location_lat REAL,
  location_lon REAL,
  signature_hash TEXT,
  notes TEXT,
  previous_custody_id INTEGER,
  created_at TEXT,
  row_version INTEGER,
  UNIQUE (id, tenant),
  FOREIGN KEY (reading_id, tenant) REFERENCES readings(id, tenant),
  FOREIGN KEY (device_id, tenant) REFERENCES devices(id, tenant),
  FOREIGN KEY (previous_custody_id, tenant) REFERENCES chain_of_custody(id, tenant)
);
CREATE INDEX IF NOT EXISTS chain_of_custody_tenant_reading_id_idx ON chain_of_custody (tenant, reading_id);
CREATE INDEX IF NOT EXISTS chain_of_custody_tenant_device_id_idx ON chain_of_custody (tenant, device_id);
CREATE INDEX IF NOT EXISTS chain_of_custody_created_at_idx ON chain_of_custody (created_at);

CREATE TABLE IF NOT EXISTS regulatory_exports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL DEFAULT 'default',
  regulatory_id TEXT,
  export_type TEXT,
  jurisdiction TEXT,
  content_hash TEXT,
  exported_by TEXT,
  exported_at TEXT,
  status TEXT,
  filing_reference TEXT,
  chain_of_custody_id INTEGER,
  created_at TEXT,
  row_version INTEGER,
  UNIQUE (id, tenant),
  FOREIGN KEY (chain_of_custody_id, tenant) REFERENCES chain_of_custody(id, tenant)
);
CREATE INDEX IF NOT EXISTS regulatory_exports_tenant_regulatory_id_idx ON regulatory_exports (tenant, regulatory_id);
CREATE INDEX IF NOT EXISTS regulatory_exports_tenant_chain_of_custody_id_idx ON regulatory_exports (tenant, chain_of_custody_id);
CREATE INDEX IF NOT EXISTS regulatory_exports_created_at_idx ON regulatory_exports (created_at);
