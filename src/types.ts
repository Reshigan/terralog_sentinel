// GENERATED from the manifest. Do not edit — regenerated on every build.
import type { Handler } from "./lib/http";

/** A shared error envelope so single-row endpoints can 404 while staying typed.
 * `requestId` is present on the failures a user is likely to report (a constraint
 * rejection, a version conflict) — the same id the frozen template stamps on the
 * `x-request-id` header and the access-log line, so one paste finds one log line. */
export interface ApiError { error: string; requestId?: string }
/** Untyped row for free-form query endpoints. */
export type Row = Record<string, unknown>;
/** One GROUP BY bucket from a `/stats` rollup: the grouped value, how many rows
 * fell in it, and the four aggregates over the chosen metric (null when the
 * caller asked for no metric). Server-side aggregation — the client never sees
 * the rows it is a summary of, which is what makes it work at any table size. */
export interface Bucket {
  key: string | number | null;
  count: number;
  sum: number | null;
  avg: number | null;
  min: number | null;
  max: number | null;
}
/** The result of one bulk create: how many rows landed, and their new ids in
 * request order. All-or-nothing — D1 runs the batch as a single transaction. */
export interface BulkResult { created: number; ids: number[] }

export interface Reading {
  id: number;
  photo: string;
  latitude: number;
  longitude: number;
  numeric_value: number;
  timestamp: string;
  encrypted_blob: string;
  sync_status: string;
  sync_attempts: number;
  dedupe_id: string;
  site_id: number;
  device_id: number;
  equipment_id: number;
  calibration_id: number;
  row_version: number;
}

export interface Site {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  mean_value: number;
  std_dev: number;
  last_sync: string;
  sync_success_rate: number;
  technician_email: string;
  status: string;
  zone_id: number;
  row_version: number;
}

export interface Sync_log {
  id: number;
  reading_id: number;
  attempted_at: string;
  status: string;
  response_code: number;
  error_message: string;
  sync_policy_id: number;
  row_version: number;
}

export interface Encryption_key {
  id: number;
  derived_key: string;
  salt: string;
  iterations: number;
  device_fingerprint: string;
  created_at: string;
  is_active: number;
  device_id: number;
  row_version: number;
}

export interface Device {
  id: number;
  user_agent: string;
  screen_width: number;
  screen_height: number;
  hardware_concurrency: number;
  last_seen: string;
  technician_email: string;
  status: string;
  battery_level: number;
  row_version: number;
}

export interface Outlier {
  id: number;
  reading_id: number;
  detected_at: string;
  z_score: number;
  is_resolved: number;
  resolved_at: string;
  resolved_by: string;
  site_id: number;
  notification_id: number;
  row_version: number;
}

export interface Sync_threshold {
  id: number;
  max_attempts: number;
  action: string;
  is_active: number;
  created_at: string;
  updated_at: string;
  row_version: number;
}

export interface Passphrase {
  id: number;
  hash: string;
  salt: string;
  is_set: number;
  set_at: string;
  device_id: number;
  failed_attempts: number;
  row_version: number;
}

export interface Daily_aggregate {
  id: number;
  date: string;
  total_readings: number;
  synced_readings: number;
  failed_readings: number;
  avg_numeric_value: number;
  site_id: number;
  zone_id: number;
  row_version: number;
}

export interface Connectivity_zone {
  id: number;
  name: string;
  polygon_geojson: string;
  sync_success_rate: number;
  last_updated: string;
  technician_email: string;
  status: string;
  row_version: number;
}

export interface Reading_history {
  id: number;
  reading_id: number;
  changed_field: string;
  old_value: string;
  new_value: string;
  changed_at: string;
  changed_by: string;
  revision_id: number;
  row_version: number;
}

export interface Site_visit {
  id: number;
  site_id: number;
  visit_date: string;
  purpose: string;
  notes: string;
  technician_email: string;
  status: string;
  equipment_id: number;
  row_version: number;
}

