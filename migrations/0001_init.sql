-- GENERATED schema.
-- Tenants table for multi-tenant isolation
CREATE TABLE IF NOT EXISTS tenants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  slug TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  plan_tier TEXT CHECK(plan_tier IN ('free', 'pro', 'firm')) DEFAULT 'free',
  jurisdiction TEXT, -- ISO-3166-2
  retention_policy_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  suspended_at TEXT,
  ledger_head_hash TEXT
);
CREATE INDEX IF NOT EXISTS tenants_slug_idx ON tenants (slug);

-- Users table - global identity with tenant scoping
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id),
  email TEXT NOT NULL,
  phone_e164 TEXT,
  display_name TEXT,
  role TEXT CHECK(role IN ('owner', 'office_manager', 'staff', 'vendor_contact', 'auditor')) DEFAULT 'staff',
  trust_score REAL DEFAULT 50.0 CHECK(trust_score >= 0 AND trust_score <= 100),
  onboarding_state TEXT CHECK(onboarding_state IN ('invited', 'active', 'shadow', 'graduated')) DEFAULT 'invited',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT,
  disabled_at TEXT,
  UNIQUE (tenant_id, email)
);
CREATE INDEX IF NOT EXISTS users_tenant_email_idx ON users (tenant_id, email);
CREATE INDEX IF NOT EXISTS users_tenant_role_idx ON users (tenant_id, role);

-- Sessions for authentication
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  user_id INTEGER NOT NULL REFERENCES users(id),
  tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id),
  issued_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  ip_hash TEXT,
  user_agent_hash TEXT,
  auth_method TEXT CHECK(auth_method IN ('magic_link', 'sms_code', 'oauth_calendar', 'webauthn')),
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS sessions_user_tenant_idx ON sessions (user_id, tenant_id);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at);

-- Calendar connections for sync
CREATE TABLE IF NOT EXISTS calendar_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  provider TEXT CHECK(provider IN ('google', 'microsoft')) NOT NULL,
  oauth_refresh_token_encrypted TEXT,
  calendar_ids TEXT, -- JSON array
  sync_cursor TEXT,
  last_sync_at TEXT,
  last_sync_status TEXT CHECK(last_sync_status IN ('ok', 'partial', 'failed')),
  error_count_24h INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS calendar_connections_tenant_user_idx ON calendar_connections (tenant_id, user_id);
CREATE INDEX IF NOT EXISTS calendar_connections_last_sync_idx ON calendar_connections (last_sync_at);

-- Calendar events imported from external providers
CREATE TABLE IF NOT EXISTS calendar_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  calendar_event_id TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id),
  connection_id TEXT NOT NULL REFERENCES calendar_connections(connection_id),
  provider_event_id TEXT NOT NULL,
  title TEXT,
  description TEXT,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  is_all_day INTEGER DEFAULT 0,
  recurrence_rule TEXT,
  organizer_email TEXT,
  is_cancelled INTEGER DEFAULT 0,
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tenant_id, provider_event_id)
);
CREATE INDEX IF NOT EXISTS calendar_events_tenant_starts_idx ON calendar_events (tenant_id, starts_at);
CREATE INDEX IF NOT EXISTS calendar_events_connection_idx ON calendar_events (connection_id);

-- Vendors providing services
CREATE TABLE IF NOT EXISTS vendors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_id TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id),
  display_name TEXT NOT NULL,
  service_type TEXT CHECK(service_type IN ('cleaning', 'hvac', 'courier', 'security', 'it', 'plants', 'other')) DEFAULT 'other',
  contact_email TEXT,
  contact_phone TEXT,
  sla_window_minutes INTEGER DEFAULT 15,
  shadow_mode INTEGER DEFAULT 0,
  shadow_mode_visit_limit INTEGER DEFAULT 10,
  score REAL DEFAULT 50.0 CHECK(score >= 0 AND score <= 100),
  score_band TEXT CHECK(score_band IN ('ok', 'warning', 'critical')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  archived_at TEXT
);
CREATE INDEX IF NOT EXISTS vendors_tenant_score_idx ON vendors (tenant_id, score);
CREATE INDEX IF NOT EXISTS vendors_tenant_service_idx ON vendors (tenant_id, service_type);

