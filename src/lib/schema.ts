import { z } from "zod";

// ---- Domain primitives --------------------------------------------------------

export const TenantId = z.string().uuid();
export const Uuid = z.string().uuid();
export const IsoTimestamp = z.string().datetime();
export const PhoneE164 = z.string().regex(/^\+[1-9]\d{1,14}$/);
export const Email = z.string().email();

// ---- Enums --------------------------------------------------------------------

export const PlanTier = z.enum(["free", "pro", "firm"]);
export const UserRole = z.enum(["owner", "office_manager", "staff", "vendor_contact", "auditor"]);
export const OnboardingState = z.enum(["invited", "active", "shadow", "graduated"]);
export const AuthMethod = z.enum(["magic_link", "sms_code", "oauth_calendar", "webauthn"]);
export const CalendarProvider = z.enum(["google", "microsoft"]);
export const SyncStatus = z.enum(["ok", "partial", "failed"]);
export const ServiceType = z.enum(["cleaning", "hvac", "courier", "security", "it", "plants", "other"]);
export const ScoreBand = z.enum(["ok", "warning", "critical"]);
export const SignerRole = z.enum(["office", "counterparty", "auditor", "system"]);
export const NotificationChannel = z.enum(["push", "email", "sms"]);
export const OverrideType = z.enum([
  "start_early",
  "start_late",
  "mark_missed",
  "mark_completed",
  "force_sign",
  "correct_record",
  "suppress_alert",
]);
export const LedgerEntryType = z.enum([
  "visit_created",
  "visit_started",
  "visit_completed",
  "receipt_sealed",
  "override",
  "score_update",
  "correction",
  "anomaly_flag",
]);
export const TokenChannel = z.enum(["sms", "email"]);
export const NotificationStatus = z.enum(["queued", "sent", "delivered", "failed", "bounced"]);

// ---- Visit status machine -----------------------------------------------------

export const VisitStatus = z.enum([
  "scheduled",
  "due",
  "in_progress",
  "completed",
  "missed",
  "disputed",
  "archived",
]);

export const ReceiptStatus = z.enum([
  "drafted",
  "awaiting_office",
  "awaiting_counterparty",
  "sealed",
  "expired",
  "revoked",
]);

// ---- Database row schemas -----------------------------------------------------

export const TenantRow = z.object({
  tenant_id: Uuid,
  slug: z.string().min(1).max(64),
  display_name: z.string().min(1).max(256),
  plan_tier: PlanTier,
  jurisdiction: z.string().regex(/^[A-Z]{2}-[A-Z0-9]{2,3}$/),
  retention_policy_id: Uuid.nullable(),
  created_at: IsoTimestamp,
  suspended_at: IsoTimestamp.nullable(),
  ledger_head_hash: z.string().min(64).max(64),
});

export const UserRow = z.object({
  user_id: Uuid,
  tenant_id: Uuid,
  email: z.string().email(),
  phone_e164: PhoneE164.nullable(),
  display_name: z.string().min(1).max(256),
  role: UserRole,
  trust_score: z.number().min(0).max(100),
  onboarding_state: OnboardingState,
  created_at: IsoTimestamp,
  last_seen_at: IsoTimestamp.nullable(),
  disabled_at: IsoTimestamp.nullable(),
});

export const SessionRow = z.object({
  session_id: Uuid,
  user_id: Uuid,
  tenant_id: Uuid,
  issued_at: IsoTimestamp,
  expires_at: IsoTimestamp,
  ip_hash: z.string().min(64).max(64),
  user_agent_hash: z.string().min(64).max(64),
  auth_method: AuthMethod,
  revoked_at: IsoTimestamp.nullable(),
});

export const CalendarConnectionRow = z.object({
  connection_id: Uuid,
  tenant_id: Uuid,
  user_id: Uuid,
  provider: CalendarProvider,
  oauth_refresh_token_encrypted: z.string(),
  calendar_ids: z.string(), // JSON array
  sync_cursor: z.string(),
  last_sync_at: IsoTimestamp.nullable(),
  last_sync_status: SyncStatus.nullable(),
  error_count_24h: z.number().int().min(0),
});

export const CalendarEventRow = z.object({
  calendar_event_id: Uuid,
  tenant_id: Uuid,
  connection_id: Uuid,
  provider_event_id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  starts_at: IsoTimestamp,
  ends_at: IsoTimestamp,
  is_all_day: z.number().int(),
  recurrence_rule: z.string().nullable(), // RFC 5545
  organizer_email: Email.nullable(),
  is_cancelled: z.number().int(),
  last_seen_at: IsoTimestamp,
});