export interface Equipment {
  id: number;
  serial_number: string;
  type: string;
  installation_date: string;
  last_calibration: string;
  site_id: number;
  status: string;
  warranty_expiry: string;
  row_version: number;
}

export interface Calibration_log {
  id: number;
  equipment_id: number;
  calibrated_at: string;
  calibrated_by: string;
  next_calibration: string;
  notes: string;
  status: string;
  reading_id: number;
  row_version: number;
}

export interface Notification {
  id: number;
  recipient_email: string;
  type: string;
  content: string;
  is_read: number;
  created_at: string;
  related_entity_id: number;
  related_entity_type: string;
  row_version: number;
}

export interface Sync_policy {
  id: number;
  name: string;
  min_battery_level: number;
  min_network_strength: number;
  retry_interval: number;
  is_active: number;
  created_at: string;
  updated_at: string;
  zone_id: number;
  row_version: number;
}

export interface Audit_trail {
  id: number;
  entity_type: string;
  entity_id: number;
  action: string;
  performed_at: string;
  performed_by: string;
  metadata: string;
  device_id: number;
  row_version: number;
}

export interface Maintenance_schedule {
  id: number;
  equipment_id: number;
  scheduled_date: string;
  type: string;
  status: string;
  notes: string;
  technician_email: string;
  row_version: number;
}

