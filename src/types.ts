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
  capture_timestamp: string;
  latitude: number;
  longitude: number;
  numeric_value: number;
  photo_blob_id: string;
  encrypted_blob: string;
  sync_status: string;
  sync_attempts: number;
  device_fingerprint: string;
  dedupe_id: string;
  erasure_policy_id: number;
  reading_type_id: number;
  site_id: number;
  technician_id: number;
  weather_conditions: string;
  equipment_used: string;
  notes: string;
  row_version: number;
}

export interface Sync_log {
  id: number;
  reading_id: number;
  attempt_timestamp: string;
  status: string;
  http_status: number;
  error_message: string;
  retry_count: number;
  sync_session_id: number;
  bytes_transferred: number;
  duration_ms: number;
  endpoint_url: string;
  row_version: number;
}

export interface Encryption_key {
  id: number;
  salt: string;
  derived_at: string;
  device_fingerprint: string;
  is_active: number;
  erased_at: string;
  device_id: number;
  key_status: string;
  passphrase_strength: number;
  key_algorithm: string;
  key_iterations: number;
  row_version: number;
}

export interface Erasure_policy {
  id: number;
  name: string;
  max_attempts: number;
  erase_after_days: number;
  description: string;
  is_active: number;
  policy_type: string;
  notification_days: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  row_version: number;
}

export interface Anomaly {
  id: number;
  reading_id: number;
  grid_cell_id: number;
  cell_mean: number;
  cell_stddev: number;
  z_score: number;
  detected_at: string;
  resolved_at: string;
  resolution_notes: string;
  status: string;
  assigned_to: number;
  severity: string;
  follow_up_required: number;
  row_version: number;
}

export interface Grid_cell {
  id: number;
  grid_size_meters: number;
  cell_hash: string;
  latitude_min: number;
  latitude_max: number;
  longitude_min: number;
  longitude_max: number;
  last_updated: string;
  site_id: number;
  reading_count: number;
  avg_value: number;
  row_version: number;
}

export interface Technician {
  id: number;
  name: string;
  email: string;
  device_id: string;
  last_active: string;
  is_active: number;
  status: string;
  hire_date: string;
  supervisor_id: number;
  certification_level: string;
  phone_number: string;
  emergency_contact: string;
  row_version: number;
}

export interface Site {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  description: string;
  is_active: number;
  site_type: string;
  region_id: number;
  status: string;
  installation_date: string;
  last_inspection_date: string;
  maintenance_frequency_days: number;
  row_version: number;
}

export interface Reading_type {
  id: number;
  name: string;
  unit: string;
  description: string;
  min_value: number;
  max_value: number;
  is_active: number;
  category: string;
  expected_frequency_hours: number;
  critical_threshold: number;
  warning_threshold: number;
  row_version: number;
}

export interface Sync_policy {
  id: number;
  name: string;
  max_attempts: number;
  retry_interval_seconds: number;
  description: string;
  is_active: number;
  backoff_strategy: string;
  min_backoff_seconds: number;
  max_backoff_seconds: number;
  created_by: string;
  created_at: string;
  row_version: number;
}

export interface Device {
  id: number;
  fingerprint: string;
  user_agent: string;
  screen_width: number;
  screen_height: number;
  hardware_concurrency: number;
  last_seen: string;
  status: string;
  technician_id: number;
  os_version: string;
  battery_level: number;
  storage_available_mb: number;
  row_version: number;
}

export interface Permission {
  id: number;
  technician_id: number;
  site_id: number;
  can_read: number;
  can_write: number;
  can_erase: number;
  is_active: number;
  granted_by: string;
  granted_at: string;
  expires_at: string;
  notes: string;
  row_version: number;
}

export interface Audit_log {
  id: number;
  entity_type: string;
  entity_id: number;
  action: string;
  performed_by: string;
  performed_at: string;
  metadata: string;
  ip_address: string;
  user_agent: string;
  changes: string;
  session_id: string;
  row_version: number;
}

export interface Region {
  id: number;
  name: string;
  description: string;
  is_active: number;
  manager_id: number;
  latitude: number;
  longitude: number;
  geofence_radius_meters: number;
  timezone: string;
  operational_hours: string;
  row_version: number;
}

export interface Maintenance_schedule {
  id: number;
  site_id: number;
  scheduled_date: string;
  description: string;
  status: string;
  technician_id: number;
  completed_at: string;
  priority: string;
  estimated_duration_hours: number;
  actual_duration_hours: number;
  notes: string;
  row_version: number;
}

