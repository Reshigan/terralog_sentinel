-- GENERATED seed (skipped in tests, applied on deploy).
-- Demo tenant 'acme-firm' with pre-loaded vendors, calendar events, and partial ledger chain for Now Board demonstration.

-- Clear existing seed data first (idempotent for re-runs)
DELETE FROM outliers WHERE tenant = 'acme-firm';
DELETE FROM reading_historys WHERE tenant = 'acme-firm';
DELETE FROM readings WHERE tenant = 'acme-firm';
DELETE FROM calibration_logs WHERE tenant = 'acme-firm';
DELETE FROM maintenance_schedules WHERE tenant = 'acme-firm';
DELETE FROM site_visits WHERE tenant = 'acme-firm';
DELETE FROM equipments WHERE tenant = 'acme-firm';
DELETE FROM daily_aggregates WHERE tenant = 'acme-firm';
DELETE FROM sync_logs WHERE tenant = 'acme-firm';
DELETE FROM sync_policys WHERE tenant = 'acme-firm';
DELETE FROM passphrases WHERE tenant = 'acme-firm';
DELETE FROM encryption_keys WHERE tenant = 'acme-firm';
DELETE FROM audit_trails WHERE tenant = 'acme-firm';
DELETE FROM notifications WHERE tenant = 'acme-firm';
DELETE FROM sites WHERE tenant = 'acme-firm';
DELETE FROM connectivity_zones WHERE tenant = 'acme-firm';
DELETE FROM devices WHERE tenant = 'acme-firm';
DELETE FROM sync_thresholds WHERE tenant = 'acme-firm';

-- Demo tenant connectivity zone (Los Angeles downtown)
INSERT INTO connectivity_zones (tenant, name, polygon_geojson, sync_success_rate, last_updated, technician_email, status) 
VALUES ('acme-firm', 'Downtown LA', '{"type":"Polygon","coordinates":[[[-118.26,34.04],[-118.22,34.04],[-118.22,34.06],[-118.26,34.06],[-118.26,34.04]]]}', 0.98, '2026-03-14T08:00:00Z', 'ops@acme-firm.example', 'active');

-- Demo tenant sync policy
INSERT INTO sync_policys (tenant, name, min_battery_level, min_network_strength, retry_interval, is_active, created_at, updated_at, zone_id) 
VALUES ('acme-firm', 'ACME Standard', 15, 2, 1800, 1, '2026-01-01T00:00:00Z', '2026-03-14T08:00:00Z', 
  (SELECT id FROM connectivity_zones WHERE tenant = 'acme-firm' LIMIT 1));

-- Demo tenant sync thresholds
INSERT INTO sync_thresholds (tenant, max_attempts, action, is_active, created_at, updated_at) 
VALUES ('acme-firm', 3, 'notify_user', 1, '2026-01-01T00:00:00Z', '2026-03-14T08:00:00Z');
INSERT INTO sync_thresholds (tenant, max_attempts, action, is_active, created_at, updated_at) 
VALUES ('acme-firm', 5, 'disable_device', 1, '2026-01-01T00:00:00Z', '2026-03-14T08:00:00Z');

