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

CREATE TRIGGER IF NOT EXISTS outliers_digest_ai AFTER INSERT ON outliers BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'outlier.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'outlier.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS outliers_digest_ad AFTER UPDATE OF deleted_at ON outliers BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'outlier.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'outlier.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS sync_thresholds_digest_ai AFTER INSERT ON sync_thresholds BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'sync_threshold.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'sync_threshold.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS sync_thresholds_digest_ad AFTER UPDATE OF deleted_at ON sync_thresholds BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'sync_threshold.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'sync_threshold.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS passphrases_digest_ai AFTER INSERT ON passphrases BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'passphrase.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'passphrase.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS passphrases_digest_ad AFTER UPDATE OF deleted_at ON passphrases BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'passphrase.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'passphrase.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS daily_aggregates_digest_ai AFTER INSERT ON daily_aggregates BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'daily_aggregate.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'daily_aggregate.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS daily_aggregates_digest_ad AFTER UPDATE OF deleted_at ON daily_aggregates BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'daily_aggregate.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'daily_aggregate.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS connectivity_zones_digest_ai AFTER INSERT ON connectivity_zones BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'connectivity_zone.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'connectivity_zone.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS connectivity_zones_digest_ad AFTER UPDATE OF deleted_at ON connectivity_zones BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'connectivity_zone.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'connectivity_zone.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS reading_historys_digest_ai AFTER INSERT ON reading_historys BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'reading_history.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'reading_history.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS site_visits_digest_ai AFTER INSERT ON site_visits BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'site_visit.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'site_visit.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS site_visits_digest_ad AFTER UPDATE OF deleted_at ON site_visits BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'site_visit.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'site_visit.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS equipments_digest_ai AFTER INSERT ON equipments BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'equipment.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'equipment.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS equipments_digest_ad AFTER UPDATE OF deleted_at ON equipments BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'equipment.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'equipment.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS calibration_logs_digest_ai AFTER INSERT ON calibration_logs BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'calibration_log.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'calibration_log.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS notifications_digest_ai AFTER INSERT ON notifications BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'notification.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'notification.digest' AND status = 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS notifications_digest_ad AFTER UPDATE OF deleted_at ON notifications BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'notification.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'notification.digest' AND status = 'pending'
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

CREATE TRIGGER IF NOT EXISTS audit_trails_digest_ai AFTER INSERT ON audit_trails BEGIN
  INSERT INTO jobs (tenant, kind, run_at, created_at, updated_at)
  SELECT NEW.tenant, 'audit_trail.digest', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (
    SELECT 1 FROM jobs WHERE tenant = NEW.tenant AND kind = 'audit_trail.digest' AND status = 'pending'
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
