-- GENERATED search schema (FTS5). Do not edit.
CREATE VIRTUAL TABLE IF NOT EXISTS readings_fts USING fts5(
  photo, encrypted_blob, sync_status, dedupe_id,
  content='readings', content_rowid='id'
);
-- Backfill: rows from an earlier migration (0002_seed.sql) predate the triggers.
INSERT INTO readings_fts(readings_fts) VALUES ('rebuild');
CREATE TRIGGER IF NOT EXISTS readings_fts_ai AFTER INSERT ON readings BEGIN
  INSERT INTO readings_fts(rowid, photo, encrypted_blob, sync_status, dedupe_id) VALUES (new.id, new.photo, new.encrypted_blob, new.sync_status, new.dedupe_id);
END;
CREATE TRIGGER IF NOT EXISTS readings_fts_ad AFTER DELETE ON readings BEGIN
  INSERT INTO readings_fts(readings_fts, rowid, photo, encrypted_blob, sync_status, dedupe_id) VALUES ('delete', old.id, old.photo, old.encrypted_blob, old.sync_status, old.dedupe_id);
END;
CREATE TRIGGER IF NOT EXISTS readings_fts_au AFTER UPDATE ON readings BEGIN
  INSERT INTO readings_fts(readings_fts, rowid, photo, encrypted_blob, sync_status, dedupe_id) VALUES ('delete', old.id, old.photo, old.encrypted_blob, old.sync_status, old.dedupe_id);
  INSERT INTO readings_fts(rowid, photo, encrypted_blob, sync_status, dedupe_id) VALUES (new.id, new.photo, new.encrypted_blob, new.sync_status, new.dedupe_id);
END;

CREATE VIRTUAL TABLE IF NOT EXISTS sites_fts USING fts5(
  name, technician_email, status,
  content='sites', content_rowid='id'
);
-- Backfill: rows from an earlier migration (0002_seed.sql) predate the triggers.
INSERT INTO sites_fts(sites_fts) VALUES ('rebuild');
CREATE TRIGGER IF NOT EXISTS sites_fts_ai AFTER INSERT ON sites BEGIN
  INSERT INTO sites_fts(rowid, name, technician_email, status) VALUES (new.id, new.name, new.technician_email, new.status);
END;
CREATE TRIGGER IF NOT EXISTS sites_fts_ad AFTER DELETE ON sites BEGIN
  INSERT INTO sites_fts(sites_fts, rowid, name, technician_email, status) VALUES ('delete', old.id, old.name, old.technician_email, old.status);
END;
CREATE TRIGGER IF NOT EXISTS sites_fts_au AFTER UPDATE ON sites BEGIN
  INSERT INTO sites_fts(sites_fts, rowid, name, technician_email, status) VALUES ('delete', old.id, old.name, old.technician_email, old.status);
  INSERT INTO sites_fts(rowid, name, technician_email, status) VALUES (new.id, new.name, new.technician_email, new.status);
END;

CREATE VIRTUAL TABLE IF NOT EXISTS sync_logs_fts USING fts5(
  status, error_message,
  content='sync_logs', content_rowid='id'
);
-- Backfill: rows from an earlier migration (0002_seed.sql) predate the triggers.
INSERT INTO sync_logs_fts(sync_logs_fts) VALUES ('rebuild');
CREATE TRIGGER IF NOT EXISTS sync_logs_fts_ai AFTER INSERT ON sync_logs BEGIN
  INSERT INTO sync_logs_fts(rowid, status, error_message) VALUES (new.id, new.status, new.error_message);
END;
CREATE TRIGGER IF NOT EXISTS sync_logs_fts_ad AFTER DELETE ON sync_logs BEGIN
  INSERT INTO sync_logs_fts(sync_logs_fts, rowid, status, error_message) VALUES ('delete', old.id, old.status, old.error_message);
END;
CREATE TRIGGER IF NOT EXISTS sync_logs_fts_au AFTER UPDATE ON sync_logs BEGIN
  INSERT INTO sync_logs_fts(sync_logs_fts, rowid, status, error_message) VALUES ('delete', old.id, old.status, old.error_message);
  INSERT INTO sync_logs_fts(rowid, status, error_message) VALUES (new.id, new.status, new.error_message);
