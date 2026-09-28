import { describe, it, expect } from 'bun:test';
import type {
  ApiError,
  Row,
  Bucket,
  BulkResult,
  Reading,
  Site,
  Sync_log,
  Encryption_key,
  Device,
  Outlier,
  Sync_threshold,
  Passphrase,
  Daily_aggregate,
  Connectivity_zone,
  Reading_history,
  Site_visit,
  Equipment,
  Calibration_log,
  Notification,
  Sync_policy,
  Audit_trail,
  Maintenance_schedule,
  // Handler types
  Handler,
  ListOutliersHandler,
  SyncStatusHeatmapHandler,
  SiteSyncStatsHandler,
  DailyAggregatesHandler,
  SiteReadingTrendHandler,
  LowSyncZonesHandler,
  PendingSyncReadingsHandler,
  FailedSyncThresholdReadingsHandler,
  SiteEquipmentStatusHandler,
  UnresolvedOutliersHandler,
  UpcomingVisitsHandler,
  OverdueCalibrationsHandler,
  DedupeCheckHandler,
  LowBatteryDevicesHandler,
  WarrantyExpiryHandler,
  OverdueMaintenanceHandler,
  ListReadingsHandler,
  ListReadingsStatsHandler,
  GetReadingHandler,
  CreateReadingHandler,
  CreateReadingBulkHandler,
  UpdateReadingHandler,
  DeleteReadingHandler,
  ListSitesHandler,
  ListSitesStatsHandler,
  GetSiteHandler,
  CreateSiteHandler,
  CreateSiteBulkHandler,
  UpdateSiteHandler,
  DeleteSiteHandler,
  ListSync_logsHandler,
  ListSync_logsStatsHandler,
  GetSync_logHandler,
  CreateSync_logHandler,
  CreateSync_logBulkHandler,
  UpdateSync_logHandler,
  ListEncryption_keysHandler,
  ListEncryption_keysStatsHandler,
  GetEncryption_keyHandler,
  CreateEncryption_keyHandler,
  CreateEncryption_keyBulkHandler,
  UpdateEncryption_keyHandler,
  DeleteEncryption_keyHandler,
  ListDevicesHandler,
  ListDevicesStatsHandler,
  GetDeviceHandler,
  CreateDeviceHandler,
  CreateDeviceBulkHandler,
  UpdateDeviceHandler,
  DeleteDeviceHandler,
  ListOutliers2Handler,
  ListOutliers2StatsHandler,
  GetOutlierHandler,
  CreateOutlierHandler,
  CreateOutlierBulkHandler,
  UpdateOutlierHandler,
  DeleteOutlierHandler,
  ListSync_thresholdsHandler,
  ListSync_thresholdsStatsHandler,
  GetSync_thresholdHandler,
  CreateSync_thresholdHandler,
  CreateSync_thresholdBulkHandler,
  UpdateSync_thresholdHandler,
  DeleteSync_thresholdHandler,
  ListPassphrasesHandler,
  ListPassphrasesStatsHandler,
  GetPassphraseHandler,
  CreatePassphraseHandler,
  CreatePassphraseBulkHandler,
  UpdatePassphraseHandler,
  DeletePassphraseHandler,
  ListDaily_aggregatesHandler,
  ListDaily_aggregatesStatsHandler,
  GetDaily_aggregateHandler,
  CreateDaily_aggregateHandler,
  CreateDaily_aggregateBulkHandler,
  UpdateDaily_aggregateHandler,
  DeleteDaily_aggregateHandler,
  ListConnectivity_zonesHandler,
  ListConnectivity_zonesStatsHandler,
  GetConnectivity_zoneHandler,
  CreateConnectivity_zoneHandler,
  CreateConnectivity_zoneBulkHandler,
  UpdateConnectivity_zoneHandler,
  DeleteConnectivity_zoneHandler,
  ListReading_historysHandler,
  ListReading_historysStatsHandler,
  GetReading_historyHandler,
  CreateReading_historyHandler,
  CreateReading_historyBulkHandler,
  UpdateReading_historyHandler,
  ListSite_visitsHandler,
  ListSite_visitsStatsHandler,
  GetSite_visitHandler,
  CreateSite_visitHandler,
  CreateSite_visitBulkHandler,
  UpdateSite_visitHandler,
  DeleteSite_visitHandler,
  ListEquipmentsHandler,
  ListEquipmentsStatsHandler,
  GetEquipmentHandler,
  CreateEquipmentHandler,
  CreateEquipmentBulkHandler,
  UpdateEquipmentHandler,
  DeleteEquipmentHandler,
  ListCalibration_logsHandler,
  ListCalibration_logsStatsHandler,
  GetCalibration_logHandler,
  CreateCalibration_logHandler,
  CreateCalibration_logBulkHandler,
  UpdateCalibration_logHandler,
  ListNotificationsHandler,
  ListNotificationsStatsHandler,
  GetNotificationHandler,
  CreateNotificationHandler,
  CreateNotificationBulkHandler,
  UpdateNotificationHandler,
  DeleteNotificationHandler,
  ListSync_policysHandler,
  ListSync_policysStatsHandler,
  GetSync_policyHandler,
  CreateSync_policyHandler,
  CreateSync_policyBulkHandler,
  UpdateSync_policyHandler,
  DeleteSync_policyHandler,
  ListAudit_trailsHandler,
  ListAudit_trailsStatsHandler,
  GetAudit_trailHandler,
  CreateAudit_trailHandler,
  CreateAudit_trailBulkHandler,
  UpdateAudit_trailHandler,
  ListMaintenance_schedulesHandler,
  ListMaintenance_schedulesStatsHandler,
  GetMaintenance_scheduleHandler,
  CreateMaintenance_scheduleHandler,
  CreateMaintenance_scheduleBulkHandler,
  UpdateMaintenance_scheduleHandler,
  DeleteMaintenance_scheduleHandler,
} from '../src/types';

