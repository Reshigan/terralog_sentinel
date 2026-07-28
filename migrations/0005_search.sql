-- GENERATED search schema (FTS5). Do not edit.
CREATE VIRTUAL TABLE IF NOT EXISTS readings_fts USING fts5(
  photo_blob_id, encrypted_blob, sync_status, device_fingerprint, dedupe_id, weather_conditions, equipment_used, notes,
  content='readings', content_rowid='id'
);
-- Backfill: rows from an earlier migration (0002_seed.sql) predate the triggers.
INSERT INTO readings_fts(readings_fts) VALUES ('rebuild');
CREATE TRIGGER IF NOT EXISTS readings_fts_ai AFTER INSERT ON readings BEGIN
  INSERT INTO readings_fts(rowid, photo_blob_id, encrypted_blob, sync_status, device_fingerprint, dedupe_id, weather_conditions, equipment_used, notes) VALUES (new.id, new.photo_blob_id, new.encrypted_blob, new.sync_status, new.device_fingerprint, new.dedupe_id, new.weather_conditions, new.equipment_used, new.notes);
END;
CREATE TRIGGER IF NOT EXISTS readings_fts_ad AFTER DELETE ON readings BEGIN
  INSERT INTO readings_fts(readings_fts, rowid, photo_blob_id, encrypted_blob, sync_status, device_fingerprint, dedupe_id, weather_conditions, equipment_used, notes) VALUES ('delete', old.id, old.photo_blob_id, old.encrypted_blob, old.sync_status, old.device_fingerprint, old.dedupe_id, old.weather_conditions, old.equipment_used, old.notes);
END;
CREATE TRIGGER IF NOT EXISTS readings_fts_au AFTER UPDATE ON readings BEGIN
  INSERT INTO readings_fts(readings_fts, rowid, photo_blob_id, encrypted_blob, sync_status, device_fingerprint, dedupe_id, weather_conditions, equipment_used, notes) VALUES ('delete', old.id, old.photo_blob_id, old.encrypted_blob, old.sync_status, old.device_fingerprint, old.dedupe_id, old.weather_conditions, old.equipment_used, old.notes);
  INSERT INTO readings_fts(rowid, photo_blob_id, encrypted_blob, sync_status, device_fingerprint, dedupe_id, weather_conditions, equipment_used, notes) VALUES (new.id, new.photo_blob_id, new.encrypted_blob, new.sync_status, new.device_fingerprint, new.dedupe_id, new.weather_conditions, new.equipment_used, new.notes);
END;

CREATE VIRTUAL TABLE IF NOT EXISTS sync_logs_fts USING fts5(
  status, error_message, endpoint_url,
  content='sync_logs', content_rowid='id'
);
-- Backfill: rows from an earlier migration (0002_seed.sql) predate the triggers.
INSERT INTO sync_logs_fts(sync_logs_fts) VALUES ('rebuild');
CREATE TRIGGER IF NOT EXISTS sync_logs_fts_ai AFTER INSERT ON sync_logs BEGIN
  INSERT INTO sync_logs_fts(rowid, status, error_message, endpoint_url) VALUES (new.id, new.status, new.error_message, new.endpoint_url);
END;
CREATE TRIGGER IF NOT EXISTS sync_logs_fts_ad AFTER DELETE ON sync_logs BEGIN
  INSERT INTO sync_logs_fts(sync_logs_fts, rowid, status, error_message, endpoint_url) VALUES ('delete', old.id, old.status, old.error_message, old.endpoint_url);
END;
CREATE TRIGGER IF NOT EXISTS sync_logs_fts_au AFTER UPDATE ON sync_logs BEGIN
  INSERT INTO sync_logs_fts(sync_logs_fts, rowid, status, error_message, endpoint_url) VALUES ('delete', old.id, old.status, old.error_message, old.endpoint_url);
  INSERT INTO sync_logs_fts(rowid, status, error_message, endpoint_url) VALUES (new.id, new.status, new.error_message, new.endpoint_url);