-- Vendor contacts for counterparty signing
CREATE TABLE IF NOT EXISTS vendor_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_contact_id TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id),
  vendor_id TEXT NOT NULL REFERENCES vendors(vendor_id),
  display_name TEXT,
  phone_e164 TEXT,
  email TEXT,
  magic_link_enabled INTEGER DEFAULT 1,
  default_recipient INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS vendor_contacts_vendor_idx ON vendor_contacts (vendor_id);

-- Staff members (in-house personnel)
CREATE TABLE IF NOT EXISTS staff_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_member_id TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id),
  user_id INTEGER REFERENCES users(id),
  display_name TEXT NOT NULL,
  role TEXT CHECK(role IN ('in_house_log', 'trainee', 'contractor')) DEFAULT 'in_house_log',
  trust_score REAL DEFAULT 50.0 CHECK(trust_score >= 0 AND trust_score <= 100),
  shadow_mode_visit_limit INTEGER DEFAULT 10,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  terminated_at TEXT
);
CREATE INDEX IF NOT EXISTS staff_members_tenant_user_idx ON staff_members (tenant_id, user_id);

-- Visit templates linking calendar events to vendor workflows
CREATE TABLE IF NOT EXISTS visit_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id),
  vendor_id TEXT NOT NULL REFERENCES vendors(vendor_id),
  calendar_event_id TEXT REFERENCES calendar_events(calendar_event_id),
  scheduled_start_offset_minutes INTEGER DEFAULT 0,
  sla_window_minutes INTEGER,
  default_duration_minutes INTEGER DEFAULT 60,
  requires_counterparty_signature INTEGER DEFAULT 1,
  requires_photo INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS visit_templates_tenant_vendor_idx ON visit_templates (tenant_id, vendor_id);

-- Visit instances - the core operational entity
CREATE TABLE IF NOT EXISTS visit_instances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  instance_id TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id),
  template_id TEXT REFERENCES visit_templates(template_id),
  vendor_id TEXT NOT NULL REFERENCES vendors(vendor_id),
  staff_member_id TEXT REFERENCES staff_members(staff_member_id),
  scheduled_start_at TEXT NOT NULL,
  scheduled_end_at TEXT NOT NULL,
  status TEXT CHECK(status IN ('scheduled', 'due', 'in_progress', 'completed', 'missed', 'disputed', 'archived')) DEFAULT 'scheduled',
  actual_start_at TEXT,
  actual_end_at TEXT,
  drift_seconds INTEGER,
  signing_window_closes_at TEXT,
  late_tap_reason TEXT,
  corrected_by_override_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS visit_instances_tenant_start_idx ON visit_instances (tenant_id, scheduled_start_at);
CREATE INDEX IF NOT EXISTS visit_instances_tenant_status_idx ON visit_instances (tenant_id, status);
CREATE INDEX IF NOT EXISTS visit_instances_vendor_idx ON visit_instances (vendor_id);

-- Visit receipts - dual-signed artifacts
CREATE TABLE IF NOT EXISTS visit_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_id TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id),
  instance_id TEXT NOT NULL REFERENCES visit_instances(instance_id),
  office_signature_id TEXT,
  counterparty_signature_id TEXT,
  office_signed_at TEXT,
  counterparty_signed_at TEXT,
  sealed_at TEXT,
  office_note TEXT,
  counterparty_note TEXT,
  photo_object_key TEXT,
  status TEXT CHECK(status IN ('drafted', 'awaiting_office', 'awaiting_counterparty', 'sealed', 'expired', 'revoked')) DEFAULT 'drafted'
);
CREATE INDEX IF NOT EXISTS visit_receipts_instance_idx ON visit_receipts (instance_id);
CREATE INDEX IF NOT EXISTS visit_receipts_tenant_status_idx ON visit_receipts (tenant_id, status);