END;

CREATE VIRTUAL TABLE IF NOT EXISTS encryption_keys_fts USING fts5(
  derived_key, salt, device_fingerprint,
  content='encryption_keys', content_rowid='id'
);
-- Backfill: rows from an earlier migration (0002_seed.sql) predate the triggers.
INSERT INTO encryption_keys_fts(encryption_keys_fts) VALUES ('rebuild');
CREATE TRIGGER IF NOT EXISTS encryption_keys_fts_ai AFTER INSERT ON encryption_keys BEGIN
  INSERT INTO encryption_keys_fts(rowid, derived_key, salt, device_fingerprint) VALUES (new.id, new.derived_key, new.salt, new.device_fingerprint);
END;
CREATE TRIGGER IF NOT EXISTS encryption_keys_fts_ad AFTER DELETE ON encryption_keys BEGIN
  INSERT INTO encryption_keys_fts(encryption_keys_fts, rowid, derived_key, salt, device_fingerprint) VALUES ('delete', old.id, old.derived_key, old.salt, old.device_fingerprint);
END;
CREATE TRIGGER IF NOT EXISTS encryption_keys_fts_au AFTER UPDATE ON encryption_keys BEGIN
  INSERT INTO encryption_keys_fts(encryption_keys_fts, rowid, derived_key, salt, device_fingerprint) VALUES ('delete', old.id, old.derived_key, old.salt, old.device_fingerprint);
  INSERT INTO encryption_keys_fts(rowid, derived_key, salt, device_fingerprint) VALUES (new.id, new.derived_key, new.salt, new.device_fingerprint);
END;

CREATE VIRTUAL TABLE IF NOT EXISTS devices_fts USING fts5(
  user_agent, technician_email, status,
  content='devices', content_rowid='id'
);
-- Backfill: rows from an earlier migration (0002_seed.sql) predate the triggers.
INSERT INTO devices_fts(devices_fts) VALUES ('rebuild');
CREATE TRIGGER IF NOT EXISTS devices_fts_ai AFTER INSERT ON devices BEGIN
  INSERT INTO devices_fts(rowid, user_agent, technician_email, status) VALUES (new.id, new.user_agent, new.technician_email, new.status);
END;
CREATE TRIGGER IF NOT EXISTS devices_fts_ad AFTER DELETE ON devices BEGIN
  INSERT INTO devices_fts(devices_fts, rowid, user_agent, technician_email, status) VALUES ('delete', old.id, old.user_agent, old.technician_email, old.status);
END;
CREATE TRIGGER IF NOT EXISTS devices_fts_au AFTER UPDATE ON devices BEGIN
  INSERT INTO devices_fts(devices_fts, rowid, user_agent, technician_email, status) VALUES ('delete', old.id, old.user_agent, old.technician_email, old.status);
  INSERT INTO devices_fts(rowid, user_agent, technician_email, status) VALUES (new.id, new.user_agent, new.technician_email, new.status);
END;

CREATE VIRTUAL TABLE IF NOT EXISTS outliers_fts USING fts5(
  resolved_by,
  content='outliers', content_rowid='id'
);
-- Backfill: rows from an earlier migration (0002_seed.sql) predate the triggers.
INSERT INTO outliers_fts(outliers_fts) VALUES ('rebuild');
CREATE TRIGGER IF NOT EXISTS outliers_fts_ai AFTER INSERT ON outliers BEGIN
  INSERT INTO outliers_fts(rowid, resolved_by) VALUES (new.id, new.resolved_by);
END;
CREATE TRIGGER IF NOT EXISTS outliers_fts_ad AFTER DELETE ON outliers BEGIN
  INSERT INTO outliers_fts(outliers_fts, rowid, resolved_by) VALUES ('delete', old.id, old.resolved_by);