END;

CREATE VIRTUAL TABLE IF NOT EXISTS encryption_keys_fts USING fts5(
  salt, device_fingerprint, key_status, key_algorithm,
  content='encryption_keys', content_rowid='id'
);
-- Backfill: rows from an earlier migration (0002_seed.sql) predate the triggers.
INSERT INTO encryption_keys_fts(encryption_keys_fts) VALUES ('rebuild');
CREATE TRIGGER IF NOT EXISTS encryption_keys_fts_ai AFTER INSERT ON encryption_keys BEGIN
  INSERT INTO encryption_keys_fts(rowid, salt, device_fingerprint, key_status, key_algorithm) VALUES (new.id, new.salt, new.device_fingerprint, new.key_status, new.key_algorithm);
END;
CREATE TRIGGER IF NOT EXISTS encryption_keys_fts_ad AFTER DELETE ON encryption_keys BEGIN
  INSERT INTO encryption_keys_fts(encryption_keys_fts, rowid, salt, device_fingerprint, key_status, key_algorithm) VALUES ('delete', old.id, old.salt, old.device_fingerprint, old.key_status, old.key_algorithm);
END;
CREATE TRIGGER IF NOT EXISTS encryption_keys_fts_au AFTER UPDATE ON encryption_keys BEGIN
  INSERT INTO encryption_keys_fts(encryption_keys_fts, rowid, salt, device_fingerprint, key_status, key_algorithm) VALUES ('delete', old.id, old.salt, old.device_fingerprint, old.key_status, old.key_algorithm);
  INSERT INTO encryption_keys_fts(rowid, salt, device_fingerprint, key_status, key_algorithm) VALUES (new.id, new.salt, new.device_fingerprint, new.key_status, new.key_algorithm);
END;

CREATE VIRTUAL TABLE IF NOT EXISTS erasure_policys_fts USING fts5(
  name, description, policy_type, created_by,
  content='erasure_policys', content_rowid='id'
);
-- Backfill: rows from an earlier migration (0002_seed.sql) predate the triggers.
INSERT INTO erasure_policys_fts(erasure_policys_fts) VALUES ('rebuild');
CREATE TRIGGER IF NOT EXISTS erasure_policys_fts_ai AFTER INSERT ON erasure_policys BEGIN
  INSERT INTO erasure_policys_fts(rowid, name, description, policy_type, created_by) VALUES (new.id, new.name, new.description, new.policy_type, new.created_by);
END;
CREATE TRIGGER IF NOT EXISTS erasure_policys_fts_ad AFTER DELETE ON erasure_policys BEGIN
  INSERT INTO erasure_policys_fts(erasure_policys_fts, rowid, name, description, policy_type, created_by) VALUES ('delete', old.id, old.name, old.description, old.policy_type, old.created_by);
END;
CREATE TRIGGER IF NOT EXISTS erasure_policys_fts_au AFTER UPDATE ON erasure_policys BEGIN
  INSERT INTO erasure_policys_fts(erasure_policys_fts, rowid, name, description, policy_type, created_by) VALUES ('delete', old.id, old.name, old.description, old.policy_type, old.created_by);
  INSERT INTO erasure_policys_fts(rowid, name, description, policy_type, created_by) VALUES (new.id, new.name, new.description, new.policy_type, new.created_by);
END;

CREATE VIRTUAL TABLE IF NOT EXISTS anomalys_fts USING fts5(
  resolution_notes, status, severity,
  content='anomalys', content_rowid='id'
);
-- Backfill: rows from an earlier migration (0002_seed.sql) predate the triggers.
INSERT INTO anomalys_fts(anomalys_fts) VALUES ('rebuild');
CREATE TRIGGER IF NOT EXISTS anomalys_fts_ai AFTER INSERT ON anomalys BEGIN
  INSERT INTO anomalys_fts(rowid, resolution_notes, status, severity) VALUES (new.id, new.resolution_notes, new.status, new.severity);
