-- GENERATED enqueue side of the durable queue (migrations/0004_jobs.sql is
-- the queue itself; src/handlers/jobs.ts registers the runner for each kind).
-- Every mutating route on an entity queues ONE recompute of that entity's digest
-- for the writer's own tenant, and the cron drain runs it out of band — so the
-- count is recomputed after the write instead of on every read.
CREATE TABLE IF NOT EXISTS job_digests (
  tenant TEXT NOT NULL,
  entity TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  computed_at TEXT NOT NULL,
  PRIMARY KEY (tenant, entity)
);
-- The trigger's coalescing check (tenant, kind, status) runs inside EVERY write
-- transaction, so it gets its own index rather than a scan of the tenant's queue.
CREATE INDEX IF NOT EXISTS jobs_dedupe_idx ON jobs (tenant, kind, status);

CREATE TRIGGER IF NOT EXISTS readings_digest_ai AFTER INSERT ON readings BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'reading.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'reading.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS readings_digest_ad AFTER UPDATE OF deleted_at ON readings BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'reading.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'reading.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS sync_logs_digest_ai AFTER INSERT ON sync_logs BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'sync_log.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'sync_log.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS encryption_keys_digest_ai AFTER INSERT ON encryption_keys BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'encryption_key.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'encryption_key.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS encryption_keys_digest_ad AFTER UPDATE OF deleted_at ON encryption_keys BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'encryption_key.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'encryption_key.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS erasure_policys_digest_ai AFTER INSERT ON erasure_policys BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'erasure_policy.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'erasure_policy.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS erasure_policys_digest_ad AFTER UPDATE OF deleted_at ON erasure_policys BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'erasure_policy.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'erasure_policy.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS anomalys_digest_ai AFTER INSERT ON anomalys BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'anomaly.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'anomaly.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS anomalys_digest_ad AFTER UPDATE OF deleted_at ON anomalys BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'anomaly.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'anomaly.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS grid_cells_digest_ai AFTER INSERT ON grid_cells BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'grid_cell.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'grid_cell.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS grid_cells_digest_ad AFTER UPDATE OF deleted_at ON grid_cells BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'grid_cell.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'grid_cell.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS technicians_digest_ai AFTER INSERT ON technicians BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'technician.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'technician.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS technicians_digest_ad AFTER UPDATE OF deleted_at ON technicians BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'technician.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'technician.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS sites_digest_ai AFTER INSERT ON sites BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'site.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'site.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS sites_digest_ad AFTER UPDATE OF deleted_at ON sites BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'site.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'site.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS reading_types_digest_ai AFTER INSERT ON reading_types BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'reading_type.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'reading_type.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS reading_types_digest_ad AFTER UPDATE OF deleted_at ON reading_types BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'reading_type.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'reading_type.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS sync_policys_digest_ai AFTER INSERT ON sync_policys BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'sync_policy.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'sync_policy.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS sync_policys_digest_ad AFTER UPDATE OF deleted_at ON sync_policys BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'sync_policy.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'sync_policy.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS devices_digest_ai AFTER INSERT ON devices BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'device.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'device.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS devices_digest_ad AFTER UPDATE OF deleted_at ON devices BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'device.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'device.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS permissions_digest_ai AFTER INSERT ON permissions BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'permission.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'permission.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS permissions_digest_ad AFTER UPDATE OF deleted_at ON permissions BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'permission.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'permission.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS audit_logs_digest_ai AFTER INSERT ON audit_logs BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'audit_log.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'audit_log.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS regions_digest_ai AFTER INSERT ON regions BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'region.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'region.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS regions_digest_ad AFTER UPDATE OF deleted_at ON regions BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'region.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'region.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS maintenance_schedules_digest_ai AFTER INSERT ON maintenance_schedules BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'maintenance_schedule.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'maintenance_schedule.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS maintenance_schedules_digest_ad AFTER UPDATE OF deleted_at ON maintenance_schedules BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'maintenance_schedule.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'maintenance_schedule.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS photo_blobs_digest_ai AFTER INSERT ON photo_blobs BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'photo_blob.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'photo_blob.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS photo_blobs_digest_ad AFTER UPDATE OF deleted_at ON photo_blobs BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'photo_blob.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'photo_blob.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS sync_sessions_digest_ai AFTER INSERT ON sync_sessions BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'sync_session.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'sync_session.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS sync_sessions_digest_ad AFTER UPDATE OF deleted_at ON sync_sessions BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'sync_session.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'sync_session.digest' AND status = 'pending'
  );
END;