-- Signatures - cryptographic proofs
CREATE TABLE IF NOT EXISTS signatures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  signature_id TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id),
  signer_user_id INTEGER REFERENCES users(id),
  signer_role TEXT CHECK(signer_role IN ('office', 'counterparty', 'auditor', 'system')) NOT NULL,
  signer_phone_e164 TEXT,
  canonical_payload_hash TEXT NOT NULL,
  hmac_signature TEXT NOT NULL,
  signing_key_fingerprint TEXT NOT NULL,
  signed_at TEXT NOT NULL DEFAULT (datetime('now')),
  ip_hash TEXT,
  user_agent_hash TEXT,
  counterparty_token_id TEXT
);
CREATE INDEX IF NOT EXISTS signatures_tenant_signer_idx ON signatures (tenant_id, signer_user_id);
CREATE INDEX IF NOT EXISTS signatures_payload_hash_idx ON signatures (canonical_payload_hash);

-- Manual overrides - append-only corrections
CREATE TABLE IF NOT EXISTS manual_overrides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  override_id TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id),
  instance_id TEXT REFERENCES visit_instances(instance_id),
  actor_user_id INTEGER NOT NULL REFERENCES users(id),
  override_type TEXT CHECK(override_type IN ('start_early', 'start_late', 'mark_missed', 'mark_completed', 'force_sign', 'correct_record', 'suppress_alert')) NOT NULL,
  reason TEXT NOT NULL CHECK(length(reason) >= 10),
  payload_before_hash TEXT NOT NULL,
  payload_after_hash TEXT NOT NULL,
  signature_id TEXT REFERENCES signatures(signature_id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  approved_by_user_id INTEGER REFERENCES users(id),
  approved_at TEXT
);
CREATE INDEX IF NOT EXISTS manual_overrides_tenant_actor_idx ON manual_overrides (tenant_id, actor_user_id);
CREATE INDEX IF NOT EXISTS manual_overrides_instance_idx ON manual_overrides (instance_id);

-- Ledger entries - immutable audit trail (NO UPDATE ALLOWED)
CREATE TABLE IF NOT EXISTS ledger_entries (
  entry_id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id),
  entry_type TEXT CHECK(entry_type IN ('visit_created', 'visit_started', 'visit_completed', 'receipt_sealed', 'override', 'score_update', 'correction', 'anomaly_flag', 'ai_suggestion')) NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload_canonical_json TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  prev_hash TEXT REFERENCES ledger_entries(payload_hash),
  entry_hash TEXT NOT NULL,
  actor_user_id INTEGER REFERENCES users(id),
  actor_role TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  signature_id TEXT REFERENCES signatures(signature_id),
  UNIQUE (tenant_id, entry_id)
);
CREATE INDEX IF NOT EXISTS ledger_entries_tenant_created_idx ON ledger_entries (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS ledger_entries_entity_idx ON ledger_entries (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS ledger_entries_prev_hash_idx ON ledger_entries (prev_hash);

-- Vendor scores - append-only snapshots
CREATE TABLE IF NOT EXISTS vendor_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  score_id TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id),
  vendor_id TEXT NOT NULL REFERENCES vendors(vendor_id),
  window_days INTEGER CHECK(window_days IN (30, 90, 365)) NOT NULL,
  on_time_starts INTEGER DEFAULT 0,
  late_starts INTEGER DEFAULT 0,
  missed_visits INTEGER DEFAULT 0,
  disputed_visits INTEGER DEFAULT 0,
  score_value REAL NOT NULL CHECK(score_value >= 0 AND score_value <= 100),
  score_band TEXT CHECK(score_band IN ('ok', 'warning', 'critical')),
  computed_at TEXT NOT NULL DEFAULT (datetime('now')),
  previous_score_id TEXT REFERENCES vendor_scores(score_id)
);
CREATE INDEX IF NOT EXISTS vendor_scores_tenant_vendor_window_idx ON vendor_scores (tenant_id, vendor_id, window_days);
CREATE INDEX IF NOT EXISTS vendor_scores_computed_idx ON vendor_scores (computed_at);