END;
CREATE TRIGGER IF NOT EXISTS anomalys_fts_ad AFTER DELETE ON anomalys BEGIN
  INSERT INTO anomalys_fts(anomalys_fts, rowid, resolution_notes, status, severity) VALUES ('delete', old.id, old.resolution_notes, old.status, old.severity);
END;
CREATE TRIGGER IF NOT EXISTS anomalys_fts_au AFTER UPDATE ON anomalys BEGIN
  INSERT INTO anomalys_fts(anomalys_fts, rowid, resolution_notes, status, severity) VALUES ('delete', old.id, old.resolution_notes, old.status, old.severity);
  INSERT INTO anomalys_fts(rowid, resolution_notes, status, severity) VALUES (new.id, new.resolution_notes, new.status, new.severity);
END;

CREATE VIRTUAL TABLE IF NOT EXISTS grid_cells_fts USING fts5(
  cell_hash,
  content='grid_cells', content_rowid='id'
);
-- Backfill: rows from an earlier migration (0002_seed.sql) predate the triggers.
INSERT INTO grid_cells_fts(grid_cells_fts) VALUES ('rebuild');
CREATE TRIGGER IF NOT EXISTS grid_cells_fts_ai AFTER INSERT ON grid_cells BEGIN
  INSERT INTO grid_cells_fts(rowid, cell_hash) VALUES (new.id, new.cell_hash);
END;
CREATE TRIGGER IF NOT EXISTS grid_cells_fts_ad AFTER DELETE ON grid_cells BEGIN
  INSERT INTO grid_cells_fts(grid_cells_fts, rowid, cell_hash) VALUES ('delete', old.id, old.cell_hash);
END;
CREATE TRIGGER IF NOT EXISTS grid_cells_fts_au AFTER UPDATE ON grid_cells BEGIN
  INSERT INTO grid_cells_fts(grid_cells_fts, rowid, cell_hash) VALUES ('delete', old.id, old.cell_hash);
  INSERT INTO grid_cells_fts(rowid, cell_hash) VALUES (new.id, new.cell_hash);
END;

CREATE VIRTUAL TABLE IF NOT EXISTS technicians_fts USING fts5(
  name, email, device_id, status, certification_level, phone_number, emergency_contact,
  content='technicians', content_rowid='id'
);
-- Backfill: rows from an earlier migration (0002_seed.sql) predate the triggers.
INSERT INTO technicians_fts(technicians_fts) VALUES ('rebuild');
CREATE TRIGGER IF NOT EXISTS technicians_fts_ai AFTER INSERT ON technicians BEGIN
  INSERT INTO technicians_fts(rowid, name, email, device_id, status, certification_level, phone_number, emergency_contact) VALUES (new.id, new.name, new.email, new.device_id, new.status, new.certification_level, new.phone_number, new.emergency_contact);
END;
CREATE TRIGGER IF NOT EXISTS technicians_fts_ad AFTER DELETE ON technicians BEGIN
  INSERT INTO technicians_fts(technicians_fts, rowid, name, email, device_id, status, certification_level, phone_number, emergency_contact) VALUES ('delete', old.id, old.name, old.email, old.device_id, old.status, old.certification_level, old.phone_number, old.emergency_contact);
END;
CREATE TRIGGER IF NOT EXISTS technicians_fts_au AFTER UPDATE ON technicians BEGIN
  INSERT INTO technicians_fts(technicians_fts, rowid, name, email, device_id, status, certification_level, phone_number, emergency_contact) VALUES ('delete', old.id, old.name, old.email, old.device_id, old.status, old.certification_level, old.phone_number, old.emergency_contact);
  INSERT INTO technicians_fts(rowid, name, email, device_id, status, certification_level, phone_number, emergency_contact) VALUES (new.id, new.name, new.email, new.device_id, new.status, new.certification_level, new.phone_number, new.emergency_contact);
