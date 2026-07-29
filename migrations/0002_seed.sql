-- GENERATED seed (skipped in tests, applied on deploy).
-- Demo tenant 'acme-firm' with pre-loaded vendors, calendar events, and partial ledger chain for Now Board demonstration.

-- Clear existing seed data first (idempotent for re-runs).
-- Use DELETE without tenant filter; rely on deterministic demo ids via reset.

DELETE FROM reading_histories WHERE reading_id IN (SELECT id FROM readings WHERE dedupe_id LIKE 'acme-%');
DELETE FROM outliers WHERE reading_id IN (SELECT id FROM readings WHERE dedupe_id LIKE 'acme-%');
DELETE FROM sync_logs WHERE reading_id IN (SELECT id FROM readings WHERE dedupe_id LIKE 'acme-%');
DELETE FROM calibration_logs WHERE notes LIKE 'Quarterly calibration%' OR notes LIKE 'Q1 calibration%';
DELETE FROM readings WHERE dedupe_id LIKE 'acme-%';
DELETE FROM site_visits WHERE notes LIKE '%CleanPro%' OR notes LIKE '%courier%' OR notes LIKE '%HVAC%';
DELETE FROM maintenance_schedules WHERE notes LIKE 'Quarterly%' OR notes LIKE 'HVAC filter%';
DELETE FROM equipments WHERE serial_number LIKE 'ACME-%';
DELETE FROM daily_aggregates WHERE date BETWEEN '2026-03-10' AND '2026-03-14';
DELETE FROM notifications WHERE recipient_email LIKE '%@acme-firm.example';
DELETE FROM audit_trails WHERE performed_by LIKE '%@acme-firm.example' OR metadata LIKE '%acme%';
DELETE FROM passphrases WHERE device_id IN (SELECT id FROM devices WHERE technician_email LIKE '%@acme-firm.example');
DELETE FROM encryption_keys WHERE device_id IN (SELECT id FROM devices WHERE technician_email LIKE '%@acme-firm.example');
DELETE FROM sites WHERE name LIKE '%ACME%' OR name LIKE 'Main Office%' OR name LIKE 'Satellite Office%';
DELETE FROM devices WHERE technician_email LIKE '%@acme-firm.example';
DELETE FROM connectivity_zones WHERE name = 'Downtown LA';
DELETE FROM sync_policys WHERE name = 'ACME Standard';
DELETE FROM sync_thresholds WHERE action = 'notify_user' AND max_attempts = 3;
DELETE FROM sync_thresholds WHERE action = 'disable_device' AND max_attempts = 5;

-- Demo tenant connectivity zone (Los Angeles downtown)
INSERT INTO connectivity_zones (name, polygon_geojson, sync_success_rate, last_updated, technician_email, status)
VALUES ('Downtown LA', '{"type":"Polygon","coordinates":[[[-118.26,34.04],[-118.22,34.04],[-118.22,34.06],[-118.26,34.06],[-118.26,34.04]]]}', 0.98, '2026-03-14T08:00:00Z', 'ops@acme-firm.example', 'active');

-- Demo tenant sync policy
INSERT INTO sync_policys (name, min_battery_level, min_network_strength, retry_interval, is_active, created_at, updated_at, zone_id)
VALUES ('ACME Standard', 15, 2, 1800, 1, '2026-01-01T00:00:00Z', '2026-03-14T08:00:00Z',
  (SELECT id FROM connectivity_zones WHERE name = 'Downtown LA'));

-- Demo tenant sync thresholds
INSERT INTO sync_thresholds (max_attempts, action, is_active, created_at, updated_at)
VALUES (3, 'notify_user', 1, '2026-01-01T00:00:00Z', '2026-03-14T08:00:00Z');
INSERT INTO sync_thresholds (max_attempts, action, is_active, created_at, updated_at)
VALUES (5, 'disable_device', 1, '2026-01-01T00:00:00Z', '2026-03-14T08:00:00Z');