END;
CREATE TRIGGER IF NOT EXISTS outliers_fts_au AFTER UPDATE ON outliers BEGIN
  INSERT INTO outliers_fts(outliers_fts, rowid, resolved_by) VALUES ('delete', old.id, old.resolved_by);
  INSERT INTO outliers_fts(rowid, resolved_by) VALUES (new.id, new.resolved_by);
END;

CREATE VIRTUAL TABLE IF NOT EXISTS sync_thresholds_fts USING fts5(
  action,
  content='sync_thresholds', content_rowid='id'
);
-- Backfill: rows from an earlier migration (0002_seed.sql) predate the triggers.
INSERT INTO sync_thresholds_fts(sync_thresholds_fts) VALUES ('rebuild');
CREATE TRIGGER IF NOT EXISTS sync_thresholds_fts_ai AFTER INSERT ON sync_thresholds BEGIN
  INSERT INTO sync_thresholds_fts(rowid, action) VALUES (new.id, new.action);
END;
CREATE TRIGGER IF NOT EXISTS sync_thresholds_fts_ad AFTER DELETE ON sync_thresholds BEGIN
  INSERT INTO sync_thresholds_fts(sync_thresholds_fts, rowid, action) VALUES ('delete', old.id, old.action);
END;
CREATE TRIGGER IF NOT EXISTS sync_thresholds_fts_au AFTER UPDATE ON sync_thresholds BEGIN
  INSERT INTO sync_thresholds_fts(sync_thresholds_fts, rowid, action) VALUES ('delete', old.id, old.action);
  INSERT INTO sync_thresholds_fts(rowid, action) VALUES (new.id, new.action);
END;

CREATE VIRTUAL TABLE IF NOT EXISTS passphrases_fts USING fts5(
  hash, salt,
  content='passphrases', content_rowid='id'
);
-- Backfill: rows from an earlier migration (0002_seed.sql) predate the triggers.
INSERT INTO passphrases_fts(passphrases_fts) VALUES ('rebuild');
CREATE TRIGGER IF NOT EXISTS passphrases_fts_ai AFTER INSERT ON passphrases BEGIN
  INSERT INTO passphrases_fts(rowid, hash, salt) VALUES (new.id, new.hash, new.salt);
END;
CREATE TRIGGER IF NOT EXISTS passphrases_fts_ad AFTER DELETE ON passphrases BEGIN
  INSERT INTO passphrases_fts(passphrases_fts, rowid, hash, salt) VALUES ('delete', old.id, old.hash, old.salt);
END;
CREATE TRIGGER IF NOT EXISTS passphrases_fts_au AFTER UPDATE ON passphrases BEGIN
  INSERT INTO passphrases_fts(passphrases_fts, rowid, hash, salt) VALUES ('delete', old.id, old.hash, old.salt);
  INSERT INTO passphrases_fts(rowid, hash, salt) VALUES (new.id, new.hash, new.salt);
END;

CREATE VIRTUAL TABLE IF NOT EXISTS connectivity_zones_fts USING fts5(
  name, polygon_geojson, technician_email, status,
  content='connectivity_zones', content_rowid='id'
);
-- Backfill: rows from an earlier migration (0002_seed.sql) predate the triggers.
INSERT INTO connectivity_zones_fts(connectivity_zones_fts) VALUES ('rebuild');
CREATE TRIGGER IF NOT EXISTS connectivity_zones_fts_ai AFTER INSERT ON connectivity_zones BEGIN
  INSERT INTO connectivity_zones_fts(rowid, name, polygon_geojson, technician_email, status) VALUES (new.id, new.name, new.polygon_geojson, new.technician_email, new.status);
END;
CREATE TRIGGER IF NOT EXISTS connectivity_zones_fts_ad AFTER DELETE ON connectivity_zones BEGIN
  INSERT INTO connectivity_zones_fts(connectivity_zones_fts, rowid, name, polygon_geojson, technician_email, status) VALUES ('delete', old.id, old.name, old.polygon_geojson, old.technician_email, old.status);