END;

CREATE VIRTUAL TABLE IF NOT EXISTS sites_fts USING fts5(
  name, description, site_type, status,
  content='sites', content_rowid='id'
);
-- Backfill: rows from an earlier migration (0002_seed.sql) predate the triggers.
INSERT INTO sites_fts(sites_fts) VALUES ('rebuild');
CREATE TRIGGER IF NOT EXISTS sites_fts_ai AFTER INSERT ON sites BEGIN
  INSERT INTO sites_fts(rowid, name, description, site_type, status) VALUES (new.id, new.name, new.description, new.site_type, new.status);
END;
CREATE TRIGGER IF NOT EXISTS sites_fts_ad AFTER DELETE ON sites BEGIN
  INSERT INTO sites_fts(sites_fts, rowid, name, description, site_type, status) VALUES ('delete', old.id, old.name, old.description, old.site_type, old.status);
END;
CREATE TRIGGER IF NOT EXISTS sites_fts_au AFTER UPDATE ON sites BEGIN
  INSERT INTO sites_fts(sites_fts, rowid, name, description, site_type, status) VALUES ('delete', old.id, old.name, old.description, old.site_type, old.status);
  INSERT INTO sites_fts(rowid, name, description, site_type, status) VALUES (new.id, new.name, new.description, new.site_type, new.status);
END;

CREATE VIRTUAL TABLE IF NOT EXISTS reading_types_fts USING fts5(
  name, unit, description, category,
  content='reading_types', content_rowid='id'
);
-- Backfill: rows from an earlier migration (0002_seed.sql) predate the triggers.
INSERT INTO reading_types_fts(reading_types_fts) VALUES ('rebuild');
CREATE TRIGGER IF NOT EXISTS reading_types_fts_ai AFTER INSERT ON reading_types BEGIN
  INSERT INTO reading_types_fts(rowid, name, unit, description, category) VALUES (new.id, new.name, new.unit, new.description, new.category);
END;
CREATE TRIGGER IF NOT EXISTS reading_types_fts_ad AFTER DELETE ON reading_types BEGIN
  INSERT INTO reading_types_fts(reading_types_fts, rowid, name, unit, description, category) VALUES ('delete', old.id, old.name, old.unit, old.description, old.category);
END;
CREATE TRIGGER IF NOT EXISTS reading_types_fts_au AFTER UPDATE ON reading_types BEGIN
  INSERT INTO reading_types_fts(reading_types_fts, rowid, name, unit, description, category) VALUES ('delete', old.id, old.name, old.unit, old.description, old.category);
  INSERT INTO reading_types_fts(rowid, name, unit, description, category) VALUES (new.id, new.name, new.unit, new.description, new.category);
END;

CREATE VIRTUAL TABLE IF NOT EXISTS sync_policys_fts USING fts5(
  name, description, backoff_strategy, created_by,
  content='sync_policys', content_rowid='id'
);
-- Backfill: rows from an earlier migration (0002_seed.sql) predate the triggers.
INSERT INTO sync_policys_fts(sync_policys_fts) VALUES ('rebuild');
CREATE TRIGGER IF NOT EXISTS sync_policys_fts_ai AFTER INSERT ON sync_policys BEGIN
  INSERT INTO sync_policys_fts(rowid, name, description, backoff_strategy, created_by) VALUES (new.id, new.name, new.description, new.backoff_strategy, new.created_by);
END;
CREATE TRIGGER IF NOT EXISTS sync_policys_fts_ad AFTER DELETE ON sync_policys BEGIN
  INSERT INTO sync_policys_fts(sync_policys_fts, rowid, name, description, backoff_strategy, created_by) VALUES ('delete', old.id, old.name, old.description, old.backoff_strategy, old.created_by);