-- Demo devices for field workers
INSERT INTO devices (user_agent, screen_width, screen_height, hardware_concurrency, last_seen, technician_email, status, battery_level)
VALUES ('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1', 390, 844, 6, '2026-03-14T07:55:00Z', 'marco@acme-firm.example', 'active', 78);
INSERT INTO devices (user_agent, screen_width, screen_height, hardware_concurrency, last_seen, technician_email, status, battery_level)
VALUES ('Mozilla/5.0 (Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36', 412, 915, 8, '2026-03-14T07:30:00Z', 'jonas@acme-firm.example', 'active', 92);
INSERT INTO devices (user_agent, screen_width, screen_height, hardware_concurrency, last_seen, technician_email, status, battery_level)
VALUES ('Desklog Terminal/1.0 (Raspberry Pi 4)', 1920, 1080, 4, '2026-03-14T08:00:00Z', 'front-desk@acme-firm.example', 'active', 100);

-- Demo sites (client locations)
INSERT INTO sites (name, latitude, longitude, mean_value, std_dev, last_sync, sync_success_rate, technician_email, status, zone_id)
VALUES ('Main Office - Suite 400', 34.0522, -118.2437, 47.8, 2.3, '2026-03-14T08:00:00Z', 0.99, 'diane@acme-firm.example', 'active',
  (SELECT id FROM connectivity_zones WHERE name = 'Downtown LA'));
INSERT INTO sites (name, latitude, longitude, mean_value, std_dev, last_sync, sync_success_rate, technician_email, status, zone_id)
VALUES ('Satellite Office - Burbank', 34.1808, -118.3090, 52.1, 3.1, '2026-03-14T07:45:00Z', 0.97, 'priya@acme-firm.example', 'active',
  (SELECT id FROM connectivity_zones WHERE name = 'Downtown LA'));

-- Demo equipment at main office
INSERT INTO equipments (serial_number, type, installation_date, last_calibration, site_id, status, warranty_expiry)
VALUES ('ACME-ENV-001', 'environmental_sensor', '2025-06-15', '2026-02-20',
  (SELECT id FROM sites WHERE name = 'Main Office - Suite 400'), 'active', '2028-06-15');
INSERT INTO equipments (serial_number, type, installation_date, last_calibration, site_id, status, warranty_expiry)
VALUES ('ACME-SEC-002', 'access_control', '2025-03-10', '2026-01-15',
  (SELECT id FROM sites WHERE name = 'Main Office - Suite 400'), 'active', '2027-03-10');
INSERT INTO equipments (serial_number, type, installation_date, last_calibration, site_id, status, warranty_expiry)
VALUES ('ACME-HVAC-003', 'hvac_monitor', '2025-09-01', '2026-03-01',
  (SELECT id FROM sites WHERE name = 'Main Office - Suite 400'), 'active', '2028-09-01');

-- Demo maintenance schedules
INSERT INTO maintenance_schedules (equipment_id, scheduled_date, type, status, notes, technician_email)
VALUES (
  (SELECT id FROM equipments WHERE serial_number = 'ACME-ENV-001'),
  '2026-03-15', 'calibration', 'planned', 'Quarterly calibration due', 'vendor@cleanpro.example');
INSERT INTO maintenance_schedules (equipment_id, scheduled_date, type, status, notes, technician_email)
VALUES (
  (SELECT id FROM equipments WHERE serial_number = 'ACME-HVAC-003'),
  '2026-03-20', 'preventive', 'planned', 'HVAC filter replacement', 'vendor@hvacplus.example');