END;
CREATE TRIGGER IF NOT EXISTS connectivity_zones_fts_au AFTER UPDATE ON connectivity_zones BEGIN
  INSERT INTO connectivity_zones_fts(connectivity_zones_fts, rowid, name, polygon_geojson, technician_email, status) VALUES ('delete', old.id, old.name, old.polygon_geojson, old.technician_email, old.status);
  INSERT INTO connectivity_zones_fts(rowid, name, polygon_geojson, technician_email, status) VALUES (new.id, new.name, new.polygon_geojson, new.technician_email, new.status);
END;

CREATE VIRTUAL TABLE IF NOT EXISTS reading_historys_fts USING fts5(
  changed_field, old_value, new_value, changed_by,
  content='reading_historys', content_rowid='id'
);
-- Backfill: rows from an earlier migration (0002_seed.sql) predate the triggers.
INSERT INTO reading_historys_fts(reading_historys_fts) VALUES ('rebuild');
CREATE TRIGGER IF NOT EXISTS reading_historys_fts_ai AFTER INSERT ON reading_historys BEGIN
  INSERT INTO reading_historys_fts(rowid, changed_field, old_value, new_value, changed_by) VALUES (new.id, new.changed_field, new.old_value, new.new_value, new.changed_by);
END;
CREATE TRIGGER IF NOT EXISTS reading_historys_fts_ad AFTER DELETE ON reading_historys BEGIN
  INSERT INTO reading_historys_fts(reading_historys_fts, rowid, changed_field, old_value, new_value, changed_by) VALUES ('delete', old.id, old.changed_field, old.old_value, old.new_value, old.changed_by);
END;
CREATE TRIGGER IF NOT EXISTS reading_historys_fts_au AFTER UPDATE ON reading_historys BEGIN
  INSERT INTO reading_historys_fts(reading_historys_fts, rowid, changed_field, old_value, new_value, changed_by) VALUES ('delete', old.id, old.changed_field, old.old_value, old.new_value, old.changed_by);
  INSERT INTO reading_historys_fts(rowid, changed_field, old_value, new_value, changed_by) VALUES (new.id, new.changed_field, new.old_value, new.new_value, new.changed_by);
END;

CREATE VIRTUAL TABLE IF NOT EXISTS site_visits_fts USING fts5(
  purpose, notes, technician_email, status,
  content='site_visits', content_rowid='id'
);
-- Backfill: rows from an earlier migration (0002_seed.sql) predate the triggers.
INSERT INTO site_visits_fts(site_visits_fts) VALUES ('rebuild');
CREATE TRIGGER IF NOT EXISTS site_visits_fts_ai AFTER INSERT ON site_visits BEGIN
  INSERT INTO site_visits_fts(rowid, purpose, notes, technician_email, status) VALUES (new.id, new.purpose, new.notes, new.technician_email, new.status);
END;
CREATE TRIGGER IF NOT EXISTS site_visits_fts_ad AFTER DELETE ON site_visits BEGIN
  INSERT INTO site_visits_fts(site_visits_fts, rowid, purpose, notes, technician_email, status) VALUES ('delete', old.id, old.purpose, old.notes, old.technician_email, old.status);
END;
CREATE TRIGGER IF NOT EXISTS site_visits_fts_au AFTER UPDATE ON site_visits BEGIN
  INSERT INTO site_visits_fts(site_visits_fts, rowid, purpose, notes, technician_email, status) VALUES ('delete', old.id, old.purpose, old.notes, old.technician_email, old.status);
  INSERT INTO site_visits_fts(rowid, purpose, notes, technician_email, status) VALUES (new.id, new.purpose, new.notes, new.technician_email, new.status);
END;

CREATE VIRTUAL TABLE IF NOT EXISTS equipments_fts USING fts5(
  serial_number, type, status,
  content='equipments', content_rowid='id'
);
-- Backfill: rows from an earlier migration (0002_seed.sql) predate the triggers.
INSERT INTO equipments_fts(equipments_fts) VALUES ('rebuild');
CREATE TRIGGER IF NOT EXISTS equipments_fts_ai AFTER INSERT ON equipments BEGIN
  INSERT INTO equipments_fts(rowid, serial_number, type, status) VALUES (new.id, new.serial_number, new.type, new.status);
