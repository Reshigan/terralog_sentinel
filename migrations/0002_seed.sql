-- GENERATED seed for Desklog demo tenant 'acme-firm'.
-- Demonstrates the "now" board with scheduled, in-progress, completed, and missed visits.

-- Clear existing seed data first (idempotent for re-runs).
DELETE FROM visit_receipts WHERE tenant_id = (SELECT tenant_id FROM tenants WHERE slug = 'acme-firm');
DELETE FROM signatures WHERE tenant_id = (SELECT tenant_id FROM tenants WHERE slug = 'acme-firm');
DELETE FROM ledger_entries WHERE tenant_id = (SELECT tenant_id FROM tenants WHERE slug = 'acme-firm');
DELETE FROM visit_instances WHERE tenant_id = (SELECT tenant_id FROM tenants WHERE slug = 'acme-firm');
DELETE FROM visit_templates WHERE tenant_id = (SELECT tenant_id FROM tenants WHERE slug = 'acme-firm');
DELETE FROM staff_members WHERE tenant_id = (SELECT tenant_id FROM tenants WHERE slug = 'acme-firm');
DELETE FROM vendor_contacts WHERE tenant_id = (SELECT tenant_id FROM tenants WHERE slug = 'acme-firm');
DELETE FROM vendors WHERE tenant_id = (SELECT tenant_id FROM tenants WHERE slug = 'acme-firm');
DELETE FROM calendar_events WHERE tenant_id = (SELECT tenant_id FROM tenants WHERE slug = 'acme-firm');
DELETE FROM calendar_connections WHERE tenant_id = (SELECT tenant_id FROM tenants WHERE slug = 'acme-firm');
DELETE FROM sessions WHERE tenant_id = (SELECT tenant_id FROM tenants WHERE slug = 'acme-firm');
DELETE FROM users WHERE tenant_id = (SELECT tenant_id FROM tenants WHERE slug = 'acme-firm');
DELETE FROM counterparty_tokens WHERE tenant_id = (SELECT tenant_id FROM tenants WHERE slug = 'acme-firm');
DELETE FROM notifications WHERE tenant_id = (SELECT tenant_id FROM tenants WHERE slug = 'acme-firm');
DELETE FROM dispute_snapshots WHERE tenant_id = (SELECT tenant_id FROM tenants WHERE slug = 'acme-firm');
DELETE FROM vendor_scores WHERE tenant_id = (SELECT tenant_id FROM tenants WHERE slug = 'acme-firm');
DELETE FROM staff_scores WHERE tenant_id = (SELECT tenant_id FROM tenants WHERE slug = 'acme-firm');
DELETE FROM manual_overrides WHERE tenant_id = (SELECT tenant_id FROM tenants WHERE slug = 'acme-firm');
DELETE FROM retention_policies WHERE tenant_id = (SELECT tenant_id FROM tenants WHERE slug = 'acme-firm');
DELETE FROM tenants WHERE slug = 'acme-firm';