export const VendorRow = z.object({
  vendor_id: Uuid,
  tenant_id: Uuid,
  display_name: z.string().min(1).max(256),
  service_type: ServiceType,
  contact_email: Email.nullable(),
  contact_phone: PhoneE164.nullable(),
  sla_window_minutes: z.number().int().min(0),
  shadow_mode: z.number().int(),
  shadow_mode_visit_limit: z.number().int().nullable(),
  score: z.number().min(0).max(100),
  score_band: ScoreBand,
  created_at: IsoTimestamp,
  archived_at: IsoTimestamp.nullable(),
});

export const VendorContactRow = z.object({
  vendor_contact_id: Uuid,
  tenant_id: Uuid,
  vendor_id: Uuid,
  display_name: z.string().min(1).max(256),
  phone_e164: PhoneE164.nullable(),
  email: Email.nullable(),
  magic_link_enabled: z.number().int(),
  default_recipient: z.number().int(),
  created_at: IsoTimestamp,
});

export const StaffMemberRow = z.object({
  staff_member_id: Uuid,
  tenant_id: Uuid,
  user_id: Uuid.nullable(),
  display_name: z.string().min(1).max(256),
  role: z.enum(["in_house", "trainee", "contractor"]),
  trust_score: z.number().min(0).max(100),
  shadow_mode_visit_limit: z.number().int().nullable(),
  created_at: IsoTimestamp,
  terminated_at: IsoTimestamp.nullable(),
});

export const VisitTemplateRow = z.object({
  template_id: Uuid,
  tenant_id: Uuid,
  vendor_id: Uuid,
  calendar_event_id: Uuid.nullable(),
  scheduled_start_offset_minutes: z.number().int(),
  sla_window_minutes: z.number().int().min(0),
  default_duration_minutes: z.number().int().min(1),
  requires_counterparty_signature: z.number().int(),
  requires_photo: z.number().int(),
  created_at: IsoTimestamp,
});

export const VisitInstanceRow = z.object({
  instance_id: Uuid,
  tenant_id: Uuid,
  template_id: Uuid,
  vendor_id: Uuid,
  staff_member_id: Uuid.nullable(),
  scheduled_start_at: IsoTimestamp,
  scheduled_end_at: IsoTimestamp,
  status: VisitStatus,
  actual_start_at: IsoTimestamp.nullable(),
  actual_end_at: IsoTimestamp.nullable(),
  drift_seconds: z.number().int().nullable(),
  signing_window_closes_at: IsoTimestamp.nullable(),
  late_tap_reason: z.string().nullable(),
  created_at: IsoTimestamp,
});

export const VisitReceiptRow = z.object({
  receipt_id: Uuid,
  tenant_id: Uuid,
  instance_id: Uuid,
  office_signature_id: Uuid.nullable(),
  counterparty_signature_id: Uuid.nullable(),
  office_signed_at: IsoTimestamp.nullable(),
  counterparty_signed_at: IsoTimestamp.nullable(),
  sealed_at: IsoTimestamp.nullable(),
  office_note: z.string().nullable(),
  counterparty_note: z.string().nullable(),
  photo_object_key: z.string().nullable(),
  status: ReceiptStatus,
});

export const SignatureRow = z.object({
  signature_id: Uuid,
  tenant_id: Uuid,
  signer_user_id: Uuid.nullable(),
  signer_role: SignerRole,
  signer_phone_e164: PhoneE164.nullable(),
  canonical_payload_hash: z.string().min(64).max(64),
  hmac_signature: z.string(),
  signing_key_fingerprint: z.string(),
  signed_at: IsoTimestamp,
  ip_hash: z.string().min(64).max(64),
  user_agent_hash: z.string().min(64).max(64),
  counterparty_token_id: Uuid.nullable(),
});

export const ManualOverrideRow = z.object({
  override_id: Uuid,
  tenant_id: Uuid,
  instance_id: Uuid.nullable(),
  actor_user_id: Uuid,
  override_type: OverrideType,
  reason: z.string().min(10),
  payload_before_hash: z.string().min(64).max(64),
  payload_after_hash: z.string().min(64).max(64),
  signature_id: Uuid,
  created_at: IsoTimestamp,
  approved_by_user_id: Uuid.nullable(),
  approved_at: IsoTimestamp.nullable(),
});