-- Staff scores - append-only snapshots
CREATE TABLE IF NOT EXISTS staff_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  score_id TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  window_days INTEGER CHECK(window_days IN (30, 90, 365)) NOT NULL,
  actions_total INTEGER DEFAULT 0,
  actions_reverted INTEGER DEFAULT 0,
  overrides_approved INTEGER DEFAULT 0,
  overrides_against INTEGER DEFAULT 0,
  score_value REAL NOT NULL CHECK(score_value >= 0 AND score_value <= 100),
  computed_at TEXT NOT NULL DEFAULT (datetime('now')),
  previous_score_id TEXT REFERENCES staff_scores(score_id)
);
CREATE INDEX IF NOT EXISTS staff_scores_tenant_user_window_idx ON staff_scores (tenant_id, user_id, window_days);

-- Counterparty tokens for magic-link signing
CREATE TABLE IF NOT EXISTS counterparty_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_id TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id),
  instance_id TEXT NOT NULL REFERENCES visit_instances(instance_id),
  vendor_contact_id TEXT NOT NULL REFERENCES vendor_contacts(vendor_contact_id),
  token_hash TEXT NOT NULL,
  channel TEXT CHECK(channel IN ('sms', 'email')) NOT NULL,
  issued_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  ip_hash_at_consume TEXT
);
CREATE INDEX IF NOT EXISTS counterparty_tokens_instance_idx ON counterparty_tokens (instance_id);
CREATE INDEX IF NOT EXISTS counterparty_tokens_hash_idx ON counterparty_tokens (token_hash);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_id TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id),
  recipient_user_id INTEGER REFERENCES users(id),
  recipient_phone_e164 TEXT,
  channel TEXT CHECK(channel IN ('push', 'email', 'sms')) NOT NULL,
  template TEXT NOT NULL,
  instance_id TEXT REFERENCES visit_instances(instance_id),
  scheduled_for TEXT NOT NULL,
  sent_at TEXT,
  delivery_status TEXT CHECK(delivery_status IN ('queued', 'sent', 'delivered', 'failed', 'bounced')),
  failure_reason TEXT
);
CREATE INDEX IF NOT EXISTS notifications_tenant_recipient_idx ON notifications (tenant_id, recipient_user_id);
CREATE INDEX IF NOT EXISTS notifications_scheduled_idx ON notifications (scheduled_for);

-- Dispute snapshots
CREATE TABLE IF NOT EXISTS dispute_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id),
  requested_by_user_id INTEGER NOT NULL REFERENCES users(id),
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  as_of_timestamp TEXT NOT NULL,
  ledger_head_hash_at_as_of TEXT NOT NULL,
  instance_id TEXT REFERENCES visit_instances(instance_id),
  pdf_object_key TEXT,
  json_object_key TEXT,
  verification_token TEXT UNIQUE NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS dispute_snapshots_tenant_requested_idx ON dispute_snapshots (tenant_id, requested_at);
CREATE INDEX IF NOT EXISTS dispute_snapshots_verification_token_idx ON dispute_snapshots (verification_token);

-- Retention policies
CREATE TABLE IF NOT EXISTS retention_policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  policy_id TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id),
  jurisdiction TEXT, -- ISO-3166-2
  min_retention_days INTEGER DEFAULT 2555, -- 7 years
  min_retention_days_receipts INTEGER DEFAULT 2555,
  legal_hold INTEGER DEFAULT 0,
  redact_pii_after_days INTEGER,
  policy_source TEXT CHECK(policy_source IN ('template', 'custom')) DEFAULT 'template',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS retention_policies_tenant_idx ON retention_policies (tenant_id);

-- Invite tokens for user onboarding
CREATE TABLE IF NOT EXISTS invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invite_id TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id),
  token_hash TEXT NOT NULL UNIQUE,
  reset_user_id INTEGER REFERENCES users(id),
  used_at TEXT,
  expires_at TEXT NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS invites_tenant_idx ON invites (tenant_id);
CREATE INDEX IF NOT EXISTS invites_token_hash_idx ON invites (token_hash);