-- Demo devices for field workers
INSERT INTO devices (tenant, user_agent, screen_width, screen_height, hardware_concurrency, last_seen, technician_email, status, battery_level) 
VALUES ('acme-firm', 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1', 390, 844, 6, '2026-03-14T07:55:00Z', 'marco@acme-firm.example', 'active', 78);
INSERT INTO devices (tenant, user_agent, screen_width, screen_height, hardware_concurrency, last_seen, technician_email, status, battery_level) 
VALUES ('acme-firm', 'Mozilla/5.0 (Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36', 412, 915, 8, '2026-03-14T07:30:00Z', 'jonas@acme-firm.example', 'active', 92);
INSERT INTO devices (tenant, user_agent, screen_width, screen_height, hardware_concurrency, last_seen, technician_email, status, battery_level) 
VALUES ('acme-firm', 'Desklog Terminal/1.0 (Raspberry Pi 4)', 1920, 1080, 4, '2026-03-14T08:00:00Z', 'front-desk@acme-firm.example', 'active', 100);

-- Demo sites (client locations)
INSERT INTO sites (tenant, name, latitude, longitude, mean_value, std_dev, last_sync, sync_success_rate, technician_email, status, zone_id) 
VALUES ('acme-firm', 'Main Office - Suite 400', 34.0522, -118.2437, 47.8, 2.3, '2026-03-14T08:00:00Z', 0.99, 'diane@acme-firm.example', 'active', 
  (SELECT id FROM connectivity_zones WHERE tenant = 'acme-firm' LIMIT 1));
INSERT INTO sites (tenant, name, latitude, longitude, mean_value, std_dev, last_sync, sync_success_rate, technician_email, status, zone_id) 
VALUES ('acme-firm', 'Satellite Office - Burbank', 34.1808, -118.3090, 52.1, 3.1, '2026-03-14T07:45:00Z', 0.97, 'priya@acme-firm.example', 'active', 
  (SELECT id FROM connectivity_zones WHERE tenant = 'acme-firm' LIMIT 1));

-- Demo equipment at main office
INSERT INTO equipments (tenant, serial_number, type, installation_date, last_calibration, site_id, status, warranty_expiry) 
VALUES ('acme-firm', 'ACME-ENV-001', 'environmental_sensor', '2025-06-15', '2026-02-20', 
  (SELECT id FROM sites WHERE tenant = 'acme-firm' AND name = 'Main Office - Suite 400'), 'active', '2028-06-15');
INSERT INTO equipments (tenant, serial_number, type, installation_date, last_calibration, site_id, status, warranty_expiry) 
VALUES ('acme-firm', 'ACME-SEC-002', 'access_control', '2025-03-10', '2026-01-15', 
  (SELECT id FROM sites WHERE tenant = 'acme-firm' AND name = 'Main Office - Suite 400'), 'active', '2027-03-10');
INSERT INTO equipments (tenant, serial_number, type, installation_date, last_calibration, site_id, status, warranty_expiry) 
VALUES ('acme-firm', 'ACME-HVAC-003', 'hvac_monitor', '2025-09-01', '2026-03-01', 
  (SELECT id FROM sites WHERE tenant = 'acme-firm' AND name = 'Main Office - Suite 400'), 'active', '2028-09-01');

-- Demo maintenance schedules
INSERT INTO maintenance_schedules (tenant, equipment_id, scheduled_date, type, status, notes, technician_email) 
VALUES ('acme-firm', 
  (SELECT id FROM equipments WHERE tenant = 'acme-firm' AND serial_number = 'ACME-ENV-001'), 
  '2026-03-15', 'calibration', 'planned', 'Quarterly calibration due', 'vendor@cleanpro.example');
INSERT INTO maintenance_schedules (tenant, equipment_id, scheduled_date, type, status, notes, technician_email) 
VALUES ('acme-firm', 
  (SELECT id FROM equipments WHERE tenant = 'acme-firm' AND serial_number = 'ACME-HVAC-003'), 
  '2026-03-20', 'preventive', 'planned', 'HVAC filter replacement', 'vendor@hvacplus.example');

-- Demo site visits for Now Board (today's schedule)
INSERT INTO site_visits (tenant, site_id, visit_date, purpose, notes, technician_email, status, equipment_id) 
VALUES ('acme-firm', 
  (SELECT id FROM sites WHERE tenant = 'acme-firm' AND name = 'Main Office - Suite 400'), 
  '2026-03-14', 'cleaning', 'Weekly M/W/F cleaning service', 'vendor@cleanpro.example', 'in_progress', 
  (SELECT id FROM equipments WHERE tenant = 'acme-firm' AND serial_number = 'ACME-ENV-001'));
INSERT INTO site_visits (tenant, site_id, visit_date, purpose, notes, technician_email, status, equipment_id) 
VALUES ('acme-firm', 
  (SELECT id FROM sites WHERE tenant = 'acme-firm' AND name = 'Main Office - Suite 400'), 
  '2026-03-14', 'courier_pickup', 'Daily 4pm courier collection', 'vendor@swiftcourier.example', 'scheduled', NULL);
INSERT INTO site_visits (tenant, site_id, visit_date, purpose, notes, technician_email, status, equipment_id) 
VALUES ('acme-firm', 
  (SELECT id FROM sites WHERE tenant = 'acme-firm' AND name = 'Main Office - Suite 400'), 
  '2026-03-13', 'cleaning', 'Weekly M/W/F cleaning service', 'vendor@cleanpro.example', 'completed', 
  (SELECT id FROM equipments WHERE tenant = 'acme-firm' AND serial_number = 'ACME-ENV-001'));
INSERT INTO site_visits (tenant, site_id, visit_date, purpose, notes, technician_email, status, equipment_id) 
VALUES ('acme-firm', 
  (SELECT id FROM sites WHERE tenant = 'acme-firm' AND name = 'Main Office - Suite 400'), 
  '2026-03-11', 'cleaning', 'Weekly M/W/F cleaning service', 'vendor@cleanpro.example', 'completed', 
  (SELECT id FROM equipments WHERE tenant = 'acme-firm' AND serial_number = 'ACME-ENV-001'));
INSERT INTO site_visits (tenant, site_id, visit_date, purpose, notes, technician_email, status, equipment_id) 
VALUES ('acme-firm', 
  (SELECT id FROM sites WHERE tenant = 'acme-firm' AND name = 'Main Office - Suite 400'), 
  '2026-03-10', 'hvac_service', 'Quarterly HVAC maintenance', 'vendor@hvacplus.example', 'completed', 
  (SELECT id FROM equipments WHERE tenant = 'acme-firm' AND serial_number = 'ACME-HVAC-003'));
INSERT INTO site_visits (tenant, site_id, visit_date, purpose, notes, technician_email, status, equipment_id) 
VALUES ('acme-firm', 
  (SELECT id FROM sites WHERE tenant = 'acme-firm' AND name = 'Main Office - Suite 400'), 
  '2026-03-09', 'cleaning', 'Weekly M/W/F cleaning service - NO SHOW', 'vendor@cleanpro.example', 'missed', 
  (SELECT id FROM equipments WHERE tenant = 'acme-firm' AND serial_number = 'ACME-ENV-001'));

-- Demo readings (visit confirmations with photos)
INSERT INTO readings (tenant, photo, latitude, longitude, numeric_value, timestamp, encrypted_blob, sync_status, sync_attempts, dedupe_id, site_id, device_id, equipment_id, calibration_id) 
VALUES ('acme-firm', 'acme_cleaning_20260313_0807_photo1.jpg', 34.0523, -118.2436, 47.8, '2026-03-13T08:07:00Z', 'sealed_receipt_encrypted_json', 'synced', 1, 'acme-visit-20260313-001', 
  (SELECT id FROM sites WHERE tenant = 'acme-firm' AND name = 'Main Office - Suite 400'),
  (SELECT id FROM devices WHERE tenant = 'acme-firm' AND technician_email = 'diane@acme-firm.example'),
  (SELECT id FROM equipments WHERE tenant = 'acme-firm' AND serial_number = 'ACME-ENV-001'), NULL);
INSERT INTO readings (tenant, photo, latitude, longitude, numeric_value, timestamp, encrypted_blob, sync_status, sync_attempts, dedupe_id, site_id, device_id, equipment_id, calibration_id) 
VALUES ('acme-firm', 'acme_cleaning_20260311_0755_photo1.jpg', 34.0521, -118.2438, 48.2, '2026-03-11T07:55:00Z', 'sealed_receipt_encrypted_json', 'synced', 1, 'acme-visit-20260311-001', 
  (SELECT id FROM sites WHERE tenant = 'acme-firm' AND name = 'Main Office - Suite 400'),
  (SELECT id FROM devices WHERE tenant = 'acme-firm' AND technician_email = 'diane@acme-firm.example'),
  (SELECT id FROM equipments WHERE tenant = 'acme-firm' AND serial_number = 'ACME-ENV-001'), NULL);
INSERT INTO readings (tenant, photo, latitude, longitude, numeric_value, timestamp, encrypted_blob, sync_status, sync_attempts, dedupe_id, site_id, device_id, equipment_id, calibration_id) 
VALUES ('acme-firm', 'acme_hvac_20260310_1405_photo1.jpg', 34.0522, -118.2437, 51.5, '2026-03-10T14:05:00Z', 'sealed_receipt_encrypted_json', 'synced', 1, 'acme-visit-20260310-001', 
  (SELECT id FROM sites WHERE tenant = 'acme-firm' AND name = 'Main Office - Suite 400'),
  (SELECT id FROM devices WHERE tenant = 'acme-firm' AND technician_email = 'marco@acme-firm.example'),
  (SELECT id FROM equipments WHERE tenant = 'acme-firm' AND serial_number = 'ACME-HVAC-003'), NULL);

-- Today's in-progress reading (started late at 8:07, scheduled 8:00)
INSERT INTO readings (tenant, photo, latitude, longitude, numeric_value, timestamp, encrypted_blob, sync_status, sync_attempts, dedupe_id, site_id, device_id, equipment_id, calibration_id) 
VALUES ('acme-firm', NULL, 34.0522, -118.2437, 47.9, '2026-03-14T08:07:00Z', 'visit_started_encrypted_json', 'synced', 1, 'acme-visit-20260314-001', 
  (SELECT id FROM sites WHERE tenant = 'acme-firm' AND name = 'Main Office - Suite 400'),
  (SELECT id FROM devices WHERE tenant = 'acme-firm' AND technician_email = 'diane@acme-firm.example'),
  (SELECT id FROM equipments WHERE tenant = 'acme-firm' AND serial_number = 'ACME-ENV-001'), NULL);

-- Demo outliers (one resolved, one pending review)
INSERT INTO outliers (tenant, reading_id, detected_at, z_score, is_resolved, resolved_at, resolved_by, site_id, notification_id) 
VALUES ('acme-firm', 
  (SELECT id FROM readings WHERE tenant = 'acme-firm' AND dedupe_id = 'acme-visit-20260309-001'),
  '2026-03-09T08:15:00Z', 2.8, 1, '2026-03-09T09:30:00Z', 'diane@acme-firm.example',
  (SELECT id FROM sites WHERE tenant = 'acme-firm' AND name = 'Main Office - Suite 400'), NULL);
INSERT INTO outliers (tenant, reading_id, detected_at, z_score, is_resolved, resolved_at, resolved_by, site_id, notification_id) 
VALUES ('acme-firm', 
  (SELECT id FROM readings WHERE tenant = 'acme-firm' AND dedupe_id = 'acme-visit-20260314-001'),
  '2026-03-14T08:10:00Z', 1.5, 0, NULL, '',
  (SELECT id FROM sites WHERE tenant = 'acme-firm' AND name = 'Main Office - Suite 400'), NULL);

-- Demo sync logs
INSERT INTO sync_logs (tenant, reading_id, attempted_at, status, response_code, error_message, sync_policy_id) 
VALUES ('acme-firm', 
  (SELECT id FROM readings WHERE tenant = 'acme-firm' AND dedupe_id = 'acme-visit-20260313-001'),
  '2026-03-13T08:08:00Z', 'success', 200, '', 
  (SELECT id FROM sync_policys WHERE tenant = 'acme-firm' LIMIT 1));
INSERT INTO sync_logs (tenant, reading_id, attempted_at, status, response_code, error_message, sync_policy_id) 
VALUES ('acme-firm', 
  (SELECT id FROM readings WHERE tenant = 'acme-firm' AND dedupe_id = 'acme-visit-20260314-001'),
  '2026-03-14T08:08:00Z', 'success', 200, '', 
  (SELECT id FROM sync_policys WHERE tenant = 'acme-firm' LIMIT 1));

-- Demo reading history (audit trail for state changes)
INSERT INTO reading_historys (tenant, reading_id, changed_field, old_value, new_value, changed_at, changed_by, revision_id) 
VALUES ('acme-firm', 
  (SELECT id FROM readings WHERE tenant = 'acme-firm' AND dedupe_id = 'acme-visit-20260314-001'),
  'status', 'scheduled', 'in_progress', '2026-03-14T08:07:00Z', 'diane@acme-firm.example', 1);
INSERT INTO reading_historys (tenant, reading_id, changed_field, old_value, new_value, changed_at, changed_by, revision_id) 
VALUES ('acme-firm', 
  (SELECT id FROM readings WHERE tenant = 'acme-firm' AND dedupe_id = 'acme-visit-20260314-001'),
  'drift_seconds', NULL, '420', '2026-03-14T08:07:00Z', 'system', 2);
INSERT INTO reading_historys (tenant, reading_id, changed_field, old_value, new_value, changed_at, changed_by, revision_id) 
VALUES ('acme-firm', 
  (SELECT id FROM readings WHERE tenant = 'acme-firm' AND dedupe_id = 'acme-visit-20260313-001'),
  'status', 'in_progress', 'completed', '2026-03-13T08:55:00Z', 'jonas@acme-firm.example', 1);

-- Demo calibration logs
INSERT INTO calibration_logs (tenant, equipment_id, calibrated_at, calibrated_by, next_calibration, notes, status, reading_id) 
VALUES ('acme-firm', 
  (SELECT id FROM equipments WHERE tenant = 'acme-firm' AND serial_number = 'ACME-ENV-001'),
  '2026-02-20T09:00:00Z', 'certified-tech@calibration.example', '2026-05-20', 'Q1 calibration passed', 'passed', 
  (SELECT id FROM readings WHERE tenant = 'acme-firm' AND dedupe_id = 'acme-visit-20260310-001'));

-- Demo daily aggregates
INSERT INTO daily_aggregates (tenant, date, total_readings, synced_readings, failed_readings, avg_numeric_value, site_id, zone_id) 
VALUES ('acme-firm', '2026-03-14', 3, 3, 0, 47.9, 
  (SELECT id FROM sites WHERE tenant = 'acme-firm' AND name = 'Main Office - Suite 400'),
  (SELECT id FROM connectivity_zones WHERE tenant = 'acme-firm' LIMIT 1));
INSERT INTO daily_aggregates (tenant, date, total_readings, synced_readings, failed_readings, avg_numeric_value, site_id, zone_id) 
VALUES ('acme-firm', '2026-03-13', 2, 2, 0, 47.8, 
  (SELECT id FROM sites WHERE tenant = 'acme-firm' AND name = 'Main Office - Suite 400'),
  (SELECT id FROM connectivity_zones WHERE tenant = 'acme-firm' LIMIT 1));
INSERT INTO daily_aggregates (tenant, date, total_readings, synced_readings, failed_readings, avg_numeric_value, site_id, zone_id) 
VALUES ('acme-firm', '2026-03-11', 2, 2, 0, 48.2, 
  (SELECT id FROM sites WHERE tenant = 'acme-firm' AND name = 'Main Office - Suite 400'),
  (SELECT id FROM connectivity_zones WHERE tenant = 'acme-firm' LIMIT 1));

-- Demo notifications
INSERT INTO notifications (tenant, recipient_email, type, content, is_read, created_at, related_entity_id, related_entity_type) 
VALUES ('acme-firm', 'diane@acme-firm.example', 'visit_started', 'Cleaning visit started 7 minutes late (8:07 vs 8:00 scheduled)', 0, '2026-03-14T08:07:30Z', 
  (SELECT id FROM readings WHERE tenant = 'acme-firm' AND dedupe_id = 'acme-visit-20260314-001'), 'reading');
INSERT INTO notifications (tenant, recipient_email, type, content, is_read, created_at, related_entity_id, related_entity_type) 
VALUES ('acme-firm', 'sandra@acme-firm.example', 'weekly_digest', 'Weekly vendor scorecard: CleanPro 85% (2 late, 1 missed), HVACPlus 100% (1 visit)', 1, '2026-03-10T09:00:00Z', NULL, 'digest');
INSERT INTO notifications (tenant, recipient_email, type, content, is_read, created_at, related_entity_id, related_entity_type) 
VALUES ('acme-firm', 'diane@acme-firm.example', 'visit_reminder', 'HVAC quarterly service scheduled for Mar 20', 0, '2026-03-14T08:00:00Z', 
  (SELECT id FROM maintenance_schedules WHERE tenant = 'acme-firm' LIMIT 1), 'maintenance_schedule');

-- Demo audit trails (ledger entries for key events)
INSERT INTO audit_trails (tenant, entity_type, entity_id, action, performed_at, performed_by, metadata, device_id) 
VALUES ('acme-firm', 'site_visit', 
  (SELECT id FROM site_visits WHERE tenant = 'acme-firm' AND visit_date = '2026-03-14'),
  'start', '2026-03-14T08:07:00Z', 'diane@acme-firm.example', 
  '{"scheduled_start":"2026-03-14T08:00:00Z","actual_start":"2026-03-14T08:07:00Z","drift_seconds":420,"reason":"vendor_late"}',
  (SELECT id FROM devices WHERE tenant = 'acme-firm' AND technician_email = 'diane@acme-firm.example'));
INSERT INTO audit_trails (tenant, entity_type, entity_id, action, performed_at, performed_by, metadata, device_id) 
VALUES ('acme-firm', 'site_visit', 
  (SELECT id FROM site_visits WHERE tenant = 'acme-firm' AND visit_date = '2026-03-13'),
  'complete', '2026-03-13T08:55:00Z', 'jonas@acme-firm.example', 
  '{"scheduled_duration":3600,"actual_duration":2880,"office_signed":true,"counterparty_signed":true,"receipt_hash":"sha256:abc123..."}',
  (SELECT id FROM devices WHERE tenant = 'acme-firm' AND technician_email = 'jonas@acme-firm.example'));
INSERT INTO audit_trails (tenant, entity_type, entity_id, action, performed_at, performed_by, metadata, device_id) 
VALUES ('acme-firm', 'site_visit', 
  (SELECT id FROM site_visits WHERE tenant = 'acme-firm' AND visit_date = '2026-03-09'),
  'mark_missed', '2026-03-09T09:00:00Z', 'system', 
  '{"scheduled_start":"2026-03-09T08:00:00Z","window_closed":true,"auto_transition":true}',
  (SELECT id FROM devices WHERE tenant = 'acme-firm' AND technician_email = 'front-desk@acme-firm.example'));

-- Demo passphrases for devices
INSERT INTO passphrases (tenant, hash, salt, is_set, set_at, device_id, failed_attempts) 
VALUES ('acme-firm', 'pbkdf2_sha256_demo_hash_1', 'demo_salt_001', 1, '2026-01-15T00:00:00Z', 
  (SELECT id FROM devices WHERE tenant = 'acme-firm' AND technician_email = 'diane@acme-firm.example'), 0);
INSERT INTO passphrases (tenant, hash, salt, is_set, set_at, device_id, failed_attempts) 
VALUES ('acme-firm', 'pbkdf2_sha256_demo_hash_2', 'demo_salt_002', 1, '2026-02-01T00:00:00Z', 
  (SELECT id FROM devices WHERE tenant = 'acme-firm' AND technician_email = 'jonas@acme-firm.example'), 0);

-- Demo encryption keys
INSERT INTO encryption_keys (tenant, derived_key, salt, iterations, device_fingerprint, created_at, is_active, device_id) 
VALUES ('acme-firm', 'demo_derived_key_001', 'demo_device_salt_001', 100000, 'iPhone14_2_390_844_6', '2026-01-15T00:00:00Z', 1, 
  (SELECT id FROM devices WHERE tenant = 'acme-firm' AND technician_email = 'diane@acme-firm.example'));
INSERT INTO encryption_keys (tenant, derived_key, salt, iterations, device_fingerprint, created_at, is_active, device_id) 
VALUES ('acme-firm', 'demo_derived_key_002', 'demo_device_salt_002', 100000, 'Android13_412_915_8', '2026-02-01T00:00:00Z', 1, 
  (SELECT id FROM devices WHERE tenant = 'acme-firm' AND technician_email = 'jonas@acme-firm.example'));

-- Legacy seed data (preserved for backward compatibility)
INSERT INTO devices (user_agent, screen_width, screen_height, hardware_concurrency, last_seen, technician_email, status, battery_level) VALUES ('Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Mobile Safari/537.36', 1080, 1920, 4, '2026-03-14', 'tech1@field.example', 'active', 85);
INSERT INTO devices (user_agent, screen_width, screen_height, hardware_concurrency, last_seen, technician_email, status, battery_level) VALUES ('Atlas Device', 125, 125, 125, '2026-01-15', 'ops2@device.example.com', 'lost', 125);
INSERT INTO devices (user_agent, screen_width, screen_height, hardware_concurrency, last_seen, technician_email, status, battery_level) VALUES ('Meridian Device', 150, 150, 150, '2026-01-24', 'ops3@device.example.com', 'retired', 150);
INSERT INTO sync_thresholds (max_attempts, action, is_active, created_at, updated_at) VALUES (5, 'erase_key', 1, '2026-03-01', '2026-03-01');
INSERT INTO sync_thresholds (max_attempts, action, is_active, created_at, updated_at) VALUES (125, 'notify_user', 0, '2026-01-15', '2026-01-15');
INSERT INTO sync_thresholds (max_attempts, action, is_active, created_at, updated_at) VALUES (150, 'disable_device', 1, '2026-01-24', '2026-01-24');
INSERT INTO passphrases (hash, salt, is_set, set_at, device_id, failed_attempts) VALUES ('pbkdf2_sha256_hash', 'passphrase_salt', 1, '2026-03-14', 1, 0);
INSERT INTO passphrases (hash, salt, is_set, set_at, device_id, failed_attempts) VALUES ('Atlas Passphrase', 'Atlas Passphrase', 0, '2026-01-15', 2, 125);
INSERT INTO passphrases (hash, salt, is_set, set_at, device_id, failed_attempts) VALUES ('Meridian Passphrase', 'Meridian Passphrase', 1, '2026-01-24', 3, 150);
INSERT INTO connectivity_zones (name, polygon_geojson, sync_success_rate, last_updated, technician_email, status) VALUES ('Zone_A', '{"type":"Polygon","coordinates":[[[-118.25,34.04],[-118.23,34.04],[-118.23,34.06],[-118.25,34.06],[-118.25,34.04]]]}', 0.85, '2026-03-14', 'supervisor@field.example', 'active');
INSERT INTO connectivity_zones (name, polygon_geojson, sync_success_rate, last_updated, technician_email, status) VALUES ('Atlas Connectivity zone', 'Atlas Connectivity zone', 2190.75, '2026-01-15', 'ops2@connectivityzone.example.com', 'monitoring');
INSERT INTO connectivity_zones (name, polygon_geojson, sync_success_rate, last_updated, technician_email, status) VALUES ('Meridian Connectivity zone', 'Meridian Connectivity zone', 3131, '2026-01-24', 'ops3@connectivityzone.example.com', 'degraded');
INSERT INTO notifications (recipient_email, type, content, is_read, created_at, related_entity_id, related_entity_type) VALUES ('supervisor@field.example', 'outlier_detected', 'Outlier detected at Pipeline_Alpha_03', 0, '2026-03-14T10:10:00Z', 1, 'reading');
INSERT INTO notifications (recipient_email, type, content, is_read, created_at, related_entity_id, related_entity_type) VALUES ('ops2@notification.example.com', 'outlier_detected', 'Atlas Notification', 0, '2026-01-15', 125, 'site_visit');
INSERT INTO notifications (recipient_email, type, content, is_read, created_at, related_entity_id, related_entity_type) VALUES ('ops3@notification.example.com', 'visit_reminder', 'Meridian Notification', 1, '2026-01-24', 150, 'equipment');
INSERT INTO sync_policys (name, min_battery_level, min_network_strength, retry_interval, is_active, created_at, updated_at, zone_id) VALUES ('Standard', 20, 3, 3600, 1, '2026-03-01', '2026-03-01', 1);
INSERT INTO sync_policys (name, min_battery_level, min_network_strength, retry_interval, is_active, created_at, updated_at, zone_id) VALUES ('Atlas Sync policy', 125, 125, 125, 0, '2026-01-15', '2026-01-15', 2);
INSERT INTO sync_policys (name, min_battery_level, min_network_strength, retry_interval, is_active, created_at, updated_at, zone_id) VALUES ('Meridian Sync policy', 150, 150, 150, 1, '2026-01-24', '2026-01-24', 3);
INSERT INTO audit_trails (entity_type, entity_id, action, performed_at, performed_by, metadata, device_id) VALUES ('reading', 1, 'create', '2026-03-14T10:00:00Z', 'tech1@field.example', '{"photo":"base64_encoded_jpeg","numeric_value":48.5}', 1);
INSERT INTO audit_trails (entity_type, entity_id, action, performed_at, performed_by, metadata, device_id) VALUES ('Atlas Audit trail', 125, 'update', '2026-01-15', 'Atlas Audit trail', 'Atlas Audit trail', 2);
INSERT INTO audit_trails (entity_type, entity_id, action, performed_at, performed_by, metadata, device_id) VALUES ('Meridian Audit trail', 150, 'delete', '2026-01-24', 'Meridian Audit trail', 'Meridian Audit trail', 3);
INSERT INTO sites (name, latitude, longitude, mean_value, std_dev, last_sync, sync_success_rate, technician_email, status, zone_id) VALUES ('Pipeline_Alpha_03', 34.0522, -118.2437, 45.2, 3.1, '2026-03-14', 0.92, 'tech1@field.example', 'active', 1);
INSERT INTO sites (name, latitude, longitude, mean_value, std_dev, last_sync, sync_success_rate, technician_email, status, zone_id) VALUES ('Atlas Site', 125.5, 125.5, 2190.75, 125.5, '2026-01-15', 2190.75, 'ops2@site.example.com', 'maintenance', 2);
INSERT INTO sites (name, latitude, longitude, mean_value, std_dev, last_sync, sync_success_rate, technician_email, status, zone_id) VALUES ('Meridian Site', 150.5, 150.5, 3131, 150.5, '2026-01-24', 3131, 'ops3@site.example.com', 'decommissioned', 3);
INSERT INTO encryption_keys (derived_key, salt, iterations, device_fingerprint, created_at, is_active, device_id) VALUES ('pbkdf2_sha256_derived_key', 'device_salt_sha256', 100000, 'Mozilla/5.0_1080_1920_4', '2026-03-14', 1, 1);
INSERT INTO encryption_keys (derived_key, salt, iterations, device_fingerprint, created_at, is_active, device_id) VALUES ('Atlas Encryption key', 'Atlas Encryption key', 125, 'Atlas Encryption key', '2026-01-15', 0, 2);
INSERT INTO encryption_keys (derived_key, salt, iterations, device_fingerprint, created_at, is_active, device_id) VALUES ('Meridian Encryption key', 'Meridian Encryption key', 150, 'Meridian Encryption key', '2026-01-24', 1, 3);
INSERT INTO daily_aggregates (date, total_readings, synced_readings, failed_readings, avg_numeric_value, site_id, zone_id) VALUES ('2026-03-14', 1, 1, 0, 48.5, 1, 1);
INSERT INTO daily_aggregates (date, total_readings, synced_readings, failed_readings, avg_numeric_value, site_id, zone_id) VALUES ('2026-01-15', 2190, 125, 125, 2190.75, 2, 2);
INSERT INTO daily_aggregates (date, total_readings, synced_readings, failed_readings, avg_numeric_value, site_id, zone_id) VALUES ('2026-01-24', 3130, 150, 150, 3131, 3, 3);
INSERT INTO equipments (serial_number, type, installation_date, last_calibration, site_id, status, warranty_expiry) VALUES ('SN-2026-001', 'sensor', '2026-01-15', '2026-02-20', 1, 'active', '2028-01-15');
INSERT INTO equipments (serial_number, type, installation_date, last_calibration, site_id, status, warranty_expiry) VALUES ('EQU-1002', 'camera', '2026-01-15', '2026-01-15', 2, 'maintenance', '2026-01-15');
INSERT INTO equipments (serial_number, type, installation_date, last_calibration, site_id, status, warranty_expiry) VALUES ('EQU-1003', 'gps_unit', '2026-01-24', '2026-01-24', 3, 'retired', '2026-01-24');
INSERT INTO maintenance_schedules (equipment_id, scheduled_date, type, status, notes, technician_email) VALUES (1, '2026-09-20', 'calibration', 'planned', 'Next calibration due', 'tech1@field.example');
INSERT INTO maintenance_schedules (equipment_id, scheduled_date, type, status, notes, technician_email) VALUES (2, '2026-01-15', 'corrective', 'completed', 'Maintenance schedule 2 reviewed by operations; no exceptions outstanding.', 'ops2@maintenanceschedule.example.com');
INSERT INTO maintenance_schedules (equipment_id, scheduled_date, type, status, notes, technician_email) VALUES (3, '2026-01-24', 'calibration', 'cancelled', 'Maintenance schedule 3 reviewed by operations; no exceptions outstanding.', 'ops3@maintenanceschedule.example.com');
INSERT INTO site_visits (site_id, visit_date, purpose, notes, technician_email, status, equipment_id) VALUES (1, '2026-03-20', 'inspection', 'Routine inspection', 'tech1@field.example', 'planned', 1);
INSERT INTO site_visits (site_id, visit_date, purpose, notes, technician_email, status, equipment_id) VALUES (2, '2026-01-15', 'maintenance', 'Site visit 2 reviewed by operations; no exceptions outstanding.', 'ops2@sitevisit.example.com', 'completed', 2);
INSERT INTO site_visits (site_id, visit_date, purpose, notes, technician_email, status, equipment_id) VALUES (3, '2026-01-24', 'installation', 'Site visit 3 reviewed by operations; no exceptions outstanding.', 'ops3@sitevisit.example.com', 'cancelled', 3);
INSERT INTO readings (photo, latitude, longitude, numeric_value, timestamp, encrypted_blob, sync_status, sync_attempts, dedupe_id, site_id, device_id, equipment_id, calibration_id) VALUES ('base64_encoded_jpeg', 34.0522, -118.2437, 48.5, '2026-03-14T10:00:00Z', 'aes256_gcm_encrypted_json', 'synced', 1, 'terminus-field-uuidv5-hash', 1, 1, 1, NULL);
INSERT INTO readings (photo, latitude, longitude, numeric_value, timestamp, encrypted_blob, sync_status, sync_attempts, dedupe_id, site_id, device_id, equipment_id, calibration_id) VALUES ('Atlas Reading', 125.5, 125.5, 2190.75, '2026-01-15', 'Atlas Reading', 'synced', 125, 'Atlas Reading', 2, 2, 2, NULL);
INSERT INTO readings (photo, latitude, longitude, numeric_value, timestamp, encrypted_blob, sync_status, sync_attempts, dedupe_id, site_id, device_id, equipment_id, calibration_id) VALUES ('Meridian Reading', 150.5, 150.5, 3131, '2026-01-24', 'Meridian Reading', 'failed', 150, 'Meridian Reading', 3, 3, 3, NULL);
INSERT INTO sync_logs (reading_id, attempted_at, status, response_code, error_message, sync_policy_id) VALUES (1, '2026-03-14T10:05:00Z', 'success', 200, '', 1);
INSERT INTO sync_logs (reading_id, attempted_at, status, response_code, error_message, sync_policy_id) VALUES (2, '2026-01-15', 'failure', 125, 'Atlas Sync log', 2);
INSERT INTO sync_logs (reading_id, attempted_at, status, response_code, error_message, sync_policy_id) VALUES (3, '2026-01-24', 'retry', 150, 'Meridian Sync log', 3);
INSERT INTO outliers (reading_id, detected_at, z_score, is_resolved, resolved_at, resolved_by, site_id, notification_id) VALUES (1, '2026-03-14T10:10:00Z', 2.1, 0, NULL, '', 1, 1);
INSERT INTO outliers (reading_id, detected_at, z_score, is_resolved, resolved_at, resolved_by, site_id, notification_id) VALUES (2, '2026-01-15', 125.5, 0, '2026-01-15', 'Atlas Outlier', 2, 2);
INSERT INTO outliers (reading_id, detected_at, z_score, is_resolved, resolved_at, resolved_by, site_id, notification_id) VALUES (3, '2026-01-24', 150.5, 1, '2026-01-24', 'Meridian Outlier', 3, 3);
INSERT INTO reading_historys (reading_id, changed_field, old_value, new_value, changed_at, changed_by, revision_id) VALUES (1, 'sync_status', 'pending', 'synced', '2026-03-14T10:05:00Z', 'system', 1);
INSERT INTO reading_historys (reading_id, changed_field, old_value, new_value, changed_at, changed_by, revision_id) VALUES (2, 'Atlas Reading history', 'Atlas Reading history', 'Atlas Reading history', '2026-01-15', 'Atlas Reading history', 125);
INSERT INTO reading_historys (reading_id, changed_field, old_value, new_value, changed_at, changed_by, revision_id) VALUES (3, 'Meridian Reading history', 'Meridian Reading history', 'Meridian Reading history', '2026-01-24', 'Meridian Reading history', 150);
INSERT INTO calibration_logs (equipment_id, calibrated_at, calibrated_by, next_calibration, notes, status, reading_id) VALUES (1, '2026-02-20', 'tech1@field.example', '2026-08-20', 'Calibration passed', 'passed', 1);
INSERT INTO calibration_logs (equipment_id, calibrated_at, calibrated_by, next_calibration, notes, status, reading_id) VALUES (2, '2026-01-15', 'Atlas Calibration log', '2026-01-15', 'Calibration log 2 reviewed by operations; no exceptions outstanding.', 'failed', 2);
INSERT INTO calibration_logs (equipment_id, calibrated_at, calibrated_by, next_calibration, notes, status, reading_id) VALUES (3, '2026-01-24', 'Meridian Calibration log', '2026-01-24', 'Calibration log 3 reviewed by operations; no exceptions outstanding.', 'pending_review', 3);