END;
CREATE TRIGGER IF NOT EXISTS sync_policys_fts_au AFTER UPDATE ON sync_policys BEGIN
  INSERT INTO sync_policys_fts(sync_policys_fts, rowid, name, description, backoff_strategy, created_by) VALUES ('delete', old.id, old.name, old.description, old.backoff_strategy, old.created_by);
  INSERT INTO sync_policys_fts(rowid, name, description, backoff_strategy, created_by) VALUES (new.id, new.name, new.description, new.backoff_strategy, new.created_by);
END;

CREATE VIRTUAL TABLE IF NOT EXISTS devices_fts USING fts5(
  fingerprint, user_agent, status, os_version,
  content='devices', content_rowid='id'
);
-- Backfill: rows from an earlier migration (0002_seed.sql) predate the triggers.
INSERT INTO devices_fts(devices_fts) VALUES ('rebuild');
CREATE TRIGGER IF NOT EXISTS devices_fts_ai AFTER INSERT ON devices BEGIN
  INSERT INTO devices_fts(rowid, fingerprint, user_agent, status, os_version) VALUES (new.id, new.fingerprint, new.user_agent, new.status, new.os_version);
END;
CREATE TRIGGER IF NOT EXISTS devices_fts_ad AFTER DELETE ON devices BEGIN
  INSERT INTO devices_fts(devices_fts, rowid, fingerprint, user_agent, status, os_version) VALUES ('delete', old.id, old.fingerprint, old.user_agent, old.status, old.os_version);
END;
CREATE TRIGGER IF NOT EXISTS devices_fts_au AFTER UPDATE ON devices BEGIN
  INSERT INTO devices_fts(devices_fts, rowid, fingerprint, user_agent, status, os_version) VALUES ('delete', old.id, old.fingerprint, old.user_agent, old.status, old.os_version);
  INSERT INTO devices_fts(rowid, fingerprint, user_agent, status, os_version) VALUES (new.id, new.fingerprint, new.user_agent, new.status, new.os_version);
END;

CREATE VIRTUAL TABLE IF NOT EXISTS permissions_fts USING fts5(
  granted_by, notes,
  content='permissions', content_rowid='id'
);
-- Backfill: rows from an earlier migration (0002_seed.sql) predate the triggers.
INSERT INTO permissions_fts(permissions_fts) VALUES ('rebuild');
CREATE TRIGGER IF NOT EXISTS permissions_fts_ai AFTER INSERT ON permissions BEGIN
  INSERT INTO permissions_fts(rowid, granted_by, notes) VALUES (new.id, new.granted_by, new.notes);
END;
CREATE TRIGGER IF NOT EXISTS permissions_fts_ad AFTER DELETE ON permissions BEGIN
  INSERT INTO permissions_fts(permissions_fts, rowid, granted_by, notes) VALUES ('delete', old.id, old.granted_by, old.notes);
END;
CREATE TRIGGER IF NOT EXISTS permissions_fts_au AFTER UPDATE ON permissions BEGIN
  INSERT INTO permissions_fts(permissions_fts, rowid, granted_by, notes) VALUES ('delete', old.id, old.granted_by, old.notes);
  INSERT INTO permissions_fts(rowid, granted_by, notes) VALUES (new.id, new.granted_by, new.notes);
END;

CREATE VIRTUAL TABLE IF NOT EXISTS audit_logs_fts USING fts5(
  entity_type, action, performed_by, metadata, ip_address, user_agent, changes, session_id,
  content='audit_logs', content_rowid='id'
);
-- Backfill: rows from an earlier migration (0002_seed.sql) predate the triggers.
INSERT INTO audit_logs_fts(audit_logs_fts) VALUES ('rebuild');
CREATE TRIGGER IF NOT EXISTS audit_logs_fts_ai AFTER INSERT ON audit_logs BEGIN
  INSERT INTO audit_logs_fts(rowid, entity_type, action, performed_by, metadata, ip_address, user_agent, changes, session_id) VALUES (new.id, new.entity_type, new.action, new.performed_by, new.metadata, new.ip_address, new.user_agent, new.changes, new.session_id);