-- Legacy tables preserved for compatibility
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
  UNIQUE (id, tenant),
  FOREIGN KEY (zone_id, tenant) REFERENCES connectivity_zones(id, tenant)
);
CREATE INDEX IF NOT EXISTS sites_tenant_zone_id_idx ON sites (tenant, zone_id);
CREATE INDEX IF NOT EXISTS sites_tenant_status_idx ON sites (tenant, status);

CREATE TABLE IF NOT EXISTS sync_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL DEFAULT 'default',
  reading_id INTEGER,
  attempted_at TEXT,
  status TEXT,
  response_code INTEGER,
  error_message TEXT,
  sync_policy_id INTEGER,
  UNIQUE (id, tenant),
  FOREIGN KEY (reading_id, tenant) REFERENCES readings(id, tenant),
  FOREIGN KEY (sync_policy_id, tenant) REFERENCES sync_policys(id, tenant)
);
CREATE INDEX IF NOT EXISTS sync_logs_tenant_reading_id_idx ON sync_logs (tenant, reading_id);
CREATE INDEX IF NOT EXISTS sync_logs_tenant_sync_policy_id_idx ON sync_logs (tenant, sync_policy_id);

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
  UNIQUE (id, tenant),
  FOREIGN KEY (device_id, tenant) REFERENCES devices(id, tenant)
);
CREATE INDEX IF NOT EXISTS encryption_keys_tenant_device_id_idx ON encryption_keys (tenant, device_id);

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
  UNIQUE (id, tenant)
);
CREATE INDEX IF NOT EXISTS devices_tenant_status_idx ON devices (tenant, status);

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
  UNIQUE (id, tenant),
  FOREIGN KEY (reading_id, tenant) REFERENCES readings(id, tenant),
  FOREIGN KEY (site_id, tenant) REFERENCES sites(id, tenant),
  FOREIGN KEY (notification_id, tenant) REFERENCES notifications(id, tenant)
);
CREATE INDEX IF NOT EXISTS outliers_tenant_reading_id_idx ON outliers (tenant, reading_id);
CREATE INDEX IF NOT EXISTS outliers_tenant_site_id_idx ON outliers (tenant, site_id);
CREATE INDEX IF NOT EXISTS outliers_tenant_notification_id_idx ON outliers (tenant, notification_id);

CREATE TABLE IF NOT EXISTS sync_thresholds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL DEFAULT 'default',
  max_attempts INTEGER,
  action TEXT,
  is_active INTEGER,
  created_at TEXT,
  updated_at TEXT,
  UNIQUE (id, tenant)
);
CREATE INDEX IF NOT EXISTS sync_thresholds_tenant_action_idx ON sync_thresholds (tenant, action);

CREATE TABLE IF NOT EXISTS passphrases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL DEFAULT 'default',
  hash TEXT,
  salt TEXT,
  is_set INTEGER,
  set_at TEXT,
  device_id INTEGER,
  failed_attempts INTEGER,
  UNIQUE (id, tenant),
  FOREIGN KEY (device_id, tenant) REFERENCES devices(id, tenant)
);
CREATE INDEX IF NOT EXISTS passphrases_tenant_device_id_idx ON passphrases (tenant, device_id);

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
  UNIQUE (id, tenant),
  FOREIGN KEY (site_id, tenant) REFERENCES sites(id, tenant),
  FOREIGN KEY (zone_id, tenant) REFERENCES connectivity_zones(id, tenant)
);
CREATE INDEX IF NOT EXISTS daily_aggregates_tenant_site_id_idx ON daily_aggregates (tenant, site_id);
CREATE INDEX IF NOT EXISTS daily_aggregates_tenant_zone_id_idx ON daily_aggregates (tenant, zone_id);