// Type assertion helper - validates at compile time that T is assignable to U
type AssertType<T, U extends T> = U;

describe('src/types.ts - Shared Contract Validation', () => {
  describe('Core Types', () => {
    it('should define ApiError interface correctly', () => {
      const error: ApiError = {
        error: 'Test error',
        requestId: 'req-123',
      };
      expect(error.error).toBe('Test error');
      expect(error.requestId).toBe('req-123');
    });

    it('should allow ApiError without requestId', () => {
      const error: ApiError = { error: 'Test error' };
      expect(error.error).toBe('Test error');
      expect(error.requestId).toBeUndefined();
    });

    it('should define Row as Record<string, unknown>', () => {
      const row: Row = { id: 1, name: 'test', active: true };
      expect(row.id).toBe(1);
      expect(row.name).toBe('test');
    });

    it('should define Bucket with all aggregates', () => {
      const bucket: Bucket = {
        key: 'group1',
        count: 100,
        sum: 500,
        avg: 5,
        min: 1,
        max: 10,
      };
      expect(bucket.key).toBe('group1');
      expect(bucket.count).toBe(100);
      expect(bucket.avg).toBe(5);
    });

    it('should define BulkResult structure', () => {
      const result: BulkResult = {
        created: 5,
        ids: [1, 2, 3, 4, 5],
      };
      expect(result.created).toBe(5);
      expect(result.ids.length).toBe(5);
    });
  });

  describe('Entity Interfaces', () => {
    it('should define Reading with all required fields', () => {
      const reading: Reading = {
        id: 1,
        photo: 'base64string',
        latitude: 34.0522,
        longitude: -118.2437,
        numeric_value: 42.5,
        timestamp: '2026-03-14T10:00:00Z',
        encrypted_blob: 'encrypted_data',
        sync_status: 'pending',
        sync_attempts: 0,
        dedupe_id: 'uuid-v5-here',
        site_id: 1,
        device_id: 1,
        equipment_id: 1,
        calibration_id: 1,
        row_version: 1,
      };
      expect(reading.sync_status).toBe('pending');
      expect(reading.numeric_value).toBe(42.5);
    });

    it('should define Site with all required fields', () => {
      const site: Site = {
        id: 1,
        name: 'Pipeline_Alpha_03',
        latitude: 34.0522,
        longitude: -118.2437,
        mean_value: 50.0,
        std_dev: 5.5,
        last_sync: '2026-03-14T10:00:00Z',
        sync_success_rate: 0.95,
        technician_email: 'tech@example.com',
        status: 'active',
        zone_id: 1,
        row_version: 1,
      };
      expect(site.status).toBe('active');
      expect(site.sync_success_rate).toBe(0.95);
    });

    it('should define Sync_log with all required fields', () => {
      const log: Sync_log = {
        id: 1,
        reading_id: 1,
        attempted_at: '2026-03-14T10:00:00Z',
        status: 'success',
        response_code: 200,
        error_message: '',
        sync_policy_id: 1,
        row_version: 1,
      };
      expect(log.status).toBe('success');
      expect(log.response_code).toBe(200);
    });

    it('should define Encryption_key with all required fields', () => {
      const key: Encryption_key = {
        id: 1,
        derived_key: 'key_material',
        salt: 'salt_value',
        iterations: 100000,
        device_fingerprint: 'fp123',
        created_at: '2026-03-14T10:00:00Z',
        is_active: 1,
        device_id: 1,
        row_version: 1,
      };
      expect(key.is_active).toBe(1);
      expect(key.iterations).toBe(100000);
    });

    it('should define Device with all required fields', () => {
      const device: Device = {
        id: 1,
        user_agent: 'Mozilla/5.0',
        screen_width: 1080,
        screen_height: 1920,
        hardware_concurrency: 4,
        last_seen: '2026-03-14T10:00:00Z',
        technician_email: 'tech@example.com',
        status: 'active',
        battery_level: 85,
        row_version: 1,
      };
      expect(device.battery_level).toBe(85);
      expect(device.status).toBe('active');
    });

    it('should define Outlier with all required fields', () => {
      const outlier: Outlier = {
        id: 1,
        reading_id: 1,
        detected_at: '2026-03-14T10:00:00Z',
        z_score: 3.5,
        is_resolved: 0,
        resolved_at: '',
        resolved_by: '',
        site_id: 1,
        notification_id: 1,
        row_version: 1,
      };
      expect(outlier.is_resolved).toBe(0);
      expect(outlier.z_score).toBe(3.5);
    });

    it('should define Sync_threshold with all required fields', () => {
      const threshold: Sync_threshold = {
        id: 1,
        max_attempts: 5,
        action: 'erase_key',
        is_active: 1,
        created_at: '2026-03-14T10:00:00Z',
        updated_at: '2026-03-14T10:00:00Z',
        row_version: 1,
      };
      expect(threshold.action).toBe('erase_key');
      expect(threshold.max_attempts).toBe(5);
    });

    it('should define Passphrase with all required fields', () => {
      const passphrase: Passphrase = {
        id: 1,
        hash: 'hash_value',
        salt: 'salt_value',
        is_set: 1,
        set_at: '2026-03-14T10:00:00Z',
        device_id: 1,
        failed_attempts: 0,
        row_version: 1,
      };
      expect(passphrase.is_set).toBe(1);
      expect(passphrase.failed_attempts).toBe(0);
    });

    it('should define Daily_aggregate with all required fields', () => {
      const aggregate: Daily_aggregate = {
        id: 1,
        date: '2026-03-14',
        total_readings: 100,
        synced_readings: 95,
        failed_readings: 5,
        avg_numeric_value: 42.5,
        site_id: 1,
        zone_id: 1,
        row_version: 1,
      };
      expect(aggregate.total_readings).toBe(100);
      expect(aggregate.avg_numeric_value).toBe(42.5);
    });

    it('should define Connectivity_zone with all required fields', () => {
      const zone: Connectivity_zone = {
        id: 1,
        name: 'Zone_A',
        polygon_geojson: '{"type":"Polygon"}',
        sync_success_rate: 0.85,
        last_updated: '2026-03-14T10:00:00Z',
        technician_email: 'supervisor@example.com',
        status: 'active',
        row_version: 1,
      };
      expect(zone.sync_success_rate).toBe(0.85);
      expect(zone.status).toBe('active');
    });

    it('should define Reading_history with all required fields', () => {
      const history: Reading_history = {
        id: 1,
        reading_id: 1,
        changed_field: 'numeric_value',
        old_value: '40.0',
        new_value: '42.5',
        changed_at: '2026-03-14T10:00:00Z',
        changed_by: 'tech@example.com',
        revision_id: 1,
        row_version: 1,
      };
      expect(history.changed_field).toBe('numeric_value');
      expect(history.new_value).toBe('42.5');
    });

    it('should define Site_visit with all required fields', () => {
      const visit: Site_visit = {
        id: 1,
        site_id: 1,
        visit_date: '2026-03-14',
        purpose: 'inspection',
        notes: 'Routine inspection completed',
        technician_email: 'tech@example.com',
        status: 'completed',
        equipment_id: 1,
        row_version: 1,
      };
      expect(visit.purpose).toBe('inspection');
      expect(visit.status).toBe('completed');
    });

    it('should define Equipment with all required fields', () => {
      const equipment: Equipment = {
        id: 1,
        serial_number: 'SN-2026-001',
        type: 'sensor',
        installation_date: '2026-01-01',
        last_calibration: '2026-03-01',
        site_id: 1,
        status: 'active',
        warranty_expiry: '2027-01-01',
        row_version: 1,
      };
      expect(equipment.serial_number).toBe('SN-2026-001');
      expect(equipment.status).toBe('active');
    });

    it('should define Calibration_log with all required fields', () => {
      const log: Calibration_log = {
        id: 1,
        equipment_id: 1,
        calibrated_at: '2026-03-14T10:00:00Z',
        calibrated_by: 'tech@example.com',
        next_calibration: '2026-06-14',
        notes: 'Calibrated successfully',
        status: 'passed',
        reading_id: 1,
        row_version: 1,
      };
      expect(log.status).toBe('passed');
      expect(log.calibrated_by).toBe('tech@example.com');
    });

    it('should define Notification with all required fields', () => {
      const notification: Notification = {
        id: 1,
        recipient_email: 'supervisor@example.com',
        type: 'outlier_detected',
        content: 'Outlier detected at Pipeline_Alpha_03',
        is_read: 0,
        created_at: '2026-03-14T10:10:00Z',
        related_entity_id: 1,
        related_entity_type: 'reading',
        row_version: 1,
      };
      expect(notification.type).toBe('outlier_detected');
      expect(notification.is_read).toBe(0);
    });

    it('should define Sync_policy with all required fields', () => {
      const policy: Sync_policy = {
        id: 1,
        name: 'Standard',
        min_battery_level: 20,
        min_network_strength: 3,
        retry_interval: 3600,
        is_active: 1,
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
        zone_id: 1,
        row_version: 1,
      };
      expect(policy.name).toBe('Standard');
      expect(policy.is_active).toBe(1);
    });

    it('should define Audit_trail with all required fields', () => {
      const trail: Audit_trail = {
        id: 1,
        entity_type: 'reading',
        entity_id: 1,
        action: 'create',
        performed_at: '2026-03-14T10:00:00Z',
        performed_by: 'tech@example.com',
        metadata: '{"field":"value"}',
        device_id: 1,
        row_version: 1,
      };
      expect(trail.entity_type).toBe('reading');
      expect(trail.action).toBe('create');
    });

    it('should define Maintenance_schedule with all required fields', () => {
      const schedule: Maintenance_schedule = {
        id: 1,
        equipment_id: 1,
        scheduled_date: '2026-04-01',
        type: 'preventive',
        status: 'scheduled',
        notes: 'Routine maintenance',
        technician_email: 'tech@example.com',
        row_version: 1,
      };
      expect(schedule.type).toBe('preventive');
      expect(schedule.status).toBe('scheduled');
    });
  });

  describe('Handler Type Aliases', () => {
    it('should define Handler type as a function', () => {
      // Handler should be a type that accepts Request, Env, Context and returns Promise<Response>
      type TestHandler = Handler<{ ok: boolean }>;
      const handler: TestHandler = async () => {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'Content-Type': 'application/json' },
        });
      };
      expect(handler).toBeDefined();
    });

    it('should define ListReadingsHandler type', () => {
      // Verify the type alias exists and is assignable
      const handler: ListReadingsHandler = async () => {
        return new Response(JSON.stringify([]), {
          headers: { 'Content-Type': 'application/json' },
        });
      };
      expect(handler).toBeDefined();
    });

    it('should define CreateReadingHandler type', () => {
      const handler: CreateReadingHandler = async () => {
        return new Response(JSON.stringify({ id: 1 }), {
          headers: { 'Content-Type': 'application/json' },
        });
      };
      expect(handler).toBeDefined();
    });

    it('should define GetReadingHandler type', () => {
      const handler: GetReadingHandler = async () => {
        return new Response(JSON.stringify({ id: 1 }), {
          headers: { 'Content-Type': 'application/json' },
        });
      };
      expect(handler).toBeDefined();
    });

    it('should define ListSitesHandler type', () => {
      const handler: ListSitesHandler = async () => {
        return new Response(JSON.stringify([]), {
          headers: { 'Content-Type': 'application/json' },
        });
      };
      expect(handler).toBeDefined();
    });

    it('should define GetSiteHandler type', () => {
      const handler: GetSiteHandler = async () => {
        return new Response(JSON.stringify({ id: 1 }), {
          headers: { 'Content-Type': 'application/json' },
        });
      };
      expect(handler).toBeDefined();
    });

    it('should define CreateSiteHandler type', () => {
      const handler: CreateSiteHandler = async () => {
        return new Response(JSON.stringify({ id: 1 }), {
          headers: { 'Content-Type': 'application/json' },
        });
      };
      expect(handler).toBeDefined();
    });

    it('should define UpdateReadingHandler type', () => {
      const handler: UpdateReadingHandler = async () => {
        return new Response(JSON.stringify({ id: 1 }), {
          headers: { 'Content-Type': 'application/json' },
        });
      };
      expect(handler).toBeDefined();
    });

    it('should define DeleteReadingHandler type', () => {
      const handler: DeleteReadingHandler = async () => {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'Content-Type': 'application/json' },
        });
      };
      expect(handler).toBeDefined();
    });

    it('should define ListDevicesHandler type', () => {
      const handler: ListDevicesHandler = async () => {
        return new Response(JSON.stringify([]), {
          headers: { 'Content-Type': 'application/json' },
        });
      };
      expect(handler).toBeDefined();
    });

    it('should define GetDeviceHandler type', () => {
      const handler: GetDeviceHandler = async () => {
        return new Response(JSON.stringify({ id: 1 }), {
          headers: { 'Content-Type': 'application/json' },
        });
      };
      expect(handler).toBeDefined();
    });

    it('should define CreateDeviceHandler type', () => {
      const handler: CreateDeviceHandler = async () => {
        return new Response(JSON.stringify({ id: 1 }), {
          headers: { 'Content-Type': 'application/json' },
        });
      };
      expect(handler).toBeDefined();
    });

    it('should define ListNotificationsHandler type', () => {
      const handler: ListNotificationsHandler = async () => {
        return new Response(JSON.stringify([]), {
          headers: { 'Content-Type': 'application/json' },
        });
      };
      expect(handler).toBeDefined();
    });

    it('should define CreateNotificationHandler type', () => {
      const handler: CreateNotificationHandler = async () => {
        return new Response(JSON.stringify({ id: 1 }), {
          headers: { 'Content-Type': 'application/json' },
        });
      };
      expect(handler).toBeDefined();
    });

    it('should define ListEncryption_keysHandler type', () => {
      const handler: ListEncryption_keysHandler = async () => {
        return new Response(JSON.stringify([]), {
          headers: { 'Content-Type': 'application/json' },
        });
      };
      expect(handler).toBeDefined();
    });

    it('should define GetEncryption_keyHandler type', () => {
      const handler: GetEncryption_keyHandler = async () => {
        return new Response(JSON.stringify({ id: 1 }), {
          headers: { 'Content-Type': 'application/json' },
        });
      };
      expect(handler).toBeDefined();
    });

    it('should define CreateEncryption_keyHandler type', () => {
      const handler: CreateEncryption_keyHandler = async () => {
        return new Response(JSON.stringify({ id: 1 }), {
          headers: { 'Content-Type': 'application/json' },
        });
      };
      expect(handler).toBeDefined();
    });

    it('should define DeleteEncryption_keyHandler type', () => {
      const handler: DeleteEncryption_keyHandler = async () => {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'Content-Type': 'application/json' },
        });
      };
      expect(handler).toBeDefined();
    });

    it('should define ListSync_logsHandler type', () => {
      const handler: ListSync_logsHandler = async () => {
        return new Response(JSON.stringify([]), {
          headers: { 'Content-Type': 'application/json' },
        });
      };
      expect(handler).toBeDefined();
    });

    it('should define CreateSync_logHandler type', () => {
      const handler: CreateSync_logHandler = async () => {
        return new Response(JSON.stringify({ id: 1 }), {
          headers: { 'Content-Type': 'application/json' },
        });
      };
      expect(handler).toBeDefined();
    });

    it('should define ListOutliersHandler type', () => {
      const handler: ListOutliersHandler = async () => {
        return new Response(JSON.stringify([]), {
          headers: { 'Content-Type': 'application/json' },
        });
      };
      expect(handler).toBeDefined();
    });

    it('should define DailyAggregatesHandler type', () => {
      const handler: DailyAggregatesHandler = async () => {
        return new Response(JSON.stringify([]), {
          headers: { 'Content-Type': 'application/json' },
        });
      };
      expect(handler).toBeDefined();
    });

    it('should define SyncStatusHeatmapHandler type', () => {
      const handler: SyncStatusHeatmapHandler = async () => {
        return new Response(JSON.stringify([]), {
          headers: { 'Content-Type': 'application/json' },
        });
      };
      expect(handler).toBeDefined();
    });

    it('should define PendingSyncReadingsHandler type', () => {
      const handler: PendingSyncReadingsHandler = async () => {
        return new Response(JSON.stringify([]), {
          headers: { 'Content-Type': 'application/json' },
        });
      };
      expect(handler).toBeDefined();
    });

    it('should define ListEquipmentsHandler type', () => {
      const handler: ListEquipmentsHandler = async () => {
        return new Response(JSON.stringify([]), {
          headers: { 'Content-Type': 'application/json' },
        });
      };
      expect(handler).toBeDefined();
    });

    it('should define GetEquipmentHandler type', () => {
      const handler: GetEquipmentHandler = async () => {
        return new Response(JSON.stringify({ id: 1 }), {
          headers: { 'Content-Type': 'application/json' },
        });
      };
      expect(handler).toBeDefined();
    });

    it('should define ListCalibration_logsHandler type', () => {
      const handler: ListCalibration_logsHandler = async () => {
        return new Response(JSON.stringify([]), {
          headers: { 'Content-Type': 'application/json' },
        });
      };
      expect(handler).toBeDefined();
    });

    it('should define ListSite_visitsHandler type', () => {
      const handler: ListSite_visitsHandler = async () => {
        return new Response(JSON.stringify([]), {
          headers: { 'Content-Type': 'application/json' },
        });
      };
      expect(handler).toBeDefined();
    });

    it('should define ListMaintenance_schedulesHandler type', () => {
      const handler: ListMaintenance_schedulesHandler = async () => {
        return new Response(JSON.stringify([]), {
          headers: { 'Content-Type': 'application/json' },
        });
      };
      expect(handler).toBeDefined();
    });

    it('should define ListAudit_trailsHandler type', () => {
      const handler: ListAudit_trailsHandler = async () => {
        return new Response(JSON.stringify([]), {
          headers: { 'Content-Type': 'application/json' },
        });
      };
      expect(handler).toBeDefined();
    });

    it('should define ListConnectivity_zonesHandler type', () => {
      const handler: ListConnectivity_zonesHandler = async () => {
        return new Response(JSON.stringify([]), {
          headers: { 'Content-Type': 'application/json' },
        });
      };
      expect(handler).toBeDefined();
    });

    it('should define ListSync_policysHandler type', () => {
      const handler: ListSync_policysHandler = async () => {
        return new Response(JSON.stringify([]), {
          headers: { 'Content-Type': 'application/json' },
        });
      };
      expect(handler).toBeDefined();
    });

    it('should define BulkResult handler types', () => {
      const createBulk: CreateReadingBulkHandler = async () => {
        return new Response(JSON.stringify({ created: 5, ids: [1, 2, 3, 4, 5] }), {
          headers: { 'Content-Type': 'application/json' },
        });
      };
      expect(createBulk).toBeDefined();
    });

    it('should define Stats handler types', () => {
      const stats: ListReadingsStatsHandler = async () => {
        return new Response(JSON.stringify([]), {
          headers: { 'Content-Type': 'application/json' },
        });
      };
      expect(stats).toBeDefined();
    });
  });

  describe('Type Safety - Response Types', () => {
    it('should allow Reading[] as ListReadingsResponse', () => {
      const response: import('../src/types').ListReadingsResponse = [
        { id: 1, photo: '', latitude: 0, longitude: 0, numeric_value: 0, timestamp: '', encrypted_blob: '', sync_status: 'pending', sync_attempts: 0, dedupe_id: '', site_id: 1, device_id: 1, equipment_id: 1, calibration_id: 1, row_version: 1 },
      ];
      expect(response.length).toBe(1);
    });

    it('should allow ApiError as ListReadingsResponse', () => {
      const response: import('../src/types').ListReadingsResponse = { error: 'Not found' };
      expect('error' in response).toBe(true);
    });

    it('should allow Bucket[] as ListReadingsStatsResponse', () => {
      const response: import('../src/types').ListReadingsStatsResponse = [
        { key: 'group1', count: 100, sum: 500, avg: 5, min: 1, max: 10 },
      ];
      expect(response[0].count).toBe(100);
    });

    it('should allow BulkResult as CreateReadingBulkResponse', () => {
      const response: import('../src/types').CreateReadingBulkResponse = { created: 5, ids: [1, 2, 3, 4, 5] };
      expect(response.created).toBe(5);
    });
  });
});