export type ListOutliersResponse = Row[] | ApiError;
export type ListOutliersHandler = Handler<ListOutliersResponse>;
export type SyncStatusHeatmapResponse = Row[] | ApiError;
export type SyncStatusHeatmapHandler = Handler<SyncStatusHeatmapResponse>;
export type SiteSyncStatsResponse = Row[] | ApiError;
export type SiteSyncStatsHandler = Handler<SiteSyncStatsResponse>;
export type DailyAggregatesResponse = Row[] | ApiError;
export type DailyAggregatesHandler = Handler<DailyAggregatesResponse>;
export type SiteReadingTrendResponse = Row[] | ApiError;
export type SiteReadingTrendHandler = Handler<SiteReadingTrendResponse>;
export type LowSyncZonesResponse = Row[] | ApiError;
export type LowSyncZonesHandler = Handler<LowSyncZonesResponse>;
export type PendingSyncReadingsResponse = Row[] | ApiError;
export type PendingSyncReadingsHandler = Handler<PendingSyncReadingsResponse>;
export type FailedSyncThresholdReadingsResponse = Row[] | ApiError;
export type FailedSyncThresholdReadingsHandler = Handler<FailedSyncThresholdReadingsResponse>;
export type SiteEquipmentStatusResponse = Row[] | ApiError;
export type SiteEquipmentStatusHandler = Handler<SiteEquipmentStatusResponse>;
export type UnresolvedOutliersResponse = Row[] | ApiError;
export type UnresolvedOutliersHandler = Handler<UnresolvedOutliersResponse>;
export type UpcomingVisitsResponse = Row[] | ApiError;
export type UpcomingVisitsHandler = Handler<UpcomingVisitsResponse>;
export type OverdueCalibrationsResponse = Row[] | ApiError;
export type OverdueCalibrationsHandler = Handler<OverdueCalibrationsResponse>;
export type DedupeCheckResponse = Row[] | ApiError;
export type DedupeCheckHandler = Handler<DedupeCheckResponse>;
export type LowBatteryDevicesResponse = Row[] | ApiError;
export type LowBatteryDevicesHandler = Handler<LowBatteryDevicesResponse>;
export type WarrantyExpiryResponse = Row[] | ApiError;
export type WarrantyExpiryHandler = Handler<WarrantyExpiryResponse>;
export type OverdueMaintenanceResponse = Row[] | ApiError;
export type OverdueMaintenanceHandler = Handler<OverdueMaintenanceResponse>;
export type ListReadingsResponse = Reading[] | ApiError;
export type ListReadingsHandler = Handler<ListReadingsResponse>;
export type ListReadingsStatsResponse = Bucket[] | ApiError;
export type ListReadingsStatsHandler = Handler<ListReadingsStatsResponse>;
export type GetReadingResponse = Reading | ApiError;
export type GetReadingHandler = Handler<GetReadingResponse>;
export type CreateReadingResponse = Reading | ApiError;
export type CreateReadingHandler = Handler<CreateReadingResponse>;
export type CreateReadingBulkResponse = BulkResult | ApiError;
export type CreateReadingBulkHandler = Handler<CreateReadingBulkResponse>;
export type UpdateReadingResponse = Reading | ApiError;
export type UpdateReadingHandler = Handler<UpdateReadingResponse>;
export type DeleteReadingResponse = { ok: boolean } | ApiError;
export type DeleteReadingHandler = Handler<DeleteReadingResponse>;
export type ListSitesResponse = Site[] | ApiError;
export type ListSitesHandler = Handler<ListSitesResponse>;
export type ListSitesStatsResponse = Bucket[] | ApiError;
export type ListSitesStatsHandler = Handler<ListSitesStatsResponse>;
export type GetSiteResponse = Site | ApiError;
export type GetSiteHandler = Handler<GetSiteResponse>;
export type CreateSiteResponse = Site | ApiError;
export type CreateSiteHandler = Handler<CreateSiteResponse>;
export type CreateSiteBulkResponse = BulkResult | ApiError;
export type CreateSiteBulkHandler = Handler<CreateSiteBulkResponse>;
export type UpdateSiteResponse = Site | ApiError;
export type UpdateSiteHandler = Handler<UpdateSiteResponse>;
export type DeleteSiteResponse = { ok: boolean } | ApiError;
export type DeleteSiteHandler = Handler<DeleteSiteResponse>;
export type ListSync_logsResponse = Sync_log[] | ApiError;
export type ListSync_logsHandler = Handler<ListSync_logsResponse>;
export type ListSync_logsStatsResponse = Bucket[] | ApiError;
export type ListSync_logsStatsHandler = Handler<ListSync_logsStatsResponse>;
export type GetSync_logResponse = Sync_log | ApiError;
export type GetSync_logHandler = Handler<GetSync_logResponse>;
export type CreateSync_logResponse = Sync_log | ApiError;
export type CreateSync_logHandler = Handler<CreateSync_logResponse>;
export type CreateSync_logBulkResponse = BulkResult | ApiError;
export type CreateSync_logBulkHandler = Handler<CreateSync_logBulkResponse>;
export type UpdateSync_logResponse = Sync_log | ApiError;
export type UpdateSync_logHandler = Handler<UpdateSync_logResponse>;
export type ListEncryption_keysResponse = Encryption_key[] | ApiError;
export type ListEncryption_keysHandler = Handler<ListEncryption_keysResponse>;
export type ListEncryption_keysStatsResponse = Bucket[] | ApiError;
export type ListEncryption_keysStatsHandler = Handler<ListEncryption_keysStatsResponse>;
export type GetEncryption_keyResponse = Encryption_key | ApiError;
export type GetEncryption_keyHandler = Handler<GetEncryption_keyResponse>;
export type CreateEncryption_keyResponse = Encryption_key | ApiError;
export type CreateEncryption_keyHandler = Handler<CreateEncryption_keyResponse>;
export type CreateEncryption_keyBulkResponse = BulkResult | ApiError;
export type CreateEncryption_keyBulkHandler = Handler<CreateEncryption_keyBulkResponse>;
export type UpdateEncryption_keyResponse = Encryption_key | ApiError;
export type UpdateEncryption_keyHandler = Handler<UpdateEncryption_keyResponse>;
export type DeleteEncryption_keyResponse = { ok: boolean } | ApiError;
export type DeleteEncryption_keyHandler = Handler<DeleteEncryption_keyResponse>;
export type ListDevicesResponse = Device[] | ApiError;
export type ListDevicesHandler = Handler<ListDevicesResponse>;
export type ListDevicesStatsResponse = Bucket[] | ApiError;
export type ListDevicesStatsHandler = Handler<ListDevicesStatsResponse>;
export type GetDeviceResponse = Device | ApiError;
export type GetDeviceHandler = Handler<GetDeviceResponse>;
export type CreateDeviceResponse = Device | ApiError;
export type CreateDeviceHandler = Handler<CreateDeviceResponse>;
export type CreateDeviceBulkResponse = BulkResult | ApiError;
export type CreateDeviceBulkHandler = Handler<CreateDeviceBulkResponse>;
export type UpdateDeviceResponse = Device | ApiError;
export type UpdateDeviceHandler = Handler<UpdateDeviceResponse>;
export type DeleteDeviceResponse = { ok: boolean } | ApiError;
export type DeleteDeviceHandler = Handler<DeleteDeviceResponse>;
export type ListOutliers2Response = Outlier[] | ApiError;
export type ListOutliers2Handler = Handler<ListOutliers2Response>;
export type ListOutliers2StatsResponse = Bucket[] | ApiError;
export type ListOutliers2StatsHandler = Handler<ListOutliers2StatsResponse>;
export type GetOutlierResponse = Outlier | ApiError;
export type GetOutlierHandler = Handler<GetOutlierResponse>;
export type CreateOutlierResponse = Outlier | ApiError;
export type CreateOutlierHandler = Handler<CreateOutlierResponse>;
export type CreateOutlierBulkResponse = BulkResult | ApiError;
export type CreateOutlierBulkHandler = Handler<CreateOutlierBulkResponse>;
export type UpdateOutlierResponse = Outlier | ApiError;
export type UpdateOutlierHandler = Handler<UpdateOutlierResponse>;
export type DeleteOutlierResponse = { ok: boolean } | ApiError;
export type DeleteOutlierHandler = Handler<DeleteOutlierResponse>;
export type ListSync_thresholdsResponse = Sync_threshold[] | ApiError;
export type ListSync_thresholdsHandler = Handler<ListSync_thresholdsResponse>;
export type ListSync_thresholdsStatsResponse = Bucket[] | ApiError;
export type ListSync_thresholdsStatsHandler = Handler<ListSync_thresholdsStatsResponse>;
export type GetSync_thresholdResponse = Sync_threshold | ApiError;
export type GetSync_thresholdHandler = Handler<GetSync_thresholdResponse>;
export type CreateSync_thresholdResponse = Sync_threshold | ApiError;
export type CreateSync_thresholdHandler = Handler<CreateSync_thresholdResponse>;
export type CreateSync_thresholdBulkResponse = BulkResult | ApiError;
export type CreateSync_thresholdBulkHandler = Handler<CreateSync_thresholdBulkResponse>;
export type UpdateSync_thresholdResponse = Sync_threshold | ApiError;
export type UpdateSync_thresholdHandler = Handler<UpdateSync_thresholdResponse>;
export type DeleteSync_thresholdResponse = { ok: boolean } | ApiError;
export type DeleteSync_thresholdHandler = Handler<DeleteSync_thresholdResponse>;
export type ListPassphrasesResponse = Passphrase[] | ApiError;
export type ListPassphrasesHandler = Handler<ListPassphrasesResponse>;
export type ListPassphrasesStatsResponse = Bucket[] | ApiError;
export type ListPassphrasesStatsHandler = Handler<ListPassphrasesStatsResponse>;
export type GetPassphraseResponse = Passphrase | ApiError;
export type GetPassphraseHandler = Handler<GetPassphraseResponse>;
export type CreatePassphraseResponse = Passphrase | ApiError;
export type CreatePassphraseHandler = Handler<CreatePassphraseResponse>;
export type CreatePassphraseBulkResponse = BulkResult | ApiError;
export type CreatePassphraseBulkHandler = Handler<CreatePassphraseBulkResponse>;
export type UpdatePassphraseResponse = Passphrase | ApiError;
export type UpdatePassphraseHandler = Handler<UpdatePassphraseResponse>;
export type DeletePassphraseResponse = { ok: boolean } | ApiError;
export type DeletePassphraseHandler = Handler<DeletePassphraseResponse>;
export type ListDaily_aggregatesResponse = Daily_aggregate[] | ApiError;
export type ListDaily_aggregatesHandler = Handler<ListDaily_aggregatesResponse>;
export type ListDaily_aggregatesStatsResponse = Bucket[] | ApiError;
export type ListDaily_aggregatesStatsHandler = Handler<ListDaily_aggregatesStatsResponse>;
export type GetDaily_aggregateResponse = Daily_aggregate | ApiError;
export type GetDaily_aggregateHandler = Handler<GetDaily_aggregateResponse>;
export type CreateDaily_aggregateResponse = Daily_aggregate | ApiError;
export type CreateDaily_aggregateHandler = Handler<CreateDaily_aggregateResponse>;
export type CreateDaily_aggregateBulkResponse = BulkResult | ApiError;
export type CreateDaily_aggregateBulkHandler = Handler<CreateDaily_aggregateBulkResponse>;
export type UpdateDaily_aggregateResponse = Daily_aggregate | ApiError;
export type UpdateDaily_aggregateHandler = Handler<UpdateDaily_aggregateResponse>;
export type DeleteDaily_aggregateResponse = { ok: boolean } | ApiError;
export type DeleteDaily_aggregateHandler = Handler<DeleteDaily_aggregateResponse>;
export type ListConnectivity_zonesResponse = Connectivity_zone[] | ApiError;
export type ListConnectivity_zonesHandler = Handler<ListConnectivity_zonesResponse>;
export type ListConnectivity_zonesStatsResponse = Bucket[] | ApiError;
export type ListConnectivity_zonesStatsHandler = Handler<ListConnectivity_zonesStatsResponse>;
export type GetConnectivity_zoneResponse = Connectivity_zone | ApiError;
export type GetConnectivity_zoneHandler = Handler<GetConnectivity_zoneResponse>;
export type CreateConnectivity_zoneResponse = Connectivity_zone | ApiError;
export type CreateConnectivity_zoneHandler = Handler<CreateConnectivity_zoneResponse>;
export type CreateConnectivity_zoneBulkResponse = BulkResult | ApiError;
export type CreateConnectivity_zoneBulkHandler = Handler<CreateConnectivity_zoneBulkResponse>;
export type UpdateConnectivity_zoneResponse = Connectivity_zone | ApiError;
export type UpdateConnectivity_zoneHandler = Handler<UpdateConnectivity_zoneResponse>;
export type DeleteConnectivity_zoneResponse = { ok: boolean } | ApiError;
export type DeleteConnectivity_zoneHandler = Handler<DeleteConnectivity_zoneResponse>;
export type ListReading_historysResponse = Reading_history[] | ApiError;
export type ListReading_historysHandler = Handler<ListReading_historysResponse>;
export type ListReading_historysStatsResponse = Bucket[] | ApiError;
export type ListReading_historysStatsHandler = Handler<ListReading_historysStatsResponse>;
export type GetReading_historyResponse = Reading_history | ApiError;
export type GetReading_historyHandler = Handler<GetReading_historyResponse>;
export type CreateReading_historyResponse = Reading_history | ApiError;
export type CreateReading_historyHandler = Handler<CreateReading_historyResponse>;
export type CreateReading_historyBulkResponse = BulkResult | ApiError;
export type CreateReading_historyBulkHandler = Handler<CreateReading_historyBulkResponse>;
export type UpdateReading_historyResponse = Reading_history | ApiError;
export type UpdateReading_historyHandler = Handler<UpdateReading_historyResponse>;
export type ListSite_visitsResponse = Site_visit[] | ApiError;
export type ListSite_visitsHandler = Handler<ListSite_visitsResponse>;
export type ListSite_visitsStatsResponse = Bucket[] | ApiError;
export type ListSite_visitsStatsHandler = Handler<ListSite_visitsStatsResponse>;
export type GetSite_visitResponse = Site_visit | ApiError;
export type GetSite_visitHandler = Handler<GetSite_visitResponse>;
export type CreateSite_visitResponse = Site_visit | ApiError;
export type CreateSite_visitHandler = Handler<CreateSite_visitResponse>;
export type CreateSite_visitBulkResponse = BulkResult | ApiError;
export type CreateSite_visitBulkHandler = Handler<CreateSite_visitBulkResponse>;
export type UpdateSite_visitResponse = Site_visit | ApiError;
export type UpdateSite_visitHandler = Handler<UpdateSite_visitResponse>;
export type DeleteSite_visitResponse = { ok: boolean } | ApiError;
export type DeleteSite_visitHandler = Handler<DeleteSite_visitResponse>;
export type ListEquipmentsResponse = Equipment[] | ApiError;
export type ListEquipmentsHandler = Handler<ListEquipmentsResponse>;
export type ListEquipmentsStatsResponse = Bucket[] | ApiError;
export type ListEquipmentsStatsHandler = Handler<ListEquipmentsStatsResponse>;
export type GetEquipmentResponse = Equipment | ApiError;
export type GetEquipmentHandler = Handler<GetEquipmentResponse>;
export type CreateEquipmentResponse = Equipment | ApiError;
export type CreateEquipmentHandler = Handler<CreateEquipmentResponse>;
export type CreateEquipmentBulkResponse = BulkResult | ApiError;
export type CreateEquipmentBulkHandler = Handler<CreateEquipmentBulkResponse>;
export type UpdateEquipmentResponse = Equipment | ApiError;
export type UpdateEquipmentHandler = Handler<UpdateEquipmentResponse>;
export type DeleteEquipmentResponse = { ok: boolean } | ApiError;
export type DeleteEquipmentHandler = Handler<DeleteEquipmentResponse>;
export type ListCalibration_logsResponse = Calibration_log[] | ApiError;
export type ListCalibration_logsHandler = Handler<ListCalibration_logsResponse>;
export type ListCalibration_logsStatsResponse = Bucket[] | ApiError;
export type ListCalibration_logsStatsHandler = Handler<ListCalibration_logsStatsResponse>;
export type GetCalibration_logResponse = Calibration_log | ApiError;
export type GetCalibration_logHandler = Handler<GetCalibration_logResponse>;
export type CreateCalibration_logResponse = Calibration_log | ApiError;
export type CreateCalibration_logHandler = Handler<CreateCalibration_logResponse>;
export type CreateCalibration_logBulkResponse = BulkResult | ApiError;
export type CreateCalibration_logBulkHandler = Handler<CreateCalibration_logBulkResponse>;
export type UpdateCalibration_logResponse = Calibration_log | ApiError;
export type UpdateCalibration_logHandler = Handler<UpdateCalibration_logResponse>;
export type ListNotificationsResponse = Notification[] | ApiError;
export type ListNotificationsHandler = Handler<ListNotificationsResponse>;
export type ListNotificationsStatsResponse = Bucket[] | ApiError;
export type ListNotificationsStatsHandler = Handler<ListNotificationsStatsResponse>;
export type GetNotificationResponse = Notification | ApiError;
export type GetNotificationHandler = Handler<GetNotificationResponse>;
export type CreateNotificationResponse = Notification | ApiError;
export type CreateNotificationHandler = Handler<CreateNotificationResponse>;
export type CreateNotificationBulkResponse = BulkResult | ApiError;
export type CreateNotificationBulkHandler = Handler<CreateNotificationBulkResponse>;
export type UpdateNotificationResponse = Notification | ApiError;
export type UpdateNotificationHandler = Handler<UpdateNotificationResponse>;
export type DeleteNotificationResponse = { ok: boolean } | ApiError;
export type DeleteNotificationHandler = Handler<DeleteNotificationResponse>;
export type ListSync_policysResponse = Sync_policy[] | ApiError;
export type ListSync_policysHandler = Handler<ListSync_policysResponse>;
export type ListSync_policysStatsResponse = Bucket[] | ApiError;
export type ListSync_policysStatsHandler = Handler<ListSync_policysStatsResponse>;
export type GetSync_policyResponse = Sync_policy | ApiError;
export type GetSync_policyHandler = Handler<GetSync_policyResponse>;
export type CreateSync_policyResponse = Sync_policy | ApiError;
export type CreateSync_policyHandler = Handler<CreateSync_policyResponse>;
export type CreateSync_policyBulkResponse = BulkResult | ApiError;
export type CreateSync_policyBulkHandler = Handler<CreateSync_policyBulkResponse>;
export type UpdateSync_policyResponse = Sync_policy | ApiError;
export type UpdateSync_policyHandler = Handler<UpdateSync_policyResponse>;
export type DeleteSync_policyResponse = { ok: boolean } | ApiError;
export type DeleteSync_policyHandler = Handler<DeleteSync_policyResponse>;
export type ListAudit_trailsResponse = Audit_trail[] | ApiError;
export type ListAudit_trailsHandler = Handler<ListAudit_trailsResponse>;
export type ListAudit_trailsStatsResponse = Bucket[] | ApiError;
export type ListAudit_trailsStatsHandler = Handler<ListAudit_trailsStatsResponse>;
export type GetAudit_trailResponse = Audit_trail | ApiError;
export type GetAudit_trailHandler = Handler<GetAudit_trailResponse>;
export type CreateAudit_trailResponse = Audit_trail | ApiError;
export type CreateAudit_trailHandler = Handler<CreateAudit_trailResponse>;
export type CreateAudit_trailBulkResponse = BulkResult | ApiError;
export type CreateAudit_trailBulkHandler = Handler<CreateAudit_trailBulkResponse>;
export type UpdateAudit_trailResponse = Audit_trail | ApiError;
export type UpdateAudit_trailHandler = Handler<UpdateAudit_trailResponse>;
export type ListMaintenance_schedulesResponse = Maintenance_schedule[] | ApiError;
export type ListMaintenance_schedulesHandler = Handler<ListMaintenance_schedulesResponse>;
export type ListMaintenance_schedulesStatsResponse = Bucket[] | ApiError;
export type ListMaintenance_schedulesStatsHandler = Handler<ListMaintenance_schedulesStatsResponse>;
export type GetMaintenance_scheduleResponse = Maintenance_schedule | ApiError;
export type GetMaintenance_scheduleHandler = Handler<GetMaintenance_scheduleResponse>;
export type CreateMaintenance_scheduleResponse = Maintenance_schedule | ApiError;
export type CreateMaintenance_scheduleHandler = Handler<CreateMaintenance_scheduleResponse>;
export type CreateMaintenance_scheduleBulkResponse = BulkResult | ApiError;
export type CreateMaintenance_scheduleBulkHandler = Handler<CreateMaintenance_scheduleBulkResponse>;
export type UpdateMaintenance_scheduleResponse = Maintenance_schedule | ApiError;
export type UpdateMaintenance_scheduleHandler = Handler<UpdateMaintenance_scheduleResponse>;
export type DeleteMaintenance_scheduleResponse = { ok: boolean } | ApiError;
export type DeleteMaintenance_scheduleHandler = Handler<DeleteMaintenance_scheduleResponse>;