-- Demo retention policy (California: 7 years minimum)
INSERT INTO retention_policies (policy_id, jurisdiction, min_retention_days, min_retention_days_receipts, legal_hold, redact_pii_after_days, policy_source, created_at, updated_at)
VALUES ('rp-acme-001', 'US-CA', 2555, 2555, 0, 365, 'template', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

-- Demo tenant
INSERT INTO tenants (tenant_id, slug, display_name, plan_tier, jurisdiction, retention_policy_id, created_at, ledger_head_hash)
VALUES ('tenant-acme-001', 'acme-firm', 'ACME Accounting Firm', 'pro', 'US-CA', 'rp-acme-001', '2026-01-01T00:00:00Z', 'genesis_hash_acme_001');

-- Demo users (Diane, Marco, Priya as office managers; Sandra as owner)
INSERT INTO users (user_id, tenant_id, email, phone_e164, display_name, role, trust_score, onboarding_state, created_at, last_seen_at)
VALUES ('user-diane-001', 'tenant-acme-001', 'diane@acme-firm.example', '+15551234501', 'Diane', 'office_manager', 95.0, 'active', '2026-01-15T00:00:00Z', '2026-03-14T08:00:00Z');

INSERT INTO users (user_id, tenant_id, email, phone_e164, display_name, role, trust_score, onboarding_state, created_at, last_seen_at)
VALUES ('user-marco-001', 'tenant-acme-001', 'marco@acme-firm.example', '+15551234502', 'Marco', 'office_manager', 92.0, 'active', '2026-01-20T00:00:00Z', '2026-03-13T14:00:00Z');

INSERT INTO users (user_id, tenant_id, email, phone_e164, display_name, role, trust_score, onboarding_state, created_at, last_seen_at)
VALUES ('user-priya-001', 'tenant-acme-001', 'priya@acme-firm.example', '+15551234503', 'Priya', 'office_manager', 88.0, 'active', '2026-02-01T00:00:00Z', '2026-03-14T07:45:00Z');

INSERT INTO users (user_id, tenant_id, email, phone_e164, display_name, role, trust_score, onboarding_state, created_at, last_seen_at)
VALUES ('user-sandra-001', 'tenant-acme-001', 'sandra@acme-firm.example', '+15551234500', 'Sandra', 'owner', 100.0, 'active', '2026-01-01T00:00:00Z', '2026-03-10T09:00:00Z');

-- Demo staff member (Jonas as in-house log - field worker, no login account)
INSERT INTO staff_members (staff_member_id, tenant_id, display_name, role, trust_score, shadow_mode_visit_limit, created_at)
VALUES ('staff-jonas-001', 'tenant-acme-001', 'Jonas (CleanPro)', 'contractor', 85.0, NULL, '2026-01-15T00:00:00Z');

-- Demo calendar connection (Google Calendar)
INSERT INTO calendar_connections (connection_id, tenant_id, user_id, provider, calendar_ids, sync_cursor, last_sync_at, last_sync_status, error_count_24h)
VALUES ('conn-acme-001', 'tenant-acme-001', 'user-diane-001', 'google', '["primary","shared-ops@acme-firm.example"]', 'sync_token_abc123', '2026-03-14T07:55:00Z', 'ok', 0);

-- Demo calendar events (March 9-14, 2026 cleaning schedule M/W/F)
-- March 9 (Monday) - missed visit
INSERT INTO calendar_events (calendar_event_id, tenant_id, connection_id, provider_event_id, title, description, starts_at, ends_at, is_all_day, recurrence_rule, organizer_email, is_cancelled, last_seen_at)
VALUES ('cal-20260309-clean', 'tenant-acme-001', 'conn-acme-001', 'google_evt_20260309_001', 'CleanPro Weekly Cleaning', 'Recurring M/W/F office cleaning', '2026-03-09T08:00:00Z', '2026-03-09T09:00:00Z', 0, 'FREQ=WEEKLY;BYDAY=MO,WE,FR', 'diane@acme-firm.example', 0, '2026-03-09T07:55:00Z');

-- March 11 (Wednesday) - completed on time
INSERT INTO calendar_events (calendar_event_id, tenant_id, connection_id, provider_event_id, title, description, starts_at, ends_at, is_all_day, recurrence_rule, organizer_email, is_cancelled, last_seen_at)
VALUES ('cal-20260311-clean', 'tenant-acme-001', 'conn-acme-001', 'google_evt_20260311_001', 'CleanPro Weekly Cleaning', 'Recurring M/W/F office cleaning', '2026-03-11T08:00:00Z', '2026-03-11T09:00:00Z', 0, 'FREQ=WEEKLY;BYDAY=MO,WE,FR', 'diane@acme-firm.example', 0, '2026-03-11T07:55:00Z');

-- March 13 (Friday) - completed on time
INSERT INTO calendar_events (calendar_event_id, tenant_id, connection_id, provider_event_id, title, description, starts_at, ends_at, is_all_day, recurrence_rule, organizer_email, is_cancelled, last_seen_at)
VALUES ('cal-20260313-clean', 'tenant-acme-001', 'conn-acme-001', 'google_evt_20260313_001', 'CleanPro Weekly Cleaning', 'Recurring M/W/F office cleaning', '2026-03-13T08:00:00Z', '2026-03-13T09:00:00Z', 0, 'FREQ=WEEKLY;BYDAY=MO,WE,FR', 'diane@acme-firm.example', 0, '2026-03-13T07:55:00Z');

-- March 14 (Saturday - today in demo) - in progress, started late
INSERT INTO calendar_events (calendar_event_id, tenant_id, connection_id, provider_event_id, title, description, starts_at, ends_at, is_all_day, recurrence_rule, organizer_email, is_cancelled, last_seen_at)
VALUES ('cal-20260314-clean', 'tenant-acme-001', 'conn-acme-001', 'google_evt_20260314_001', 'CleanPro Weekly Cleaning', 'Recurring M/W/F office cleaning', '2026-03-14T08:00:00Z', '2026-03-14T09:00:00Z', 0, 'FREQ=WEEKLY;BYDAY=MO,WE,FR', 'diane@acme-firm.example', 0, '2026-03-14T07:55:00Z');

-- March 14 daily courier pickup
INSERT INTO calendar_events (calendar_event_id, tenant_id, connection_id, provider_event_id, title, description, starts_at, ends_at, is_all_day, recurrence_rule, organizer_email, is_cancelled, last_seen_at)
VALUES ('cal-20260314-courier', 'tenant-acme-001', 'conn-acme-001', 'google_evt_20260314_002', 'SwiftCourier Daily Pickup', 'Daily 4pm courier collection', '2026-03-14T16:00:00Z', '2026-03-14T16:15:00Z', 0, 'FREQ=DAILY;BYHOUR=16;BYMINUTE=0', 'diane@acme-firm.example', 0, '2026-03-14T07:55:00Z');

-- March 10 HVAC quarterly service (completed)
INSERT INTO calendar_events (calendar_event_id, tenant_id, connection_id, provider_event_id, title, description, starts_at, ends_at, is_all_day, recurrence_rule, organizer_email, is_cancelled, last_seen_at)
VALUES ('cal-20260310-hvac', 'tenant-acme-001', 'conn-acme-001', 'google_evt_20260310_001', 'HVACPlus Quarterly Maintenance', 'Quarterly HVAC filter and system check', '2026-03-10T14:00:00Z', '2026-03-10T15:00:00Z', 0, 'FREQ=MONTHLY;INTERVAL=3', 'marco@acme-firm.example', 0, '2026-03-10T13:55:00Z');

-- Demo vendors
INSERT INTO vendors (vendor_id, tenant_id, display_name, service_type, contact_email, contact_phone, sla_window_minutes, shadow_mode, shadow_mode_visit_limit, score, score_band, created_at)
VALUES ('vendor-cleanpro-001', 'tenant-acme-001', 'CleanPro Services', 'cleaning', 'dispatch@cleanpro.example', '+15559876501', 15, 0, NULL, 78.5, 'warning', '2026-01-15T00:00:00Z');

INSERT INTO vendors (vendor_id, tenant_id, display_name, service_type, contact_email, contact_phone, sla_window_minutes, shadow_mode, shadow_mode_visit_limit, score, score_band, created_at)
VALUES ('vendor-hvacplus-001', 'tenant-acme-001', 'HVACPlus', 'hvac', 'scheduling@hvacplus.example', '+15559876502', 30, 0, NULL, 95.0, 'ok', '2026-01-15T00:00:00Z');

INSERT INTO vendors (vendor_id, tenant_id, display_name, service_type, contact_email, contact_phone, sla_window_minutes, shadow_mode, shadow_mode_visit_limit, score, score_band, created_at)
VALUES ('vendor-swift-001', 'tenant-acme-001', 'SwiftCourier', 'courier', 'ops@swiftcourier.example', '+15559876503', 5, 0, NULL, 92.0, 'ok', '2026-01-15T00:00:00Z');

-- Demo vendor contacts (Jonas as counterparty for CleanPro)
INSERT INTO vendor_contacts (vendor_contact_id, tenant_id, vendor_id, display_name, phone_e164, email, magic_link_enabled, default_recipient, created_at)
VALUES ('vcontact-jonas-001', 'tenant-acme-001', 'vendor-cleanpro-001', 'Jonas (Field Worker)', '+15559876504', 'jonas.field@cleanpro.example', 1, 1, '2026-01-15T00:00:00Z');

INSERT INTO vendor_contacts (vendor_contact_id, tenant_id, vendor_id, display_name, phone_e164, email, magic_link_enabled, default_recipient, created_at)
VALUES ('vcontact-hvac-001', 'tenant-acme-001', 'vendor-hvacplus-001', 'HVACPlus Dispatch', '+15559876505', 'dispatch@hvacplus.example', 1, 1, '2026-01-15T00:00:00Z');

-- Demo visit templates
INSERT INTO visit_templates (template_id, tenant_id, vendor_id, calendar_event_id, scheduled_start_offset_minutes, sla_window_minutes, default_duration_minutes, requires_counterparty_signature, requires_photo, created_at)
VALUES ('tmpl-cleanpro-001', 'tenant-acme-001', 'vendor-cleanpro-001', 'cal-20260309-clean', 0, 15, 60, 1, 1, '2026-01-15T00:00:00Z');

INSERT INTO visit_templates (template_id, tenant_id, vendor_id, calendar_event_id, scheduled_start_offset_minutes, sla_window_minutes, default_duration_minutes, requires_counterparty_signature, requires_photo, created_at)
VALUES ('tmpl-hvac-001', 'tenant-acme-001', 'vendor-hvacplus-001', 'cal-20260310-hvac', 0, 30, 60, 1, 1, '2026-01-15T00:00:00Z');

INSERT INTO visit_templates (template_id, tenant_id, vendor_id, calendar_event_id, scheduled_start_offset_minutes, sla_window_minutes, default_duration_minutes, requires_counterparty_signature, requires_photo, created_at)
VALUES ('tmpl-courier-001', 'tenant-acme-001', 'vendor-swift-001', 'cal-20260314-courier', 0, 5, 15, 0, 0, '2026-01-15T00:00:00Z');

-- Demo visit instances
-- March 9: missed (no start tap, auto-marked by system)
INSERT INTO visit_instances (instance_id, tenant_id, template_id, vendor_id, staff_member_id, scheduled_start_at, scheduled_end_at, status, actual_start_at, actual_end_at, drift_seconds, signing_window_closes_at, late_tap_reason, created_at)
VALUES ('visit-20260309-missed', 'tenant-acme-001', 'tmpl-cleanpro-001', 'vendor-cleanpro-001', NULL, '2026-03-09T08:00:00Z', '2026-03-09T09:00:00Z', 'missed', NULL, NULL, NULL, '2026-03-10T08:00:00Z', NULL, '2026-03-09T07:55:00Z');

-- March 10: completed HVAC (on time)
INSERT INTO visit_instances (instance_id, tenant_id, template_id, vendor_id, staff_member_id, scheduled_start_at, scheduled_end_at, status, actual_start_at, actual_end_at, drift_seconds, signing_window_closes_at, late_tap_reason, created_at)
VALUES ('visit-20260310-hvac', 'tenant-acme-001', 'tmpl-hvac-001', 'vendor-hvacplus-001', 'staff-jonas-001', '2026-03-10T14:00:00Z', '2026-03-10T15:00:00Z', 'completed', '2026-03-10T14:05:00Z', '2026-03-10T14:55:00Z', 300, '2026-03-11T14:55:00Z', NULL, '2026-03-10T13:55:00Z');

-- March 11: completed cleaning (on time, early actually)
INSERT INTO visit_instances (instance_id, tenant_id, template_id, vendor_id, staff_member_id, scheduled_start_at, scheduled_end_at, status, actual_start_at, actual_end_at, drift_seconds, signing_window_closes_at, late_tap_reason, created_at)
VALUES ('visit-20260311-clean', 'tenant-acme-001', 'tmpl-cleanpro-001', 'vendor-cleanpro-001', 'staff-jonas-001', '2026-03-11T08:00:00Z', '2026-03-11T09:00:00Z', 'completed', '2026-03-11T07:55:00Z', '2026-03-11T08:55:00Z', -300, '2026-03-12T08:55:00Z', NULL, '2026-03-11T07:55:00Z');

-- March 13: completed cleaning (on time)
INSERT INTO visit_instances (instance_id, tenant_id, template_id, vendor_id, staff_member_id, scheduled_start_at, scheduled_end_at, status, actual_start_at, actual_end_at, drift_seconds, signing_window_closes_at, late_tap_reason, created_at)
VALUES ('visit-20260313-clean', 'tenant-acme-001', 'tmpl-cleanpro-001', 'vendor-cleanpro-001', 'staff-jonas-001', '2026-03-13T08:00:00Z', '2026-03-13T09:00:00Z', 'completed', '2026-03-13T08:07:00Z', '2026-03-13T08:55:00Z', 420, '2026-03-14T08:55:00Z', NULL, '2026-03-13T07:55:00Z');

-- March 14: in_progress cleaning (started late at 8:07, scheduled 8:00)
INSERT INTO visit_instances (instance_id, tenant_id, template_id, vendor_id, staff_member_id, scheduled_start_at, scheduled_end_at, status, actual_start_at, actual_end_at, drift_seconds, signing_window_closes_at, late_tap_reason, created_at)
VALUES ('visit-20260314-clean', 'tenant-acme-001', 'tmpl-cleanpro-001', 'vendor-cleanpro-001', 'staff-jonas-001', '2026-03-14T08:00:00Z', '2026-03-14T09:00:00Z', 'in_progress', '2026-03-14T08:07:00Z', NULL, 420, '2026-03-15T08:07:00Z', 'vendor_late', '2026-03-14T07:55:00Z');

-- March 14: scheduled courier (not due yet)
INSERT INTO visit_instances (instance_id, tenant_id, template_id, vendor_id, staff_member_id, scheduled_start_at, scheduled_end_at, status, actual_start_at, actual_end_at, drift_seconds, signing_window_closes_at, late_tap_reason, created_at)
VALUES ('visit-20260314-courier', 'tenant-acme-001', 'tmpl-courier-001', 'vendor-swift-001', NULL, '2026-03-14T16:00:00Z', '2026-03-14T16:15:00Z', 'scheduled', NULL, NULL, NULL, '2026-03-15T16:15:00Z', NULL, '2026-03-14T07:55:00Z');

-- Demo visit receipts (for completed visits)
-- March 10 HVAC receipt (sealed)
INSERT INTO visit_receipts (receipt_id, tenant_id, instance_id, office_signature_id, counterparty_signature_id, office_signed_at, counterparty_signed_at, sealed_at, office_note, counterparty_note, photo_object_key, status)
VALUES ('receipt-20260310-hvac', 'tenant-acme-001', 'visit-20260310-hvac', 'sig-office-20260310', 'sig-cpty-20260310', '2026-03-10T14:55:00Z', '2026-03-10T14:56:00Z', '2026-03-10T14:56:00Z', 'System serviced, filters replaced', 'Confirmed completion', 'photos/hvac-20260310-1405.jpg', 'sealed');

-- March 11 cleaning receipt (sealed)
INSERT INTO visit_receipts (receipt_id, tenant_id, instance_id, office_signature_id, counterparty_signature_id, office_signed_at, counterparty_signed_at, sealed_at, office_note, counterparty_note, photo_object_key, status)
VALUES ('receipt-20260311-clean', 'tenant-acme-001', 'visit-20260311-clean', 'sig-office-20260311', 'sig-cpty-20260311', '2026-03-11T08:55:00Z', '2026-03-11T08:56:00Z', '2026-03-11T08:56:00Z', 'Early arrival, great service', 'Confirmed early start', 'photos/clean-20260311-0755.jpg', 'sealed');

-- March 13 cleaning receipt (sealed)
INSERT INTO visit_receipts (receipt_id, tenant_id, instance_id, office_signature_id, counterparty_signature_id, office_signed_at, counterparty_signed_at, sealed_at, office_note, counterparty_note, photo_object_key, status)
VALUES ('receipt-20260313-clean', 'tenant-acme-001', 'visit-20260313-clean', 'sig-office-20260313', 'sig-cpty-20260313', '2026-03-13T08:55:00Z', '2026-03-13T08:56:00Z', '2026-03-13T08:56:00Z', 'Slight delay but good work', 'Running late due to traffic', 'photos/clean-20260313-0807.jpg', 'sealed');

-- March 14 in-progress: drafted receipt (awaiting completion)
INSERT INTO visit_receipts (receipt_id, tenant_id, instance_id, office_signature_id, counterparty_signature_id, office_signed_at, counterparty_signed_at, sealed_at, office_note, counterparty_note, photo_object_key, status)
VALUES ('receipt-20260314-draft', 'tenant-acme-001', 'visit-20260314-clean', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'drafted');

-- Demo signatures (simplified for seed)
INSERT INTO signatures (signature_id, tenant_id, signer_user_id, signer_role, signer_phone_e164, canonical_payload_hash, hmac_signature, signing_key_fingerprint, signed_at, ip_hash, user_agent_hash, counterparty_token_id)
VALUES ('sig-office-20260310', 'tenant-acme-001', 'user-marco-001', 'office', NULL, 'sha256_payload_hvac_20260310', 'hmac_signature_b64_001', 'a1b2c3d4', '2026-03-10T14:55:00Z', 'hash_10_0_0_1', 'hash_mozilla', NULL);

INSERT INTO signatures (signature_id, tenant_id, signer_user_id, signer_role, signer_phone_e164, canonical_payload_hash, hmac_signature, signing_key_fingerprint, signed_at, ip_hash, user_agent_hash, counterparty_token_id)
VALUES ('sig-cpty-20260310', 'tenant-acme-001', NULL, 'counterparty', '+15559876505', 'sha256_payload_hvac_20260310', 'hmac_signature_b64_002', 'a1b2c3d4', '2026-03-10T14:56:00Z', 'hash_field_ip', 'hash_mobile', 'token-hvac-20260310');

INSERT INTO signatures (signature_id, tenant_id, signer_user_id, signer_role, signer_phone_e164, canonical_payload_hash, hmac_signature, signing_key_fingerprint, signed_at, ip_hash, user_agent_hash, counterparty_token_id)
VALUES ('sig-office-20260311', 'tenant-acme-001', 'user-diane-001', 'office', NULL, 'sha256_payload_clean_20260311', 'hmac_signature_b64_003', 'a1b2c3d4', '2026-03-11T08:55:00Z', 'hash_10_0_0_2', 'hash_mozilla', NULL);

INSERT INTO signatures (signature_id, tenant_id, signer_user_id, signer_role, signer_phone_e164, canonical_payload_hash, hmac_signature, signing_key_fingerprint, signed_at, ip_hash, user_agent_hash, counterparty_token_id)
VALUES ('sig-cpty-20260311', 'tenant-acme-001', NULL, 'counterparty', '+15559876504', 'sha256_payload_clean_20260311', 'hmac_signature_b64_004', 'a1b2c3d4', '2026-03-11T08:56:00Z', 'hash_field_ip', 'hash_mobile', 'token-clean-20260311');

INSERT INTO signatures (signature_id, tenant_id, signer_user_id, signer_role, signer_phone_e164, canonical_payload_hash, hmac_signature, signing_key_fingerprint, signed_at, ip_hash, user_agent_hash, counterparty_token_id)
VALUES ('sig-office-20260313', 'tenant-acme-001', 'user-diane-001', 'office', NULL, 'sha256_payload_clean_20260313', 'hmac_signature_b64_005', 'a1b2c3d4', '2026-03-13T08:55:00Z', 'hash_10_0_0_3', 'hash_mozilla', NULL);

INSERT INTO signatures (signature_id, tenant_id, signer_user_id, signer_role, signer_phone_e164, canonical_payload_hash, hmac_signature, signing_key_fingerprint, signed_at, ip_hash, user_agent_hash, counterparty_token_id)
VALUES ('sig-cpty-20260313', 'tenant-acme-001', NULL, 'counterparty', '+15559876504', 'sha256_payload_clean_20260313', 'hmac_signature_b64_006', 'a1b2c3d4', '2026-03-13T08:56:00Z', 'hash_field_ip', 'hash_mobile', 'token-clean-20260313');

-- Demo manual overrides
-- March 9: system auto-marked missed
INSERT INTO manual_overrides (override_id, tenant_id, instance_id, actor_user_id, override_type, reason, payload_before_hash, payload_after_hash, signature_id, created_at, approved_by_user_id, approved_at)
VALUES ('ovr-missed-20260309', 'tenant-acme-001', 'visit-20260309-missed', NULL, 'mark_missed', 'No start tap received within SLA window + 24h grace', 'hash_scheduled', 'hash_missed', 'sig-system-20260309', '2026-03-10T08:00:00Z', NULL, NULL);

-- March 14: late start override (Diane tapped late, reason recorded)
INSERT INTO manual_overrides (override_id, tenant_id, instance_id, actor_user_id, override_type, reason, payload_before_hash, payload_after_hash, signature_id, created_at, approved_by_user_id, approved_at)
VALUES ('ovr-late-20260314', 'tenant-acme-001', 'visit-20260314-clean', 'user-diane-001', 'start_late', 'Vendor reported running 10 minutes late via text', 'hash_due', 'hash_in_progress', 'sig-office-late-20260314', '2026-03-14T08:07:00Z', NULL, NULL);

INSERT INTO signatures (signature_id, tenant_id, signer_user_id, signer_role, signer_phone_e164, canonical_payload_hash, hmac_signature, signing_key_fingerprint, signed_at, ip_hash, user_agent_hash, counterparty_token_id)
VALUES ('sig-office-late-20260314', 'tenant-acme-001', 'user-diane-001', 'office', NULL, 'hash_start_late_20260314', 'hmac_signature_b64_007', 'a1b2c3d4', '2026-03-14T08:07:00Z', 'hash_10_0_0_4', 'hash_mozilla', NULL);

INSERT INTO signatures (signature_id, tenant_id, signer_user_id, signer_role, signer_phone_e164, canonical_payload_hash, hmac_signature, signing_key_fingerprint, signed_at, ip_hash, user_agent_hash, counterparty_token_id)
VALUES ('sig-system-20260309', 'tenant-acme-001', NULL, 'system', NULL, 'hash_auto_missed_20260309', 'hmac_signature_b64_system', 'system_key_001', '2026-03-10T08:00:00Z', 'system', 'system', NULL);

-- Demo counterparty tokens
INSERT INTO counterparty_tokens (token_id, tenant_id, instance_id, vendor_contact_id, token_hash, channel, issued_at, expires_at, consumed_at, ip_hash_at_consume)
VALUES ('token-hvac-20260310', 'tenant-acme-001', 'visit-20260310-hvac', 'vcontact-hvac-001', 'sha256_magic_token_hvac_20260310', 'sms', '2026-03-10T14:00:00Z', '2026-03-11T14:00:00Z', '2026-03-10T14:56:00Z', 'hash_field_ip');

INSERT INTO counterparty_tokens (token_id, tenant_id, instance_id, vendor_contact_id, token_hash, channel, issued_at, expires_at, consumed_at, ip_hash_at_consume)
VALUES ('token-clean-20260311', 'tenant-acme-001', 'visit-20260311-clean', 'vcontact-jonas-001', 'sha256_magic_token_clean_20260311', 'sms', '2026-03-11T07:55:00Z', '2026-03-12T07:55:00Z', '2026-03-11T08:56:00Z', 'hash_field_ip');

INSERT INTO counterparty_tokens (token_id, tenant_id, instance_id, vendor_contact_id, token_hash, channel, issued_at, expires_at, consumed_at, ip_hash_at_consume)
VALUES ('token-clean-20260313', 'tenant-acme-001', 'visit-20260313-clean', 'vcontact-jonas-001', 'sha256_magic_token_clean_20260313', 'sms', '2026-03-13T07:55:00Z', '2026-03-14T07:55:00Z', '2026-03-13T08:56:00Z', 'hash_field_ip');

-- Demo ledger entries (append-only chain)
INSERT INTO ledger_entries (entry_id, tenant_id, entry_type, entity_type, entity_id, payload_canonical_json, payload_hash, prev_hash, entry_hash, actor_user_id, actor_role, created_at, signature_id)
VALUES (1, 'tenant-acme-001', 'visit_created', 'VisitInstance', 'visit-20260309-missed', '{"scheduled_start":"2026-03-09T08:00:00Z"}', 'hash_payload_1', 'genesis_hash_acme_001', 'hash_entry_1', 'user-diane-001', 'office_manager', '2026-03-09T07:55:00Z', NULL);

INSERT INTO ledger_entries (entry_id, tenant_id, entry_type, entity_type, entity_id, payload_canonical_json, payload_hash, prev_hash, entry_hash, actor_user_id, actor_role, created_at, signature_id)
VALUES (2, 'tenant-acme-001', 'visit_created', 'VisitInstance', 'visit-20260310-hvac', '{"scheduled_start":"2026-03-10T14:00:00Z"}', 'hash_payload_2', 'hash_entry_1', 'hash_entry_2', 'user-marco-001', 'office_manager', '2026-03-10T13:55:00Z', NULL);

INSERT INTO ledger_entries (entry_id, tenant_id, entry_type, entity_type, entity_id, payload_canonical_json, payload_hash, prev_hash, entry_hash, actor_user_id, actor_role, created_at, signature_id)
VALUES (3, 'tenant-acme-001', 'visit_started', 'VisitInstance', 'visit-20260310-hvac', '{"actual_start":"2026-03-10T14:05:00Z","drift":300}', 'hash_payload_3', 'hash_entry_2', 'hash_entry_3', 'user-marco-001', 'office_manager', '2026-03-10T14:05:00Z', 'sig-office-20260310');

INSERT INTO ledger_entries (entry_id, tenant_id, entry_type, entity_type, entity_id, payload_canonical_json, payload_hash, prev_hash, entry_hash, actor_user_id, actor_role, created_at, signature_id)
VALUES (4, 'tenant-acme-001', 'receipt_sealed', 'VisitReceipt', 'receipt-20260310-hvac', '{"office_signed":true,"counterparty_signed":true}', 'hash_payload_4', 'hash_entry_3', 'hash_entry_4', 'user-marco-001', 'office_manager', '2026-03-10T14:56:00Z', 'sig-cpty-20260310');

INSERT INTO ledger_entries (entry_id, tenant_id, entry_type, entity_type, entity_id, payload_canonical_json, payload_hash, prev_hash, entry_hash, actor_user_id, actor_role, created_at, signature_id)
VALUES (5, 'tenant-acme-001', 'visit_created', 'VisitInstance', 'visit-20260311-clean', '{"scheduled_start":"2026-03-11T08:00:00Z"}', 'hash_payload_5', 'hash_entry_4', 'hash_entry_5', 'user-diane-001', 'office_manager', '2026-03-11T07:55:00Z', NULL);

INSERT INTO ledger_entries (entry_id, tenant_id, entry_type, entity_type, entity_id, payload_canonical_json, payload_hash, prev_hash, entry_hash, actor_user_id, actor_role, created_at, signature_id)
VALUES (6, 'tenant-acme-001', 'visit_started', 'VisitInstance', 'visit-20260311-clean', '{"actual_start":"2026-03-11T07:55:00Z","drift":-300}', 'hash_payload_6', 'hash_entry_5', 'hash_entry_6', 'user-diane-001', 'office_manager', '2026-03-11T07:55:00Z', 'sig-office-20260311');

INSERT INTO ledger_entries (entry_id, tenant_id, entry_type, entity_type, entity_id, payload_canonical_json, payload_hash, prev_hash, entry_hash, actor_user_id, actor_role, created_at, signature_id)
VALUES (7, 'tenant-acme-001', 'receipt_sealed', 'VisitReceipt', 'receipt-20260311-clean', '{"office_signed":true,"counterparty_signed":true}', 'hash_payload_7', 'hash_entry_6', 'hash_entry_7', 'user-diane-001', 'office_manager', '2026-03-11T08:56:00Z', 'sig-cpty-20260311');

INSERT INTO ledger_entries (entry_id, tenant_id, entry_type, entity_type, entity_id, payload_canonical_json, payload_hash, prev_hash, entry_hash, actor_user_id, actor_role, created_at, signature_id)
VALUES (8, 'tenant-acme-001', 'visit_created', 'VisitInstance', 'visit-20260313-clean', '{"scheduled_start":"2026-03-13T08:00:00Z"}', 'hash_payload_8', 'hash_entry_7', 'hash_entry_8', 'user-diane-001', 'office_manager', '2026-03-13T07:55:00Z', NULL);

INSERT INTO ledger_entries (entry_id, tenant_id, entry_type, entity_type, entity_id, payload_canonical_json, payload_hash, prev_hash, entry_hash, actor_user_id, actor_role, created_at, signature_id)
VALUES (9, 'tenant-acme-001', 'visit_started', 'VisitInstance', 'visit-20260313-clean', '{"actual_start":"2026-03-13T08:07:00Z","drift":420}', 'hash_payload_9', 'hash_entry_8', 'hash_entry_9', 'user-diane-001', 'office_manager', '2026-03-13T08:07:00Z', 'sig-office-20260313');

INSERT INTO ledger_entries (entry_id, tenant_id, entry_type, entity_type, entity_id, payload_canonical_json, payload_hash, prev_hash, entry_hash, actor_user_id, actor_role, created_at, signature_id)
VALUES (10, 'tenant-acme-001', 'receipt_sealed', 'VisitReceipt', 'receipt-20260313-clean', '{"office_signed":true,"counterparty_signed":true}', 'hash_payload_10', 'hash_entry_9', 'hash_entry_10', 'user-diane-001', 'office_manager', '2026-03-13T08:56:00Z', 'sig-cpty-20260313');

INSERT INTO ledger_entries (entry_id, tenant_id, entry_type, entity_type, entity_id, payload_canonical_json, payload_hash, prev_hash, entry_hash, actor_user_id, actor_role, created_at, signature_id)
VALUES (11, 'tenant-acme-001', 'visit_created', 'VisitInstance', 'visit-20260314-clean', '{"scheduled_start":"2026-03-14T08:00:00Z"}', 'hash_payload_11', 'hash_entry_10', 'hash_entry_11', 'user-diane-001', 'office_manager', '2026-03-14T07:55:00Z', NULL);

INSERT INTO ledger_entries (entry_id, tenant_id, entry_type, entity_type, entity_id, payload_canonical_json, payload_hash, prev_hash, entry_hash, actor_user_id, actor_role, created_at, signature_id)
VALUES (12, 'tenant-acme-001', 'override', 'VisitInstance', 'visit-20260314-clean', '{"override_type":"start_late","reason":"vendor_late"}', 'hash_payload_12', 'hash_entry_11', 'hash_entry_12', 'user-diane-001', 'office_manager', '2026-03-14T08:07:00Z', 'sig-office-late-20260314');

INSERT INTO ledger_entries (entry_id, tenant_id, entry_type, entity_type, entity_id, payload_canonical_json, payload_hash, prev_hash, entry_hash, actor_user_id, actor_role, created_at, signature_id)
VALUES (13, 'tenant-acme-001', 'visit_started', 'VisitInstance', 'visit-20260314-clean', '{"actual_start":"2026-03-14T08:07:00Z","drift":420}', 'hash_payload_13', 'hash_entry_12', 'hash_entry_13', 'user-diane-001', 'office_manager', '2026-03-14T08:07:00Z', 'sig-office-late-20260314');

INSERT INTO ledger_entries (entry_id, tenant_id, entry_type, entity_type, entity_id, payload_canonical_json, payload_hash, prev_hash, entry_hash, actor_user_id, actor_role, created_at, signature_id)
VALUES (14, 'tenant-acme-001', 'visit_created', 'VisitInstance', 'visit-20260314-courier', '{"scheduled_start":"2026-03-14T16:00:00Z"}', 'hash_payload_14', 'hash_entry_13', 'hash_entry_14', 'user-diane-001', 'office_manager', '2026-03-14T07:55:00Z', NULL);

INSERT INTO ledger_entries (entry_id, tenant_id, entry_type, entity_type, entity_id, payload_canonical_json, payload_hash, prev_hash, entry_hash, actor_user_id, actor_role, created_at, signature_id)
VALUES (15, 'tenant-acme-001', 'override', 'VisitInstance', 'visit-20260309-missed', '{"override_type":"mark_missed","auto":true}', 'hash_payload_15', 'hash_entry_14', 'hash_entry_15', NULL, 'system', '2026-03-10T08:00:00Z', 'sig-system-20260309');

-- Update tenant ledger head
UPDATE tenants SET ledger_head_hash = 'hash_entry_15' WHERE tenant_id = 'tenant-acme-001';

-- Demo vendor scores (30-day window, current)
INSERT INTO vendor_scores (score_id, tenant_id, vendor_id, window_days, on_time_starts, late_starts, missed_visits, disputed_visits, score_value, score_band, computed_at, previous_score_id)
VALUES ('vs-cleanpro-30d-001', 'tenant-acme-001', 'vendor-cleanpro-001', 30, 2, 1, 1, 0, 78.5, 'warning', '2026-03-14T06:00:00Z', NULL);

INSERT INTO vendor_scores (score_id, tenant_id, vendor_id, window_days, on_time_starts, late_starts, missed_visits, disputed_visits, score_value, score_band, computed_at, previous_score_id)
VALUES ('vs-hvacplus-30d-001', 'tenant-acme-001', 'vendor-hvacplus-001', 30, 1, 0, 0, 0, 95.0, 'ok', '2026-03-14T06:00:00Z', NULL);

INSERT INTO vendor_scores (score_id, tenant_id, vendor_id, window_days, on_time_starts, late_starts, missed_visits, disputed_visits, score_value, score_band, computed_at, previous_score_id)
VALUES ('vs-swift-30d-001', 'tenant-acme-001', 'vendor-swift-001', 30, 6, 0, 0, 0, 92.0, 'ok', '2026-03-14T06:00:00Z', NULL);

-- Demo notifications
INSERT INTO notifications (notification_id, tenant_id, recipient_user_id, recipient_phone_e164, channel, template, instance_id, scheduled_for, sent_at, delivery_status)
VALUES ('notif-001', 'tenant-acme-001', 'user-diane-001', NULL, 'push', 'visit_started_late', 'visit-20260314-clean', '2026-03-14T08:07:30Z', '2026-03-14T08:07:31Z', 'delivered');

INSERT INTO notifications (notification_id, tenant_id, recipient_user_id, recipient_phone_e164, channel, template, instance_id, scheduled_for, sent_at, delivery_status)
VALUES ('notif-002', 'tenant-acme-001', 'user-sandra-001', NULL, 'email', 'weekly_digest', NULL, '2026-03-10T09:00:00Z', '2026-03-10T09:00:01Z', 'delivered');

INSERT INTO notifications (notification_id, tenant_id, recipient_user_id, recipient_phone_e164, channel, template, instance_id, scheduled_for, sent_at, delivery_status)
VALUES ('notif-003', 'tenant-acme-001', 'user-diane-001', NULL, 'push', 'visit_reminder', 'visit-20260314-courier', '2026-03-14T15:55:00Z', NULL, 'queued');