export const LedgerEntryRow = z.object({
  entry_id: z.number().int().positive(),
  tenant_id: Uuid,
  entry_type: LedgerEntryType,
  entity_type: z.string(),
  entity_id: Uuid,
  payload_canonical_json: z.string(),
  payload_hash: z.string().min(64).max(64),
  prev_hash: z.string().min(64).max(64).nullable(),
  entry_hash: z.string().min(64).max(64),
  actor_user_id: Uuid.nullable(),
  actor_role: z.string(),
  created_at: IsoTimestamp,
  signature_id: Uuid.nullable(),
});

export const VendorScoreRow = z.object({
  score_id: Uuid,
  tenant_id: Uuid,
  vendor_id: Uuid,
  window_days: z.enum(["30", "90", "365"]),
  on_time_starts: z.number().int(),
  late_starts: z.number().int(),
  missed_visits: z.number().int(),
  disputed_visits: z.number().int(),
  score_value: z.number(),
  score_band: ScoreBand,
  computed_at: IsoTimestamp,
  previous_score_id: Uuid.nullable(),
});

export const StaffScoreRow = z.object({
  score_id: Uuid,
  tenant_id: Uuid,
  user_id: Uuid,
  window_days: z.enum(["30", "90", "365"]),
  actions_total: z.number().int(),
  actions_reverted: z.number().int(),
  overrides_approved: z.number().int(),
  overrides_against: z.number().int(),
  score_value: z.number(),
  computed_at: IsoTimestamp,
  previous_score_id: Uuid.nullable(),
});

export const CounterpartyTokenRow = z.object({
  token_id: Uuid,
  tenant_id: Uuid,
  instance_id: Uuid,
  vendor_contact_id: Uuid,
  token_hash: z.string().min(64).max(64),
  channel: TokenChannel,
  issued_at: IsoTimestamp,
  expires_at: IsoTimestamp,
  consumed_at: IsoTimestamp.nullable(),
  ip_hash_at_consume: z.string().min(64).max(64).nullable(),
});

export const NotificationRow = z.object({
  notification_id: Uuid,
  tenant_id: Uuid,
  recipient_user_id: Uuid.nullable(),
  recipient_phone_e164: PhoneE164.nullable(),
  channel: NotificationChannel,
  template: z.string(),
  instance_id: Uuid.nullable(),
  scheduled_for: IsoTimestamp,
  sent_at: IsoTimestamp.nullable(),
  delivery_status: NotificationStatus,
  failure_reason: z.string().nullable(),
});

export const DisputeSnapshotRow = z.object({
  snapshot_id: Uuid,
  tenant_id: Uuid,
  requested_by_user_id: Uuid,
  requested_at: IsoTimestamp,
  as_of_timestamp: IsoTimestamp,
  ledger_head_hash_at_as_of: z.string().min(64).max(64),
  instance_id: Uuid.nullable(),
  pdf_object_key: z.string(),
  json_object_key: z.string(),
  verification_token: z.string(),
  expires_at: IsoTimestamp,
  revoked_at: IsoTimestamp.nullable(),
});

export const RetentionPolicyRow = z.object({
  policy_id: Uuid,
  tenant_id: Uuid,
  jurisdiction: z.string().regex(/^[A-Z]{2}-[A-Z0-9]{2,3}$/),
  min_retention_days: z.number().int().min(0),
  min_retention_days_receipts: z.number().int().min(0),
  legal_hold: z.number().int(),
  redact_pii_after_days: z.number().int().nullable(),
  policy_source: z.enum(["template", "custom"]),
  created_at: IsoTimestamp,
  updated_at: IsoTimestamp,
});

// ---- API request schemas ------------------------------------------------------

export const CreateTenantBody = z.object({
  slug: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/),
  display_name: z.string().min(1).max(256),
  jurisdiction: z.string().regex(/^[A-Z]{2}-[A-Z0-9]{2,3}$/),
});

export const ConnectCalendarBody = z.object({
  provider: CalendarProvider,
  code: z.string().min(1),
  calendar_ids: z.array(z.string()).min(1),
});

export const StartVisitBody = z.object({
  instance_id: Uuid,
  actual_start_at: IsoTimestamp.optional(),
  late_reason: z.string().min(10).optional(),
});