-- Demo site visits for Now Board (today's schedule)
INSERT INTO site_visits (site_id, visit_date, purpose, notes, technician_email, status, equipment_id)
VALUES (
  (SELECT id FROM sites WHERE name = 'Main Office - Suite 400'),
  '2026-03-14', 'cleaning', 'Weekly M/W/F cleaning service', 'vendor@cleanpro.example', 'in_progress',
  (SELECT id FROM equipments WHERE serial_number = 'ACME-ENV-001'));
INSERT INTO site_visits (site_id, visit_date, purpose, notes, technician_email, status, equipment_id)
VALUES (
  (SELECT id FROM sites WHERE name = 'Main Office - Suite 400'),
  '2026-03-14', 'courier_pickup', 'Daily 4pm courier collection', 'vendor@swiftcourier.example', 'scheduled', NULL);
INSERT INTO site_visits (site_id, visit_date, purpose, notes, technician_email, status, equipment_id)
VALUES (
  (SELECT id FROM sites WHERE name = 'Main Office - Suite 400'),
  '2026-03-13', 'cleaning', 'Weekly M/W/F cleaning service', 'vendor@cleanpro.example', 'completed',
  (SELECT id FROM equipments WHERE serial_number = 'ACME-ENV-001'));
INSERT INTO site_visits (site_id, visit_date, purpose, notes, technician_email, status, equipment_id)
VALUES (
  (SELECT id FROM sites WHERE name = 'Main Office - Suite 400'),
  '2026-03-11', 'cleaning', 'Weekly M/W/F cleaning service', 'vendor@cleanpro.example', 'completed',
  (SELECT id FROM equipments WHERE serial_number = 'ACME-ENV-001'));
INSERT INTO site_visits (site_id, visit_date, purpose, notes, technician_email, status, equipment_id)
VALUES (
  (SELECT id FROM sites WHERE name = 'Main Office - Suite 400'),
  '2026-03-10', 'hvac_service', 'Quarterly HVAC maintenance', 'vendor@hvacplus.example', 'completed',
  (SELECT id FROM equipments WHERE serial_number = 'ACME-HVAC-003'));
INSERT INTO site_visits (site_id, visit_date, purpose, notes, technician_email, status, equipment_id)
VALUES (
  (SELECT id FROM sites WHERE name = 'Main Office - Suite 400'),
  '2026-03-09', 'cleaning', 'Weekly M/W/F cleaning service - NO SHOW', 'vendor@cleanpro.example', 'missed',
  (SELECT id FROM equipments WHERE serial_number = 'ACME-ENV-001'));

-- Demo readings (visit confirmations with photos)
INSERT INTO readings (photo, latitude, longitude, numeric_value, timestamp, encrypted_blob, sync_status, sync_attempts, dedupe_id, site_id, device_id, equipment_id, calibration_id)
VALUES ('acme_cleaning_20260313_0807_photo1.jpg', 34.0523, -118.2436, 47.8, '2026-03-13T08:07:00Z', 'sealed_receipt_encrypted_json', 'synced', 1, 'acme-visit-20260313-001',
  (SELECT id FROM sites WHERE name = 'Main Office - Suite 400'),
  (SELECT id FROM devices WHERE technician_email = 'diane@acme-firm.example'),
  (SELECT id FROM equipments WHERE serial_number = 'ACME-ENV-001'), NULL);
INSERT INTO readings (photo, latitude, longitude, numeric_value, timestamp, encrypted_blob, sync_status, sync_attempts, dedupe_id, site_id, device_id, equipment_id, calibration_id)
VALUES ('acme_cleaning_20260311_0755_photo1.jpg', 34.0521, -118.2438, 48.2, '2026-03-11T07:55:00Z', 'sealed_receipt_encrypted_json', 'synced', 1, 'acme-visit-20260311-001',
  (SELECT id FROM sites WHERE name = 'Main Office - Suite 400'),
  (SELECT id FROM devices WHERE technician_email = 'diane@acme-firm.example'),
  (SELECT id FROM equipments WHERE serial_number = 'ACME-ENV-001'), NULL);
INSERT INTO readings (photo, latitude, longitude, numeric_value, timestamp, encrypted_blob, sync_status, sync_attempts, dedupe_id, site_id, device_id, equipment_id, calibration_id)
VALUES ('acme_hvac_20260310_1405_photo1.jpg', 34.0522, -118.2437, 51.5, '2026-03-10T14:05:00Z', 'sealed_receipt_encrypted_json', 'synced', 1, 'acme-visit-20260310-001',
  (SELECT id FROM sites WHERE name = 'Main Office - Suite 400'),
  (SELECT id FROM devices WHERE technician_email = 'marco@acme-firm.example'),
  (SELECT id FROM equipments WHERE serial_number = 'ACME-HVAC-003'), NULL);

-- Today's in-progress reading (started late at 8:07, scheduled 8:00)
INSERT INTO readings (photo, latitude, longitude, numeric_value, timestamp, encrypted_blob, sync_status, sync_attempts, dedupe_id, site_id, device_id, equipment_id, calibration_id)
VALUES (NULL, 34.0522, -118.2437, 47.9, '2026-03-14T08:07:00Z', 'visit_started_encrypted_json', 'synced', 1, 'acme-visit-20260314-001',
  (SELECT id FROM sites WHERE name = 'Main Office - Suite 400'),
  (SELECT id FROM devices WHERE technician_email = 'diane@acme-firm.example'),
  (SELECT id FROM equipments WHERE serial_number = 'ACME-ENV-001'), NULL);

-- Demo outliers (one resolved, one pending review)
INSERT INTO outliers (reading_id, detected_at, z_score, is_resolved, resolved_at, resolved_by, site_id, notification_id)
VALUES (
  (SELECT id FROM readings WHERE dedupe_id = 'acme-visit-20260309-001'),
  '2026-03-09T08:15:00Z', 2.8, 1, '2026-03-09T09:30:00Z', 'diane@acme-firm.example',
  (SELECT id FROM sites WHERE name = 'Main Office - Suite 400'), NULL);
INSERT INTO outliers (reading_id, detected_at, z_score, is_resolved, resolved_at, resolved_by, site_id, notification_id)
VALUES (
  (SELECT id FROM readings WHERE dedupe_id = 'acme-visit-20260314-001'),
  '2026-03-14T08:10:00Z', 1.5, 0, NULL, '',
  (SELECT id FROM sites WHERE name = 'Main Office - Suite 400'), NULL);

-- Demo sync logs
INSERT INTO sync_logs (reading_id, attempted_at, status, response_code, error_message, sync_policy_id)
VALUES (
  (SELECT id FROM readings WHERE dedupe_id = 'acme-visit-20260313-001'),
  '2026-03-13T08:08:00Z', 'success', 200, '',
  (SELECT id FROM sync_policys WHERE name = 'ACME Standard'));
INSERT INTO sync_logs (reading_id, attempted_at, status, response_code, error_message, sync_policy_id)
VALUES (
  (SELECT id FROM readings WHERE dedupe_id = 'acme-visit-20260314-001'),
  '2026-03-14T08:08:00Z', 'success', 200, '',
  (SELECT id FROM sync_policys WHERE name = 'ACME Standard'));

-- Demo reading history (audit trail for state changes)
INSERT INTO reading_histories (reading_id, changed_field, old_value, new_value, changed_at, changed_by, revision_id)
VALUES (
  (SELECT id FROM readings WHERE dedupe_id = 'acme-visit-20260314-001'),
  'status', 'scheduled', 'in_progress', '2026-03-14T08:07:00Z', 'diane@acme-firm.example', 1);
INSERT INTO reading_histories (reading_id, changed_field, old_value, new_value, changed_at, changed_by, revision_id)
VALUES (
  (SELECT id FROM readings WHERE dedupe_id = 'acme-visit-20260314-001'),
  'drift_seconds', NULL, '420', '2026-03-14T08:07:00Z', 'system', 2);
INSERT INTO reading_histories (reading_id, changed_field, old_value, new_value, changed_at, changed_by, revision_id)
VALUES (
  (SELECT id FROM readings WHERE dedupe_id = 'acme-visit-20260313-001'),
  'status', 'in_progress', 'completed', '2026-03-13T08:55:00Z', 'jonas@acme-firm.example', 1);

-- Demo calibration logs
INSERT INTO calibration_logs (equipment_id, calibrated_at, calibrated_by, next_calibration, notes, status, reading_id)
VALUES (
  (SELECT id FROM equipments WHERE serial_number = 'ACME-ENV-001'),
  '2026-02-20T09:00:00Z', 'certified-tech@calibration.example', '2026-05-20', 'Q1 calibration passed', 'passed',
  (SELECT id FROM readings WHERE dedupe_id = 'acme-visit-20260310-001'));

-- Demo daily aggregates
INSERT INTO daily_aggregates (date, total_readings, synced_readings, failed_readings, avg_numeric_value, site_id, zone_id)
VALUES ('2026-03-14', 3, 3, 0, 47.9,
  (SELECT id FROM sites WHERE name = 'Main Office - Suite 400'),
  (SELECT id FROM connectivity_zones WHERE name = 'Downtown LA'));
INSERT INTO daily_aggregates (date, total_readings, synced_readings, failed_readings, avg_numeric_value, site_id, zone_id)
VALUES ('2026-03-13', 2, 2, 0, 47.8,
  (SELECT id FROM sites WHERE name = 'Main Office - Suite 400'),
  (SELECT id FROM connectivity_zones WHERE name = 'Downtown LA'));
INSERT INTO daily_aggregates (date, total_readings, synced_readings, failed_readings, avg_numeric_value, site_id, zone_id)
VALUES ('2026-03-11', 2, 2, 0, 48.2,
  (SELECT id FROM sites WHERE name = 'Main Office - Suite 400'),
  (SELECT id FROM connectivity_zones WHERE name = 'Downtown LA'));

-- Demo notifications
INSERT INTO notifications (recipient_email, type, content, is_read, created_at, related_entity_id, related_entity_type)
VALUES ('diane@acme-firm.example', 'visit_started', 'Cleaning visit started 7 minutes late (8:07 vs 8:00 scheduled)', 0, '2026-03-14T08:07:30Z',
  (SELECT id FROM readings WHERE dedupe_id = 'acme-visit-20260314-001'), 'reading');
INSERT INTO notifications (recipient_email, type, content, is_read, created_at, related_entity_id, related_entity_type)
VALUES ('sandra@acme-firm.example', 'weekly_digest', 'Weekly vendor scorecard: CleanPro 85% (2 late, 1 missed), HVACPlus 100% (1 visit)', 1, '2026-03-10T09:00:00Z', NULL, 'digest');
INSERT INTO notifications (recipient_email, type, content, is_read, created_at, related_entity_id, related_entity_type)
VALUES ('diane@acme-firm.example', 'visit_reminder', 'HVAC quarterly service scheduled for Mar 20', 0, '2026-03-14T08:00:00Z',
  (SELECT id FROM maintenance_schedules WHERE notes = 'HVAC filter replacement'), 'maintenance_schedule');

-- Demo audit trails (ledger entries for key events)
INSERT INTO audit_trails (entity_type, entity_id, action, performed_at, performed_by, metadata, device_id)
VALUES ('site_visit',
  (SELECT id FROM site_visits WHERE visit_date = '2026-03-14' AND purpose = 'cleaning'),
  'start', '2026-03-14T08:07:00Z', 'diane@acme-firm.example',
  '{"scheduled_start":"2026-03-14T08:00:00Z","actual_start":"2026-03-14T08:07:00Z","drift_seconds":420,"reason":"vendor_late"}',
  (SELECT id FROM devices WHERE technician_email = 'diane@acme-firm.example'));
INSERT INTO audit_trails (entity_type, entity_id, action, performed_at, performed_by, metadata, device_id)
VALUES ('site_visit',
  (SELECT id FROM site_visits WHERE visit_date = '2026-03-13'),
  'complete', '2026-03-13T08:55:00Z', 'jonas@acme-firm.example',
  '{"scheduled_duration":3600,"actual_duration":2880,"office_signed":true,"counterparty_signed":true,"receipt_hash":"sha256:abc123..."}',
  (SELECT id FROM devices WHERE technician_email = 'jonas@acme-firm.example'));
INSERT INTO audit_trails (entity_type, entity_id, action, performed_at, performed_by, metadata, device_id)
VALUES ('site_visit',
  (SELECT id FROM site_visits WHERE visit_date = '2026-03-09'),
  'mark_missed', '2026-03-09T09:00:00Z', 'system',
  '{"scheduled_start":"2026-03-09T08:00:00Z","window_closed":true,"auto_transition":true}',
  (SELECT id FROM devices WHERE technician_email = 'front-desk@acme-firm.example'));

-- Demo passphrases for devices
INSERT INTO passphrases (hash, salt, is_set, set_at, device_id, failed_attempts)
VALUES ('pbkdf2_sha256_demo_hash_1', 'demo_salt_001', 1, '2026-01-15T00:00:00Z',
  (SELECT id FROM devices WHERE technician_email = 'diane@acme-firm.example'), 0);
INSERT INTO passphrases (hash, salt, is_set, set_at, device_id, failed_attempts)
VALUES ('pbkdf2_sha256_demo_hash_2', 'demo_salt_002', 1, '2026-02-01T00:00:00Z',
  (SELECT id FROM devices WHERE technician_email = 'jonas@acme-firm.example'), 0);

-- Demo encryption keys
INSERT INTO encryption_keys (derived_key, salt, iterations, device_fingerprint, created_at, is_active, device_id)
VALUES ('demo_derived_key_001', 'demo_device_salt_001', 100000, 'iPhone14_2_390_844_6', '2026-01-15T00:00:00Z', 1,
  (SELECT id FROM devices WHERE technician_email = 'diane@acme-firm.example'));
INSERT INTO encryption_keys (derived_key, salt, iterations, device_fingerprint, created_at, is_active, device_id)
VALUES ('demo_derived_key_002', 'demo_device_salt_002', 100000, 'Android13_412_915_8', '2026-02-01T00:00:00Z', 1,
  (SELECT id FROM devices WHERE technician_email = 'jonas@acme-firm.example'));