export interface Photo_blob {
  id: number;
  blob_id: string;
  reading_id: number;
  uploaded_at: string;
  size_bytes: number;
  mime_type: string;
  storage_path: string;
  checksum: string;
  is_encrypted: number;
  encryption_key_id: number;
  thumbnail_blob_id: string;
  row_version: number;
}

export interface Sync_session {
  id: number;
  started_at: string;
  ended_at: string;
  status: string;
  readings_count: number;
  bytes_transferred: number;
  technician_id: number;
  device_id: number;
  sync_policy_id: number;
  network_type: string;
  duration_seconds: number;
  row_version: number;
}

export type PendingReadingsResponse = Row[] | ApiError;
export type PendingReadingsHandler = Handler<PendingReadingsResponse>;
export type SyncStatusSummaryResponse = Row[] | ApiError;
export type SyncStatusSummaryHandler = Handler<SyncStatusSummaryResponse>;
export type DetectAnomaliesResponse = Row[] | ApiError;
export type DetectAnomaliesHandler = Handler<DetectAnomaliesResponse>;
export type GridStatisticsResponse = Row[] | ApiError;
export type GridStatisticsHandler = Handler<GridStatisticsResponse>;
export type SiteAggregatesResponse = Row[] | ApiError;
export type SiteAggregatesHandler = Handler<SiteAggregatesResponse>;
export type TechnicianPerformanceResponse = Row[] | ApiError;
export type TechnicianPerformanceHandler = Handler<TechnicianPerformanceResponse>;
export type FailedSyncsResponse = Row[] | ApiError;
export type FailedSyncsHandler = Handler<FailedSyncsResponse>;
export type ErasureCandidatesResponse = Row[] | ApiError;
export type ErasureCandidatesHandler = Handler<ErasureCandidatesResponse>;
export type ReadingAgeDistributionResponse = Row[] | ApiError;
export type ReadingAgeDistributionHandler = Handler<ReadingAgeDistributionResponse>;
export type ReadingTypeDistributionResponse = Row[] | ApiError;
export type ReadingTypeDistributionHandler = Handler<ReadingTypeDistributionResponse>;
export type SiteAnomalyRateResponse = Row[] | ApiError;
export type SiteAnomalyRateHandler = Handler<SiteAnomalyRateResponse>;
export type TechnicianAnomalyRateResponse = Row[] | ApiError;
export type TechnicianAnomalyRateHandler = Handler<TechnicianAnomalyRateResponse>;
export type ReadingValueTrendResponse = Row[] | ApiError;
export type ReadingValueTrendHandler = Handler<ReadingValueTrendResponse>;
export type ComplianceReportResponse = Row[] | ApiError;
export type ComplianceReportHandler = Handler<ComplianceReportResponse>;
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
export type ListErasure_policysResponse = Erasure_policy[] | ApiError;
export type ListErasure_policysHandler = Handler<ListErasure_policysResponse>;
export type ListErasure_policysStatsResponse = Bucket[] | ApiError;
export type ListErasure_policysStatsHandler = Handler<ListErasure_policysStatsResponse>;
export type GetErasure_policyResponse = Erasure_policy | ApiError;
export type GetErasure_policyHandler = Handler<GetErasure_policyResponse>;
export type CreateErasure_policyResponse = Erasure_policy | ApiError;
export type CreateErasure_policyHandler = Handler<CreateErasure_policyResponse>;
export type CreateErasure_policyBulkResponse = BulkResult | ApiError;
export type CreateErasure_policyBulkHandler = Handler<CreateErasure_policyBulkResponse>;
export type UpdateErasure_policyResponse = Erasure_policy | ApiError;
export type UpdateErasure_policyHandler = Handler<UpdateErasure_policyResponse>;
export type DeleteErasure_policyResponse = { ok: boolean } | ApiError;
export type DeleteErasure_policyHandler = Handler<DeleteErasure_policyResponse>;
export type ListAnomalysResponse = Anomaly[] | ApiError;
export type ListAnomalysHandler = Handler<ListAnomalysResponse>;
export type ListAnomalysStatsResponse = Bucket[] | ApiError;
export type ListAnomalysStatsHandler = Handler<ListAnomalysStatsResponse>;
export type GetAnomalyResponse = Anomaly | ApiError;
export type GetAnomalyHandler = Handler<GetAnomalyResponse>;
export type CreateAnomalyResponse = Anomaly | ApiError;
export type CreateAnomalyHandler = Handler<CreateAnomalyResponse>;
export type CreateAnomalyBulkResponse = BulkResult | ApiError;
export type CreateAnomalyBulkHandler = Handler<CreateAnomalyBulkResponse>;
export type UpdateAnomalyResponse = Anomaly | ApiError;
export type UpdateAnomalyHandler = Handler<UpdateAnomalyResponse>;
export type DeleteAnomalyResponse = { ok: boolean } | ApiError;
export type DeleteAnomalyHandler = Handler<DeleteAnomalyResponse>;
export type ListGrid_cellsResponse = Grid_cell[] | ApiError;
export type ListGrid_cellsHandler = Handler<ListGrid_cellsResponse>;
export type ListGrid_cellsStatsResponse = Bucket[] | ApiError;
export type ListGrid_cellsStatsHandler = Handler<ListGrid_cellsStatsResponse>;
export type GetGrid_cellResponse = Grid_cell | ApiError;
export type GetGrid_cellHandler = Handler<GetGrid_cellResponse>;
export type CreateGrid_cellResponse = Grid_cell | ApiError;
export type CreateGrid_cellHandler = Handler<CreateGrid_cellResponse>;
export type CreateGrid_cellBulkResponse = BulkResult | ApiError;
export type CreateGrid_cellBulkHandler = Handler<CreateGrid_cellBulkResponse>;
export type UpdateGrid_cellResponse = Grid_cell | ApiError;
export type UpdateGrid_cellHandler = Handler<UpdateGrid_cellResponse>;
export type DeleteGrid_cellResponse = { ok: boolean } | ApiError;
export type DeleteGrid_cellHandler = Handler<DeleteGrid_cellResponse>;
export type ListTechniciansResponse = Technician[] | ApiError;
export type ListTechniciansHandler = Handler<ListTechniciansResponse>;
export type ListTechniciansStatsResponse = Bucket[] | ApiError;
export type ListTechniciansStatsHandler = Handler<ListTechniciansStatsResponse>;
export type GetTechnicianResponse = Technician | ApiError;
export type GetTechnicianHandler = Handler<GetTechnicianResponse>;
export type CreateTechnicianResponse = Technician | ApiError;
export type CreateTechnicianHandler = Handler<CreateTechnicianResponse>;
export type CreateTechnicianBulkResponse = BulkResult | ApiError;
export type CreateTechnicianBulkHandler = Handler<CreateTechnicianBulkResponse>;
export type UpdateTechnicianResponse = Technician | ApiError;
export type UpdateTechnicianHandler = Handler<UpdateTechnicianResponse>;
export type DeleteTechnicianResponse = { ok: boolean } | ApiError;
export type DeleteTechnicianHandler = Handler<DeleteTechnicianResponse>;
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
export type ListReading_typesResponse = Reading_type[] | ApiError;
export type ListReading_typesHandler = Handler<ListReading_typesResponse>;
export type ListReading_typesStatsResponse = Bucket[] | ApiError;
export type ListReading_typesStatsHandler = Handler<ListReading_typesStatsResponse>;
export type GetReading_typeResponse = Reading_type | ApiError;
export type GetReading_typeHandler = Handler<GetReading_typeResponse>;
export type CreateReading_typeResponse = Reading_type | ApiError;
export type CreateReading_typeHandler = Handler<CreateReading_typeResponse>;
export type CreateReading_typeBulkResponse = BulkResult | ApiError;
export type CreateReading_typeBulkHandler = Handler<CreateReading_typeBulkResponse>;
export type UpdateReading_typeResponse = Reading_type | ApiError;
export type UpdateReading_typeHandler = Handler<UpdateReading_typeResponse>;
export type DeleteReading_typeResponse = { ok: boolean } | ApiError;
export type DeleteReading_typeHandler = Handler<DeleteReading_typeResponse>;
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
export type ListPermissionsResponse = Permission[] | ApiError;
export type ListPermissionsHandler = Handler<ListPermissionsResponse>;
export type ListPermissionsStatsResponse = Bucket[] | ApiError;
export type ListPermissionsStatsHandler = Handler<ListPermissionsStatsResponse>;
export type GetPermissionResponse = Permission | ApiError;
export type GetPermissionHandler = Handler<GetPermissionResponse>;
export type CreatePermissionResponse = Permission | ApiError;
export type CreatePermissionHandler = Handler<CreatePermissionResponse>;
export type CreatePermissionBulkResponse = BulkResult | ApiError;
export type CreatePermissionBulkHandler = Handler<CreatePermissionBulkResponse>;
export type UpdatePermissionResponse = Permission | ApiError;
export type UpdatePermissionHandler = Handler<UpdatePermissionResponse>;
export type DeletePermissionResponse = { ok: boolean } | ApiError;
export type DeletePermissionHandler = Handler<DeletePermissionResponse>;
export type ListAudit_logsResponse = Audit_log[] | ApiError;
export type ListAudit_logsHandler = Handler<ListAudit_logsResponse>;
export type ListAudit_logsStatsResponse = Bucket[] | ApiError;
export type ListAudit_logsStatsHandler = Handler<ListAudit_logsStatsResponse>;
export type GetAudit_logResponse = Audit_log | ApiError;
export type GetAudit_logHandler = Handler<GetAudit_logResponse>;
export type CreateAudit_logResponse = Audit_log | ApiError;
export type CreateAudit_logHandler = Handler<CreateAudit_logResponse>;
export type CreateAudit_logBulkResponse = BulkResult | ApiError;
export type CreateAudit_logBulkHandler = Handler<CreateAudit_logBulkResponse>;
export type UpdateAudit_logResponse = Audit_log | ApiError;
export type UpdateAudit_logHandler = Handler<UpdateAudit_logResponse>;
export type ListRegionsResponse = Region[] | ApiError;
export type ListRegionsHandler = Handler<ListRegionsResponse>;
export type ListRegionsStatsResponse = Bucket[] | ApiError;
export type ListRegionsStatsHandler = Handler<ListRegionsStatsResponse>;
export type GetRegionResponse = Region | ApiError;
export type GetRegionHandler = Handler<GetRegionResponse>;
export type CreateRegionResponse = Region | ApiError;
export type CreateRegionHandler = Handler<CreateRegionResponse>;
export type CreateRegionBulkResponse = BulkResult | ApiError;
export type CreateRegionBulkHandler = Handler<CreateRegionBulkResponse>;
export type UpdateRegionResponse = Region | ApiError;
export type UpdateRegionHandler = Handler<UpdateRegionResponse>;
export type DeleteRegionResponse = { ok: boolean } | ApiError;
export type DeleteRegionHandler = Handler<DeleteRegionResponse>;
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
export type ListPhoto_blobsResponse = Photo_blob[] | ApiError;
export type ListPhoto_blobsHandler = Handler<ListPhoto_blobsResponse>;
export type ListPhoto_blobsStatsResponse = Bucket[] | ApiError;
export type ListPhoto_blobsStatsHandler = Handler<ListPhoto_blobsStatsResponse>;
export type GetPhoto_blobResponse = Photo_blob | ApiError;
export type GetPhoto_blobHandler = Handler<GetPhoto_blobResponse>;
export type CreatePhoto_blobResponse = Photo_blob | ApiError;
export type CreatePhoto_blobHandler = Handler<CreatePhoto_blobResponse>;
export type CreatePhoto_blobBulkResponse = BulkResult | ApiError;
export type CreatePhoto_blobBulkHandler = Handler<CreatePhoto_blobBulkResponse>;
export type UpdatePhoto_blobResponse = Photo_blob | ApiError;
export type UpdatePhoto_blobHandler = Handler<UpdatePhoto_blobResponse>;
export type DeletePhoto_blobResponse = { ok: boolean } | ApiError;
export type DeletePhoto_blobHandler = Handler<DeletePhoto_blobResponse>;
export type ListSync_sessionsResponse = Sync_session[] | ApiError;
export type ListSync_sessionsHandler = Handler<ListSync_sessionsResponse>;
export type ListSync_sessionsStatsResponse = Bucket[] | ApiError;
export type ListSync_sessionsStatsHandler = Handler<ListSync_sessionsStatsResponse>;
export type GetSync_sessionResponse = Sync_session | ApiError;
export type GetSync_sessionHandler = Handler<GetSync_sessionResponse>;
export type CreateSync_sessionResponse = Sync_session | ApiError;
export type CreateSync_sessionHandler = Handler<CreateSync_sessionResponse>;
export type CreateSync_sessionBulkResponse = BulkResult | ApiError;
export type CreateSync_sessionBulkHandler = Handler<CreateSync_sessionBulkResponse>;
export type UpdateSync_sessionResponse = Sync_session | ApiError;
export type UpdateSync_sessionHandler = Handler<UpdateSync_sessionResponse>;
export type DeleteSync_sessionResponse = { ok: boolean } | ApiError;
export type DeleteSync_sessionHandler = Handler<DeleteSync_sessionResponse>;