export const SignReceiptBody = z.object({
  receipt_id: Uuid,
  note: z.string().max(500).optional(),
  role: z.enum(["office", "counterparty"]),
});

export const CreateOverrideBody = z.object({
  instance_id: Uuid.optional(),
  override_type: OverrideType,
  reason: z.string().min(10),
  payload_before: z.record(z.unknown()),
  payload_after: z.record(z.unknown()),
});

export const ApproveOverrideBody = z.object({
  override_id: Uuid,
});

export const CreateSnapshotBody = z.object({
  instance_id: Uuid.optional(),
  as_of_timestamp: IsoTimestamp.optional(),
});

export const VerifySnapshotParams = z.object({
  token: z.string().min(1),
});

// ---- API response schemas -----------------------------------------------------

export const VisitInstanceResponse = z.object({
  instance_id: Uuid,
  vendor_id: Uuid,
  vendor_name: z.string(),
  scheduled_start_at: IsoTimestamp,
  scheduled_end_at: IsoTimestamp,
  status: VisitStatus,
  actual_start_at: IsoTimestamp.nullable(),
  actual_end_at: IsoTimestamp.nullable(),
  drift_seconds: z.number().int().nullable(),
  drift_minutes: z.number().nullable(),
  signing_window_closes_at: IsoTimestamp.nullable(),
});

export const NowBoardResponse = z.object({
  tenant_id: Uuid,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  now_line_offset_px: z.number().int(),
  slots: z.array(VisitInstanceResponse),
});

export const ReceiptResponse = z.object({
  receipt_id: Uuid,
  instance_id: Uuid,
  status: ReceiptStatus,
  office_signed_at: IsoTimestamp.nullable(),
  counterparty_signed_at: IsoTimestamp.nullable(),
  sealed_at: IsoTimestamp.nullable(),
  office_note: z.string().nullable(),
  counterparty_note: z.string().nullable(),
  photo_url: z.string().nullable(),
});

export const SignatureResponse = z.object({
  signature_id: Uuid,
  signer_role: SignerRole,
  signed_at: IsoTimestamp,
  key_fingerprint: z.string(),
});

export const SnapshotResponse = z.object({
  snapshot_id: Uuid,
  requested_at: IsoTimestamp,
  as_of_timestamp: IsoTimestamp,
  ledger_head_hash: z.string(),
  pdf_url: z.string(),
  json_url: z.string(),
  verification_url: z.string(),
});

export const VerifySnapshotResponse = z.object({
  valid: z.boolean(),
  as_of_timestamp: IsoTimestamp,
  ledger_head_hash: z.string(),
  merkle_root_verified: z.boolean(),
  key_fingerprint: z.string(),
  instance: z.record(z.unknown()).nullable(),
});

export const VendorScoreResponse = z.object({
  vendor_id: Uuid,
  vendor_name: z.string(),
  window_days: z.enum(["30", "90", "365"]),
  score_value: z.number(),
  score_band: ScoreBand,
  on_time_starts: z.number().int(),
  late_starts: z.number().int(),
  missed_visits: z.number().int(),
  disputed_visits: z.number().int(),
  computed_at: IsoTimestamp,
});

export const AnomalyFlagResponse = z.object({
  flag_id: Uuid,
  entry_type: z.literal("anomaly_flag"),
  actor_user_id: Uuid,
  actor_email: z.string(),
  anomaly_type: z.enum(["override_frequency", "drift_distribution", "signing_latency"]),
  description: z.string(),
  created_at: IsoTimestamp,
});

// ---- Query parameter schemas --------------------------------------------------

export const DateQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const ListVisitsQuery = z.object({
  from: IsoTimestamp.optional(),
  to: IsoTimestamp.optional(),
  status: VisitStatus.optional(),
  vendor_id: Uuid.optional(),
});

export const ListScoresQuery = z.object({
  vendor_id: Uuid.optional(),
  window_days: z.enum(["30", "90", "365"]).optional(),
});

// ---- Utility validators -------------------------------------------------------

/** Validates a string is a valid UUID v4 */
export function isValidUuid(input: string): boolean {
  return Uuid.safeParse(input).success;
}

/** Validates ISO 8601 timestamp */
export function isValidIsoTimestamp(input: string): boolean {
  return IsoTimestamp.safeParse(input).success;
}