CREATE TABLE IF NOT EXISTS connectivity_zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL DEFAULT 'default',
  name TEXT,
  polygon_geojson TEXT,
  sync_success_rate REAL,
  last_updated TEXT,
  technician_email TEXT,
  status TEXT,
  UNIQUE (id, tenant)
);
CREATE INDEX IF NOT EXISTS connectivity_zones_tenant_status_idx ON connectivity_zones (tenant, status);

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
  UNIQUE (id, tenant),
  FOREIGN KEY (reading_id, tenant) REFERENCES readings(id, tenant)
);
CREATE INDEX IF NOT EXISTS reading_historys_tenant_reading_id_idx ON reading_historys (tenant, reading_id);

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
  UNIQUE (id, tenant),
  FOREIGN KEY (site_id, tenant) REFERENCES sites(id, tenant),
  FOREIGN KEY (equipment_id, tenant) REFERENCES equipments(id, tenant)
);
CREATE INDEX IF NOT EXISTS site_visits_tenant_site_id_idx ON site_visits (tenant, site_id);
CREATE INDEX IF NOT EXISTS site_visits_tenant_equipment_id_idx ON site_visits (tenant, equipment_id);
CREATE INDEX IF NOT EXISTS site_visits_tenant_status_idx ON site_visits (tenant, status);

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
  UNIQUE (id, tenant),
  FOREIGN KEY (site_id, tenant) REFERENCES sites(id, tenant)
);
CREATE INDEX IF NOT EXISTS equipments_tenant_site_id_idx ON equipments (tenant, site_id);
CREATE INDEX IF NOT EXISTS equipments_tenant_status_idx ON equipments (tenant, status);

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
  UNIQUE (id, tenant),
  FOREIGN KEY (equipment_id, tenant) REFERENCES equipments(id, tenant),
  FOREIGN KEY (reading_id, tenant) REFERENCES readings(id, tenant)
);
CREATE INDEX IF NOT EXISTS calibration_logs_tenant_equipment_id_idx ON calibration_logs (tenant, equipment_id);
CREATE INDEX IF NOT EXISTS calibration_logs_tenant_reading_id_idx ON calibration_logs (tenant, reading_id);
CREATE INDEX IF NOT EXISTS calibration_logs_tenant_status_idx ON calibration_logs (tenant, status);

-- Notifications legacy compatibility
CREATE INDEX IF NOT EXISTS notifications_tenant_idx ON notifications_legacy (tenant);

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
  UNIQUE (id, tenant),
  FOREIGN KEY (zone_id, tenant) REFERENCES connectivity_zones(id, tenant)
);
CREATE INDEX IF NOT EXISTS sync_policys_tenant_zone_id_idx ON sync_policys (tenant, zone_id);

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
  UNIQUE (id, tenant),
  FOREIGN KEY (device_id, tenant) REFERENCES devices(id, tenant)
);
CREATE INDEX IF NOT EXISTS audit_trails_tenant_device_id_idx ON audit_trails (tenant, device_id);

CREATE TABLE IF NOT EXISTS maintenance_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL DEFAULT 'default',
  equipment_id INTEGER,
  scheduled_date TEXT,
  type TEXT,
  status TEXT,
  notes TEXT,
  technician_email TEXT,
  UNIQUE (id, tenant),
  FOREIGN KEY (equipment_id, tenant) REFERENCES equipments(id, tenant)
);
CREATE INDEX IF NOT EXISTS maintenance_schedules_tenant_equipment_id_idx ON maintenance_schedules (tenant, equipment_id);
CREATE INDEX IF NOT EXISTS maintenance_schedules_tenant_status_idx ON maintenance_schedules (tenant, status);

-- Legacy notifications table renamed for clarity
ALTER TABLE notifications RENAME TO notifications_legacy;

-- Create the new notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_id TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id),
  recipient_user_id INTEGER REFERENCES users(id),
  recipient_phone_e164 TEXT,
  channel TEXT CHECK(channel IN ('push', 'email', 'sms')) NOT NULL,
  template TEXT NOT NULL,
  instance_id TEXT REFERENCES visit_instances(instance_id),
  scheduled_for TEXT NOT NULL,
  sent_at TEXT,
  delivery_status TEXT CHECK(delivery_status IN ('queued', 'sent', 'delivered', 'failed', 'bounced')),
  failure_reason TEXT
);
CREATE INDEX IF NOT EXISTS notifications_tenant_recipient_idx ON notifications (tenant_id, recipient_user_id);
CREATE INDEX IF NOT EXISTS notifications_scheduled_idx ON notifications (scheduled_for);