END;
CREATE TRIGGER IF NOT EXISTS audit_logs_fts_ad AFTER DELETE ON audit_logs BEGIN
  INSERT INTO audit_logs_fts(audit_logs_fts, rowid, entity_type, action, performed_by, metadata, ip_address, user_agent, changes, session_id) VALUES ('delete', old.id, old.entity_type, old.action, old.performed_by, old.metadata, old.ip_address, old.user_agent, old.changes, old.session_id);
END;
CREATE TRIGGER IF NOT EXISTS audit_logs_fts_au AFTER UPDATE ON audit_logs BEGIN
  INSERT INTO audit_logs_fts(audit_logs_fts, rowid, entity_type, action, performed_by, metadata, ip_address, user_agent, changes, session_id) VALUES ('delete', old.id, old.entity_type, old.action, old.performed_by, old.metadata, old.ip_address, old.user_agent, old.changes, old.session_id);
  INSERT INTO audit_logs_fts(rowid, entity_type, action, performed_by, metadata, ip_address, user_agent, changes, session_id) VALUES (new.id, new.entity_type, new.action, new.performed_by, new.metadata, new.ip_address, new.user_agent, new.changes, new.session_id);
END;

CREATE VIRTUAL TABLE IF NOT EXISTS regions_fts USING fts5(
  name, description, timezone, operational_hours,
  content='regions', content_rowid='id'
);
-- Backfill: rows from an earlier migration (0002_seed.sql) predate the triggers.
INSERT INTO regions_fts(regions_fts) VALUES ('rebuild');
CREATE TRIGGER IF NOT EXISTS regions_fts_ai AFTER INSERT ON regions BEGIN
  INSERT INTO regions_fts(rowid, name, description, timezone, operational_hours) VALUES (new.id, new.name, new.description, new.timezone, new.operational_hours);
END;
CREATE TRIGGER IF NOT EXISTS regions_fts_ad AFTER DELETE ON regions BEGIN
  INSERT INTO regions_fts(regions_fts, rowid, name, description, timezone, operational_hours) VALUES ('delete', old.id, old.name, old.description, old.timezone, old.operational_hours);
END;
CREATE TRIGGER IF NOT EXISTS regions_fts_au AFTER UPDATE ON regions BEGIN
  INSERT INTO regions_fts(regions_fts, rowid, name, description, timezone, operational_hours) VALUES ('delete', old.id, old.name, old.description, old.timezone, old.operational_hours);
  INSERT INTO regions_fts(rowid, name, description, timezone, operational_hours) VALUES (new.id, new.name, new.description, new.timezone, new.operational_hours);
END;

CREATE VIRTUAL TABLE IF NOT EXISTS maintenance_schedules_fts USING fts5(
  description, status, priority, notes,
  content='maintenance_schedules', content_rowid='id'
);
-- Backfill: rows from an earlier migration (0002_seed.sql) predate the triggers.
INSERT INTO maintenance_schedules_fts(maintenance_schedules_fts) VALUES ('rebuild');
CREATE TRIGGER IF NOT EXISTS maintenance_schedules_fts_ai AFTER INSERT ON maintenance_schedules BEGIN
  INSERT INTO maintenance_schedules_fts(rowid, description, status, priority, notes) VALUES (new.id, new.description, new.status, new.priority, new.notes);
END;
CREATE TRIGGER IF NOT EXISTS maintenance_schedules_fts_ad AFTER DELETE ON maintenance_schedules BEGIN
  INSERT INTO maintenance_schedules_fts(maintenance_schedules_fts, rowid, description, status, priority, notes) VALUES ('delete', old.id, old.description, old.status, old.priority, old.notes);