/** Sanitizes user input for safe display */
export function sanitizeDisplay(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

// Export types for use in handlers
export type TenantId = z.infer<typeof TenantId>;
export type Uuid = z.infer<typeof Uuid>;
export type IsoTimestamp = z.infer<typeof IsoTimestamp>;
export type PhoneE164 = z.infer<typeof PhoneE164>;
export type Email = z.infer<typeof Email>;
export type PlanTier = z.infer<typeof PlanTier>;
export type UserRole = z.infer<typeof UserRole>;
export type VisitStatus = z.infer<typeof VisitStatus>;
export type ReceiptStatus = z.infer<typeof ReceiptStatus>;
export type OverrideType = z.infer<typeof OverrideType>;
export type LedgerEntryType = z.infer<typeof LedgerEntryType>;
export type ScoreBand = z.infer<typeof ScoreBand>;
export type SignerRole = z.infer<typeof SignerRole>;
export type NotificationChannel = z.infer<typeof NotificationChannel>;
export type TokenChannel = z.infer<typeof TokenChannel>;
export type NotificationStatus = z.infer<typeof NotificationStatus>;
export type ServiceType = z.infer<typeof ServiceType>;
export type CalendarProvider = z.infer<typeof CalendarProvider>;
export type SyncStatus = z.infer<typeof SyncStatus>;
export type OnboardingState = z.infer<typeof OnboardingState>;
export type AuthMethod = z.infer<typeof AuthMethod>;

export type TenantRow = z.infer<typeof TenantRow>;
export type UserRow = z.infer<typeof UserRow>;
export type SessionRow = z.infer<typeof SessionRow>;
export type CalendarConnectionRow = z.infer<typeof CalendarConnectionRow>;
export type CalendarEventRow = z.infer<typeof CalendarEventRow>;
export type VendorRow = z.infer<typeof VendorRow>;
export type VendorContactRow = z.infer<typeof VendorContactRow>;
export type StaffMemberRow = z.infer<typeof StaffMemberRow>;
export type VisitTemplateRow = z.infer<typeof VisitTemplateRow>;
export type VisitInstanceRow = z.infer<typeof VisitInstanceRow>;
export type VisitReceiptRow = z.infer<typeof VisitReceiptRow>;
export type SignatureRow = z.infer<typeof SignatureRow>;
export type ManualOverrideRow = z.infer<typeof ManualOverrideRow>;
export type LedgerEntryRow = z.infer<typeof LedgerEntryRow>;
export type VendorScoreRow = z.infer<typeof VendorScoreRow>;
export type StaffScoreRow = z.infer<typeof StaffScoreRow>;
export type CounterpartyTokenRow = z.infer<typeof CounterpartyTokenRow>;
export type NotificationRow = z.infer<typeof NotificationRow>;
export type DisputeSnapshotRow = z.infer<typeof DisputeSnapshotRow>;
export type RetentionPolicyRow = z.infer<typeof RetentionPolicyRow>;

export type CreateTenantBody = z.infer<typeof CreateTenantBody>;
export type ConnectCalendarBody = z.infer<typeof ConnectCalendarBody>;
export type StartVisitBody = z.infer<typeof StartVisitBody>;
export type SignReceiptBody = z.infer<typeof SignReceiptBody>;
export type CreateOverrideBody = z.infer<typeof CreateOverrideBody>;
export type ApproveOverrideBody = z.infer<typeof ApproveOverrideBody>;
export type CreateSnapshotBody = z.infer<typeof CreateSnapshotBody>;
export type VerifySnapshotParams = z.infer<typeof VerifySnapshotParams>;

export type VisitInstanceResponse = z.infer<typeof VisitInstanceResponse>;
export type NowBoardResponse = z.infer<typeof NowBoardResponse>;
export type ReceiptResponse = z.infer<typeof ReceiptResponse>;
export type SignatureResponse = z.infer<typeof SignatureResponse>;
export type SnapshotResponse = z.infer<typeof SnapshotResponse>;
export type VerifySnapshotResponse = z.infer<typeof VerifySnapshotResponse>;
export type VendorScoreResponse = z.infer<typeof VendorScoreResponse>;
export type AnomalyFlagResponse = z.infer<typeof AnomalyFlagResponse>;

export type DateQuery = z.infer<typeof DateQuery>;
export type ListVisitsQuery = z.infer<typeof ListVisitsQuery>;
export type ListScoresQuery = z.infer<typeof ListScoresQuery>;

export type { LedgerEntry } from "./ledger.ts";