END;
CREATE TRIGGER IF NOT EXISTS equipments_fts_ad AFTER DELETE ON equipments BEGIN
  INSERT INTO equipments_fts(equipments_fts, rowid, serial_number, type, status) VALUES ('delete', old.id, old.serial_number, old.type, old.status);
END;
CREATE TRIGGER IF NOT EXISTS equipments_fts_au AFTER UPDATE ON equipments BEGIN
  INSERT INTO equipments_fts(equipments_fts, rowid, serial_number, type, status) VALUES ('delete', old.id, old.serial_number, old.type, old.status);
  INSERT INTO equipments_fts(rowid, serial_number, type, status) VALUES (new.id, new.serial_number, new.type, new.status);
END;

CREATE VIRTUAL TABLE IF NOT EXISTS calibration_logs_fts USING fts5(
  calibrated_by, notes, status,
  content='calibration_logs', content_rowid='id'
);
-- Backfill: rows from an earlier migration (0002_seed.sql) predate the triggers.
INSERT INTO calibration_logs_fts(calibration_logs_fts) VALUES ('rebuild');
CREATE TRIGGER IF NOT EXISTS calibration_logs_fts_ai AFTER INSERT ON calibration_logs BEGIN
  INSERT INTO calibration_logs_fts(rowid, calibrated_by, notes, status) VALUES (new.id, new.calibrated_by, new.notes, new.status);
END;
CREATE TRIGGER IF NOT EXISTS calibration_logs_fts_ad AFTER DELETE ON calibration_logs BEGIN
  INSERT INTO calibration_logs_fts(calibration_logs_fts, rowid, calibrated_by, notes, status) VALUES ('delete', old.id, old.calibrated_by, old.notes, old.status);
END;
CREATE TRIGGER IF NOT EXISTS calibration_logs_fts_au AFTER UPDATE ON calibration_logs BEGIN
  INSERT INTO calibration_logs_fts(calibration_logs_fts, rowid, calibrated_by, notes, status) VALUES ('delete', old.id, old.calibrated_by, old.notes, old.status);
  INSERT INTO calibration_logs_fts(rowid, calibrated_by, notes, status) VALUES (new.id, new.calibrated_by, new.notes, new.status);
END;

CREATE VIRTUAL TABLE IF NOT EXISTS notifications_fts USING fts5(
  recipient_email, type, content, related_entity_type,
  content='notifications', content_rowid='id'
);
-- Backfill: rows from an earlier migration (0002_seed.sql) predate the triggers.
INSERT INTO notifications_fts(notifications_fts) VALUES ('rebuild');
CREATE TRIGGER IF NOT EXISTS notifications_fts_ai AFTER INSERT ON notifications BEGIN
  INSERT INTO notifications_fts(rowid, recipient_email, type, content, related_entity_type) VALUES (new.id, new.recipient_email, new.type, new.content, new.related_entity_type);
END;
CREATE TRIGGER IF NOT EXISTS notifications_fts_ad AFTER DELETE ON notifications BEGIN
  INSERT INTO notifications_fts(notifications_fts, rowid, recipient_email, type, content, related_entity_type) VALUES ('delete', old.id, old.recipient_email, old.type, old.content, old.related_entity_type);
END;
CREATE TRIGGER IF NOT EXISTS notifications_fts_au AFTER UPDATE ON notifications BEGIN
  INSERT INTO notifications_fts(notifications_fts, rowid, recipient_email, type, content, related_entity_type) VALUES ('delete', old.id, old.recipient_email, old.type, old.content, old.related_entity_type);
  INSERT INTO notifications_fts(rowid, recipient_email, type, content, related_entity_type) VALUES (new.id, new.recipient_email, new.type, new.content, new.related_entity_type);
END;

CREATE VIRTUAL TABLE IF NOT EXISTS sync_policys_fts USING fts5(
  name,
  content='sync_policys', content_rowid='id'
);
-- Backfill: rows from an earlier migration (0002_seed.sql) predate the triggers.
INSERT INTO sync_policys_fts(sync_policys_fts) VALUES ('rebuild');
CREATE TRIGGER IF NOT EXISTS sync_policys_fts_ai AFTER INSERT ON sync_policys BEGIN
  INSERT INTO sync_policys_fts(rowid, name) VALUES (new.id, new.name);