END;
CREATE TRIGGER IF NOT EXISTS maintenance_schedules_fts_au AFTER UPDATE ON maintenance_schedules BEGIN
  INSERT INTO maintenance_schedules_fts(maintenance_schedules_fts, rowid, description, status, priority, notes) VALUES ('delete', old.id, old.description, old.status, old.priority, old.notes);
  INSERT INTO maintenance_schedules_fts(rowid, description, status, priority, notes) VALUES (new.id, new.description, new.status, new.priority, new.notes);
END;

CREATE VIRTUAL TABLE IF NOT EXISTS photo_blobs_fts USING fts5(
  blob_id, mime_type, storage_path, checksum, thumbnail_blob_id,
  content='photo_blobs', content_rowid='id'
);
-- Backfill: rows from an earlier migration (0002_seed.sql) predate the triggers.
INSERT INTO photo_blobs_fts(photo_blobs_fts) VALUES ('rebuild');
CREATE TRIGGER IF NOT EXISTS photo_blobs_fts_ai AFTER INSERT ON photo_blobs BEGIN
  INSERT INTO photo_blobs_fts(rowid, blob_id, mime_type, storage_path, checksum, thumbnail_blob_id) VALUES (new.id, new.blob_id, new.mime_type, new.storage_path, new.checksum, new.thumbnail_blob_id);
END;
CREATE TRIGGER IF NOT EXISTS photo_blobs_fts_ad AFTER DELETE ON photo_blobs BEGIN
  INSERT INTO photo_blobs_fts(photo_blobs_fts, rowid, blob_id, mime_type, storage_path, checksum, thumbnail_blob_id) VALUES ('delete', old.id, old.blob_id, old.mime_type, old.storage_path, old.checksum, old.thumbnail_blob_id);
END;
CREATE TRIGGER IF NOT EXISTS photo_blobs_fts_au AFTER UPDATE ON photo_blobs BEGIN
  INSERT INTO photo_blobs_fts(photo_blobs_fts, rowid, blob_id, mime_type, storage_path, checksum, thumbnail_blob_id) VALUES ('delete', old.id, old.blob_id, old.mime_type, old.storage_path, old.checksum, old.thumbnail_blob_id);
  INSERT INTO photo_blobs_fts(rowid, blob_id, mime_type, storage_path, checksum, thumbnail_blob_id) VALUES (new.id, new.blob_id, new.mime_type, new.storage_path, new.checksum, new.thumbnail_blob_id);
END;

CREATE VIRTUAL TABLE IF NOT EXISTS sync_sessions_fts USING fts5(
  status, network_type,
  content='sync_sessions', content_rowid='id'
);
-- Backfill: rows from an earlier migration (0002_seed.sql) predate the triggers.
INSERT INTO sync_sessions_fts(sync_sessions_fts) VALUES ('rebuild');
CREATE TRIGGER IF NOT EXISTS sync_sessions_fts_ai AFTER INSERT ON sync_sessions BEGIN
  INSERT INTO sync_sessions_fts(rowid, status, network_type) VALUES (new.id, new.status, new.network_type);
END;
CREATE TRIGGER IF NOT EXISTS sync_sessions_fts_ad AFTER DELETE ON sync_sessions BEGIN
  INSERT INTO sync_sessions_fts(sync_sessions_fts, rowid, status, network_type) VALUES ('delete', old.id, old.status, old.network_type);
END;
CREATE TRIGGER IF NOT EXISTS sync_sessions_fts_au AFTER UPDATE ON sync_sessions BEGIN
  INSERT INTO sync_sessions_fts(sync_sessions_fts, rowid, status, network_type) VALUES ('delete', old.id, old.status, old.network_type);
  INSERT INTO sync_sessions_fts(rowid, status, network_type) VALUES (new.id, new.status, new.network_type);
END;