END;
CREATE TRIGGER IF NOT EXISTS sync_policys_fts_ad AFTER DELETE ON sync_policys BEGIN
  INSERT INTO sync_policys_fts(sync_policys_fts, rowid, name) VALUES ('delete', old.id, old.name);
END;
CREATE TRIGGER IF NOT EXISTS sync_policys_fts_au AFTER UPDATE ON sync_policys BEGIN
  INSERT INTO sync_policys_fts(sync_policys_fts, rowid, name) VALUES ('delete', old.id, old.name);
  INSERT INTO sync_policys_fts(rowid, name) VALUES (new.id, new.name);
END;

CREATE VIRTUAL TABLE IF NOT EXISTS audit_trails_fts USING fts5(
  entity_type, action, performed_by, metadata,
  content='audit_trails', content_rowid='id'
);
-- Backfill: rows from an earlier migration (0002_seed.sql) predate the triggers.
INSERT INTO audit_trails_fts(audit_trails_fts) VALUES ('rebuild');
CREATE TRIGGER IF NOT EXISTS audit_trails_fts_ai AFTER INSERT ON audit_trails BEGIN
  INSERT INTO audit_trails_fts(rowid, entity_type, action, performed_by, metadata) VALUES (new.id, new.entity_type, new.action, new.performed_by, new.metadata);
END;
CREATE TRIGGER IF NOT EXISTS audit_trails_fts_ad AFTER DELETE ON audit_trails BEGIN
  INSERT INTO audit_trails_fts(audit_trails_fts, rowid, entity_type, action, performed_by, metadata) VALUES ('delete', old.id, old.entity_type, old.action, old.performed_by, old.metadata);
END;
CREATE TRIGGER IF NOT EXISTS audit_trails_fts_au AFTER UPDATE ON audit_trails BEGIN
  INSERT INTO audit_trails_fts(audit_trails_fts, rowid, entity_type, action, performed_by, metadata) VALUES ('delete', old.id, old.entity_type, old.action, old.performed_by, old.metadata);
  INSERT INTO audit_trails_fts(rowid, entity_type, action, performed_by, metadata) VALUES (new.id, new.entity_type, new.action, new.performed_by, new.metadata);
END;

CREATE VIRTUAL TABLE IF NOT EXISTS maintenance_schedules_fts USING fts5(
  type, status, notes, technician_email,
  content='maintenance_schedules', content_rowid='id'
);
-- Backfill: rows from an earlier migration (0002_seed.sql) predate the triggers.
INSERT INTO maintenance_schedules_fts(maintenance_schedules_fts) VALUES ('rebuild');
CREATE TRIGGER IF NOT EXISTS maintenance_schedules_fts_ai AFTER INSERT ON maintenance_schedules BEGIN
  INSERT INTO maintenance_schedules_fts(rowid, type, status, notes, technician_email) VALUES (new.id, new.type, new.status, new.notes, new.technician_email);
END;
CREATE TRIGGER IF NOT EXISTS maintenance_schedules_fts_ad AFTER DELETE ON maintenance_schedules BEGIN
  INSERT INTO maintenance_schedules_fts(maintenance_schedules_fts, rowid, type, status, notes, technician_email) VALUES ('delete', old.id, old.type, old.status, old.notes, old.technician_email);
END;
CREATE TRIGGER IF NOT EXISTS maintenance_schedules_fts_au AFTER UPDATE ON maintenance_schedules BEGIN
  INSERT INTO maintenance_schedules_fts(maintenance_schedules_fts, rowid, type, status, notes, technician_email) VALUES ('delete', old.id, old.type, old.status, old.notes, old.technician_email);
  INSERT INTO maintenance_schedules_fts(rowid, type, status, notes, technician_email) VALUES (new.id, new.type, new.status, new.notes, new.technician_email);
END;
