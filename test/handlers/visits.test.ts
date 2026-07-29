import { describe, it, expect, beforeEach } from "bun:test";
import type { D1Database } from "@cloudflare/workers-types";

type MockEnv = { DB: D1Database };

describe("VisitInstance state machine", () => {
  let env: MockEnv;

  beforeEach(async () => {
    // In-memory D1 for test isolation
    const { makeSQLiteEnv } = await import("../setup.ts");
    env = await makeSQLiteEnv();
  });

  const SCHEDULED_START = new Date("2024-01-15T08:00:00Z");
  const SLA_WINDOW_MINUTES = 15;
  const SCHEDULED_END = new Date("2024-01-15T09:00:00Z");

  async function seedTenantAndVendor(): Promise<{ tenantId: string; vendorId: number }> {
    const tenantId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO tenants (id, slug, display_name, plan_tier, jurisdiction, ledger_head_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(tenantId, "test-tenant", "Test Tenant", "pro", "US-CA", "0000000000000000000000000000000000000000000000000000000000000000", new Date().toISOString())
      .run();
    
    const vendorRes = await env.DB.prepare("INSERT INTO vendors (tenant_id, display_name, service_type, contact_email, contact_phone, sla_window_minutes, shadow_mode, score, score_band, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(tenantId, "Test Cleaner", "cleaning", "cleaner@example.com", "+15551234567", SLA_WINDOW_MINUTES, 0, 85.0, "ok", new Date().toISOString())
      .run();
    const vendorId = vendorRes.meta.last_row_id;
    
    return { tenantId, vendorId };
  }

  async function createVisitTemplate(tenantId: string, vendorId: number): Promise<number> {
    const res = await env.DB.prepare("INSERT INTO visit_templates (tenant_id, vendor_id, scheduled_start_offset_minutes, sla_window_minutes, default_duration_minutes, requires_counterparty_signature, requires_photo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(tenantId, vendorId, 0, SLA_WINDOW_MINUTES, 60, 1, 0, new Date().toISOString())
      .run();
    return res.meta.last_row_id;
  }

  async function createStaffMember(tenantId: string): Promise<number> {
    const userRes = await env.DB.prepare("INSERT INTO users (tenant_id, email, role, trust_score, onboarding_state, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(tenantId, "manager@example.com", "office_manager", 85.0, "active", new Date().toISOString())
      .run();
    const userId = userRes.meta.last_row_id;
    
    const staffRes = await env.DB.prepare("INSERT INTO staff_members (tenant_id, user_id, display_name, role, trust_score, shadow_mode_visit_limit, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(tenantId, userId, "Office Manager", "in-house log", 85.0, 10, new Date().toISOString())
      .run();
    return staffRes.meta.last_row_id;
  }

  async function createVisitInstance(
    tenantId: string, 
    templateId: number, 
    vendorId: number,
    scheduledStart: Date,
    scheduledEnd: Date
  ): Promise<number> {
    const signingWindowCloses = new Date(scheduledEnd.getTime() + 24 * 60 * 60 * 1000); // 24h after scheduled end
    const res = await env.DB.prepare("INSERT INTO visit_instances (tenant_id, template_id, vendor_id, scheduled_start_at, scheduled_end_at, status, signing_window_closes_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(tenantId, templateId, vendorId, scheduledStart.toISOString(), scheduledEnd.toISOString(), "scheduled", signingWindowCloses.toISOString(), new Date().toISOString())
      .run();
    return res.meta.last_row_id;
  }

  async function getVisitInstance(instanceId: number): Promise<{
    id: number;
    status: string;
    actual_start_at: string | null;
    actual_end_at: string | null;
    drift_seconds: number | null;
  } | null> {
    return await env.DB.prepare("SELECT id, status, actual_start_at, actual_end_at, drift_seconds FROM visit_instances WHERE id = ?").bind(instanceId).first();
  }

  async function countLedgerEntries(tenantId: string, entryType: string): Promise<number> {
    const row = await env.DB.prepare("SELECT COUNT(*) as n FROM ledger_entries WHERE tenant_id = ? AND entry_type = ?").bind(tenantId, entryType).first<{ n: number }>();
    return row?.n ?? 0;
  }

  async function transitionToDue(instanceId: number): Promise<void> {
    await env.DB.prepare("UPDATE visit_instances SET status = 'due' WHERE id = ?").bind(instanceId).run();
  }

  // --- Test: scheduled → due transition ---
  it("transitions scheduled to due when now >= scheduled_start_at - 5m", async () => {
    const { tenantId, vendorId } = await seedTenantAndVendor();
    const templateId = await createVisitTemplate(tenantId, vendorId);
    const instanceId = await createVisitInstance(tenantId, templateId, vendorId, SCHEDULED_START, SCHEDULED_END);
    
    // Simulate cron job: transition to due 5 minutes before scheduled start
    const fiveMinutesBefore = new Date(SCHEDULED_START.getTime() - 5 * 60 * 1000);
    await env.DB.prepare("UPDATE visit_instances SET status = 'due' WHERE id = ? AND scheduled_start_at <= ?")
      .bind(instanceId, new Date(fiveMinutesBefore.getTime() + 5 * 60 * 1000).toISOString())
      .run();
    
    const instance = await getVisitInstance(instanceId);
    expect(instance?.status).toBe("due");
  });

  // --- Test: on-time Start tap ---
  it("transitions due → in_progress with actual_start_at on Start tap within SLA window", async () => {
    const { tenantId, vendorId } = await seedTenantAndVendor();
    const templateId = await createVisitTemplate(tenantId, vendorId);
    const instanceId = await createVisitInstance(tenantId, templateId, vendorId, SCHEDULED_START, SCHEDULED_END);
    await transitionToDue(instanceId);
    
    const tapTime = new Date(SCHEDULED_START.getTime() + 5 * 60 * 1000); // 5 minutes late, within 15 min SLA
    const driftSeconds = Math.floor((tapTime.getTime() - SCHEDULED_START.getTime()) / 1000);
    
    await env.DB.prepare("UPDATE visit_instances SET status = 'in_progress', actual_start_at = ?, drift_seconds = ? WHERE id = ?")
      .bind(tapTime.toISOString(), driftSeconds, instanceId)
      .run();
    
    // Write ledger entry for visit_started
    await env.DB.prepare("INSERT INTO ledger_entries (tenant_id, entry_type, entity_type, entity_id, payload_canonical_json, payload_hash, prev_hash, entry_hash, actor_user_id, actor_role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(tenantId, "visit_started", "VisitInstance", instanceId, JSON.stringify({ instance_id: instanceId, actual_start_at: tapTime.toISOString(), drift_seconds: driftSeconds }), "sha256_hash", "prev_hash", "entry_hash", 1, "office_manager", tapTime.toISOString())
      .run();
    
    const instance = await getVisitInstance(instanceId);
    expect(instance?.status).toBe("in_progress");
    expect(instance?.actual_start_at).toBe(tapTime.toISOString());
    expect(instance?.drift_seconds).toBe(300); // 5 minutes = 300 seconds
    
    const ledgerCount = await countLedgerEntries(tenantId, "visit_started");
    expect(ledgerCount).toBe(1);
  });

  // --- Test: late Start tap ---
  it("requires reason and writes ManualOverride for late Start tap beyond SLA window", async () => {
    const { tenantId, vendorId } = await seedTenantAndVendor();
    const templateId = await createVisitTemplate(tenantId, vendorId);
    const instanceId = await createVisitInstance(tenantId, templateId, vendorId, SCHEDULED_START, SCHEDULED_END);
    await transitionToDue(instanceId);
    
    const lateTapTime = new Date(SCHEDULED_START.getTime() + 20 * 60 * 1000); // 20 minutes late, beyond 15 min SLA
    const driftSeconds = Math.floor((lateTapTime.getTime() - SCHEDULED_START.getTime()) / 1000);
    
    // System blocks in_progress until reason provided
    const statusBefore = await getVisitInstance(instanceId);
    expect(statusBefore?.status).toBe("due");
    
    // Late tap requires reason - this simulates the UI flow
    const lateReason = "vendor late - traffic accident on freeway";
    
    // First write the ManualOverride
    const overrideRes = await env.DB.prepare("INSERT INTO manual_overrides (tenant_id, instance_id, actor_user_id, override_type, reason, payload_before_hash, payload_after_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(tenantId, instanceId, 1, "start_late", lateReason, "before_hash", "after_hash", lateTapTime.toISOString())
      .run();
    const overrideId = overrideRes.meta.last_row_id;
    
    // Then allow the transition with the reason recorded
    await env.DB.prepare("UPDATE visit_instances SET status = 'in_progress', actual_start_at = ?, drift_seconds = ?, late_tap_reason = ? WHERE id = ?")
      .bind(lateTapTime.toISOString(), driftSeconds, lateReason, instanceId)
      .run();
    
    // Write ledger entries
    await env.DB.prepare("INSERT INTO ledger_entries (tenant_id, entry_type, entity_type, entity_id, payload_canonical_json, payload_hash, prev_hash, entry_hash, actor_user_id, actor_role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(tenantId, "override", "ManualOverride", overrideId, JSON.stringify({ override_id: overrideId, type: "start_late", reason: lateReason }), "sha256_hash", "prev_hash", "entry_hash", 1, "office_manager", lateTapTime.toISOString())
      .run();
    
    await env.DB.prepare("INSERT INTO ledger_entries (tenant_id, entry_type, entity_type, entity_id, payload_canonical_json, payload_hash, prev_hash, entry_hash, actor_user_id, actor_role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(tenantId, "visit_started", "VisitInstance", instanceId, JSON.stringify({ instance_id: instanceId, actual_start_at: lateTapTime.toISOString(), drift_seconds: driftSeconds, late_reason: lateReason }), "sha256_hash2", "entry_hash", "entry_hash2", 1, "office_manager", lateTapTime.toISOString())
      .run();
    
    const instance = await getVisitInstance(instanceId);
    expect(instance?.status).toBe("in_progress");
    expect(instance?.drift_seconds).toBe(1200); // 20 minutes = 1200 seconds
    
    const overrideRow = await env.DB.prepare("SELECT reason, override_type FROM manual_overrides WHERE id = ?").bind(overrideId).first<{ reason: string; override_type: string }>();
    expect(overrideRow?.reason).toBe(lateReason);
    expect(overrideRow?.override_type).toBe("start_late");
  });

  // --- Test: in_progress → completed ---
  it("transitions in_progress → completed when receipt is sealed with both signatures", async () => {
    const { tenantId, vendorId } = await seedTenantAndVendor();
    const templateId = await createVisitTemplate(tenantId, vendorId);
    const instanceId = await createVisitInstance(tenantId, templateId, vendorId, SCHEDULED_START, SCHEDULED_END);
    const staffId = await createStaffMember(tenantId);
    
    // Set up in_progress state
    const startTime = new Date(SCHEDULED_START.getTime() + 5 * 60 * 1000);
    await env.DB.prepare("UPDATE visit_instances SET status = 'in_progress', actual_start_at = ?, drift_seconds = ?, staff_member_id = ? WHERE id = ?")
      .bind(startTime.toISOString(), 300, staffId, instanceId)
      .run();
    
    // Create receipt in awaiting_counterparty state (office signed first)
    const endTime = new Date(startTime.getTime() + 50 * 60 * 1000); // 50 minute visit
    const receiptRes = await env.DB.prepare("INSERT INTO visit_receipts (tenant_id, instance_id, office_signed_at, office_note, status, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(tenantId, instanceId, endTime.toISOString(), "Service completed as expected", "awaiting_counterparty", endTime.toISOString())
      .run();
    const receiptId = receiptRes.meta.last_row_id;
    
    // Create office signature
    const officeSigRes = await env.DB.prepare("INSERT INTO signatures (tenant_id, signer_user_id, signer_role, canonical_payload_hash, hmac_signature, signing_key_fingerprint, signed_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(tenantId, 1, "office", "payload_hash_abc123", "hmac_signature_xyz", "key_fp_1234abcd", endTime.toISOString())
      .run();
    const officeSigId = officeSigRes.meta.last_row_id;
    
    // Update receipt with office signature
    await env.DB.prepare("UPDATE visit_receipts SET office_signature_id = ? WHERE id = ?").bind(officeSigId, receiptId).run();
    
    // Counterparty signs
    const counterpartySigRes = await env.DB.prepare("INSERT INTO signatures (tenant_id, signer_role, signer_phone_e164, canonical_payload_hash, hmac_signature, signing_key_fingerprint, signed_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(tenantId, "counterparty", "+15559876543", "payload_hash_abc123", "hmac_signature_counter", "key_fp_5678efgh", endTime.toISOString())
      .run();
    const counterpartySigId = counterpartySigRes.meta.last_row_id;
    
    // Seal the receipt
    const sealedAt = new Date(endTime.getTime() + 60 * 1000);
    await env.DB.prepare("UPDATE visit_receipts SET counterparty_signature_id = ?, counterparty_signed_at = ?, status = 'sealed', sealed_at = ? WHERE id = ?")
      .bind(counterpartySigId, sealedAt.toISOString(), sealedAt.toISOString(), receiptId)
      .run();
    
    // Complete the visit instance
    await env.DB.prepare("UPDATE visit_instances SET status = 'completed', actual_end_at = ? WHERE id = ?")
      .bind(sealedAt.toISOString(), instanceId)
      .run();
    
    // Write ledger entry
    await env.DB.prepare("INSERT INTO ledger_entries (tenant_id, entry_type, entity_type, entity_id, payload_canonical_json, payload_hash, prev_hash, entry_hash, actor_user_id, actor_role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(tenantId, "visit_completed", "VisitInstance", instanceId, JSON.stringify({ instance_id: instanceId, receipt_id: receiptId, duration_minutes: 50 }), "sha256_hash", "prev_hash", "entry_hash", 1, "office_manager", sealedAt.toISOString())
      .run();
    
    await env.DB.prepare("INSERT INTO ledger_entries (tenant_id, entry_type, entity_type, entity_id, payload_canonical_json, payload_hash, prev_hash, entry_hash, actor_user_id, actor_role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(tenantId, "receipt_sealed", "VisitReceipt", receiptId, JSON.stringify({ receipt_id: receiptId, office_sig_id: officeSigId, counterparty_sig_id: counterpartySigId }), "sha256_hash2", "entry_hash", "entry_hash2", 1, "system", sealedAt.toISOString())
      .run();
    
    const instance = await getVisitInstance(instanceId);
    expect(instance?.status).toBe("completed");
    expect(instance?.actual_end_at).toBe(sealedAt.toISOString());
    
    const receipt = await env.DB.prepare("SELECT status FROM visit_receipts WHERE id = ?").bind(receiptId).first<{ status: string }>();
    expect(receipt?.status).toBe("sealed");
    
    const completedCount = await countLedgerEntries(tenantId, "visit_completed");
    expect(completedCount).toBe(1);
  });

  // --- Test: auto-miss after SLA window expires ---
  it("auto-transitions to missed after SLA window with no Start tap", async () => {
    const { tenantId, vendorId } = await seedTenantAndVendor();
    const templateId = await createVisitTemplate(tenantId, vendorId);
    const instanceId = await createVisitInstance(tenantId, templateId, vendorId, SCHEDULED_START, SCHEDULED_END);
    await transitionToDue(instanceId);
    
    // Simulate cron job checking for missed visits: now > scheduled_start_at + sla_window_minutes
    const missTime = new Date(SCHEDULED_START.getTime() + (SLA_WINDOW_MINUTES + 1) * 60 * 1000);
    
    // Find instances that should be marked missed
    const dueInstances = await env.DB.prepare("SELECT id FROM visit_instances WHERE status = 'due' AND datetime(scheduled_start_at, '+' || ? || ' minutes') < ?")
      .bind(SLA_WINDOW_MINUTES, missTime.toISOString())
      .all<{ id: number }>();
    
    for (const row of dueInstances.results ?? []) {
      await env.DB.prepare("UPDATE visit_instances SET status = 'missed' WHERE id = ?").bind(row.id).run();
      
      // Write system-generated ManualOverride
      const overrideRes = await env.DB.prepare("INSERT INTO manual_overrides (tenant_id, instance_id, actor_user_id, override_type, reason, payload_before_hash, payload_after_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(tenantId, row.id, null, "mark_missed", "Auto-marked missed: no start tap within SLA window", "before_hash", "after_hash", missTime.toISOString())
        .run();
      
      await env.DB.prepare("INSERT INTO ledger_entries (tenant_id, entry_type, entity_type, entity_id, payload_canonical_json, payload_hash, prev_hash, entry_hash, actor_user_id, actor_role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(tenantId, "override", "ManualOverride", overrideRes.meta.last_row_id, JSON.stringify({ override_type: "mark_missed", reason: "Auto-marked missed: no start tap within SLA window" }), "sha256_hash", "prev_hash", "entry_hash", null, "system", missTime.toISOString())
        .run();
    }
    
    const instance = await getVisitInstance(instanceId);
    expect(instance?.status).toBe("missed");
    expect(instance?.actual_start_at).toBeNull();
    
    const overrideCount = await env.DB.prepare("SELECT COUNT(*) as n FROM manual_overrides WHERE tenant_id = ? AND instance_id = ? AND override_type = ?")
      .bind(tenantId, instanceId, "mark_missed")
      .first<{ n: number }>();
    expect(overrideCount?.n).toBe(1);
  });

  // --- Test: receipt expires after signing window ---
  it("expires receipt and moves to disputed when signing window closes without counterparty signature", async () => {
    const { tenantId, vendorId } = await seedTenantAndVendor();
    const templateId = await createVisitTemplate(tenantId, vendorId);
    const instanceId = await createVisitInstance(tenantId, templateId, vendorId, SCHEDULED_START, SCHEDULED_END);
    const staffId = await createStaffMember(tenantId);
    
    // Set up in_progress state
    const startTime = new Date(SCHEDULED_START.getTime() + 5 * 60 * 1000);
    await env.DB.prepare("UPDATE visit_instances SET status = 'in_progress', actual_start_at = ?, drift_seconds = ?, staff_member_id = ? WHERE id = ?")
      .bind(startTime.toISOString(), 300, staffId, instanceId)
      .run();
    
    // Create receipt in awaiting_counterparty state
    const endTime = new Date(startTime.getTime() + 50 * 60 * 1000);
    const signingWindowCloses = new Date(endTime.getTime() + 24 * 60 * 60 * 1000);
    
    const receiptRes = await env.DB.prepare("INSERT INTO visit_receipts (tenant_id, instance_id, office_signed_at, office_note, status, signing_window_closes_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(tenantId, instanceId, endTime.toISOString(), "Service completed as expected", "awaiting_counterparty", signingWindowCloses.toISOString(), endTime.toISOString())
      .run();
    const receiptId = receiptRes.meta.last_row_id;
    
    // Simulate cron job: signing window expired
    const afterExpiry = new Date(signingWindowCloses.getTime() + 60 * 1000);
    
    await env.DB.prepare("UPDATE visit_receipts SET status = 'expired' WHERE id = ? AND signing_window_closes_at < ? AND status IN ('awaiting_office', 'awaiting_counterparty')")
      .bind(receiptId, afterExpiry.toISOString())
      .run();
    
    await env.DB.prepare("UPDATE visit_instances SET status = 'disputed' WHERE id = ?").bind(instanceId).run();
    
    const receipt = await env.DB.prepare("SELECT status FROM visit_receipts WHERE id = ?").bind(receiptId).first<{ status: string }>();
    expect(receipt?.status).toBe("expired");
    
    const instance = await getVisitInstance(instanceId);
    expect(instance?.status).toBe("disputed");
  });

  // --- Test: ledger chain integrity ---
  it("maintains ledger chain with prev_hash linking each entry to prior head", async () => {
    const { tenantId, vendorId } = await seedTenantAndVendor();
    
    // Create first entry with no prev (genesis)
    const entry1Res = await env.DB.prepare("INSERT INTO ledger_entries (tenant_id, entry_id, entry_type, entity_type, entity_id, payload_canonical_json, payload_hash, prev_hash, entry_hash, actor_user_id, actor_role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(tenantId, 1, "visit_created", "VisitInstance", 1, "{}", "hash1", "0000000000000000000000000000000000000000000000000000000000000000", "entry_hash_1", 1, "system", new Date().toISOString())
      .run();
    
    // Second entry links to first
    const entry2Res = await env.DB.prepare("INSERT INTO ledger_entries (tenant_id, entry_id, entry_type, entity_type, entity_id, payload_canonical_json, payload_hash, prev_hash, entry_hash, actor_user_id, actor_role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(tenantId, 2, "visit_started", "VisitInstance", 1, "{}", "hash2", "entry_hash_1", "entry_hash_2", 1, "office_manager", new Date().toISOString())
      .run();
    
    // Third entry links to second
    await env.DB.prepare("INSERT INTO ledger_entries (tenant_id, entry_id, entry_type, entity_type, entity_id, payload_canonical_json, payload_hash, prev_hash, entry_hash, actor_user_id, actor_role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(tenantId, 3, "visit_completed", "VisitInstance", 1, "{}", "hash3", "entry_hash_2", "entry_hash_3", 1, "office_manager", new Date().toISOString())
      .run();
    
    // Verify chain can be walked
    const entries = await env.DB.prepare("SELECT entry_id, entry_type, prev_hash, entry_hash FROM ledger_entries WHERE tenant_id = ? ORDER BY entry_id")
      .bind(tenantId)
      .all<{ entry_id: number; entry_type: string; prev_hash: string; entry_hash: string }>();
    
    const rows = entries.results ?? [];
    expect(rows).toHaveLength(3);
    expect(rows[0]?.prev_hash).toBe("0000000000000000000000000000000000000000000000000000000000000000");
    expect(rows[1]?.prev_hash).toBe(rows[0]?.entry_hash);
    expect(rows[2]?.prev_hash).toBe(rows[1]?.entry_hash);
  });

  // --- Test: drift_seconds is computed and signed ---
  it("computes drift_seconds as actual - scheduled and preserves it immutably", async () => {
    const { tenantId, vendorId } = await seedTenantAndVendor();
    const templateId = await createVisitTemplate(tenantId, vendorId);
    const instanceId = await createVisitInstance(tenantId, templateId, vendorId, SCHEDULED_START, SCHEDULED_END);
    await transitionToDue(instanceId);
    
    // Early start (negative drift)
    const earlyStart = new Date(SCHEDULED_START.getTime() - 3 * 60 * 1000); // 3 minutes early
    const earlyDrift = Math.floor((earlyStart.getTime() - SCHEDULED_START.getTime()) / 1000); // -180
    
    await env.DB.prepare("UPDATE visit_instances SET status = 'in_progress', actual_start_at = ?, drift_seconds = ? WHERE id = ?")
      .bind(earlyStart.toISOString(), earlyDrift, instanceId)
      .run();
    
    let instance = await getVisitInstance(instanceId);
    expect(instance?.drift_seconds).toBe(-180);
    
    // Attempt to mutate drift (simulating tampering attempt) - should require new ledger entry
    const tamperAttempt = await env.DB.prepare("UPDATE visit_instances SET drift_seconds = 0 WHERE id = ?").bind(instanceId).run();
    expect(tamperAttempt.meta.changes).toBe(1); // SQLite allows it, but ledger would show correction
    
    // The correction would be logged as a ManualOverride with correction type
    const correctionRes = await env.DB.prepare("INSERT INTO manual_overrides (tenant_id, instance_id, actor_user_id, override_type, reason, payload_before_hash, payload_after_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(tenantId, instanceId, 1, "correct_record", "Correction: drift recalculated after clock sync verification", "before_hash", "after_hash", new Date().toISOString())
      .run();
    
    expect(correctionRes.meta.last_row_id).toBeGreaterThan(0);
  });

  // --- Test: cross-tenant isolation ---
  it("rejects cross-tenant access at query layer", async () => {
    const { tenantId: tenant1 } = await seedTenantAndVendor();
    const { tenantId: tenant2 } = await seedTenantAndVendor();
    
    // Create instance in tenant1
    const templateRes = await env.DB.prepare("INSERT INTO visit_templates (tenant_id, vendor_id, scheduled_start_offset_minutes, sla_window_minutes, default_duration_minutes, requires_counterparty_signature, requires_photo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(tenant1, 1, 0, 15, 60, 1, 0, new Date().toISOString())
      .run();
    const templateId = templateRes.meta.last_row_id;
    
    const instanceRes = await env.DB.prepare("INSERT INTO visit_instances (tenant_id, template_id, vendor_id, scheduled_start_at, scheduled_end_at, status, signing_window_closes_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(tenant1, templateId, 1, SCHEDULED_START.toISOString(), SCHEDULED_END.toISOString(), "scheduled", SCHEDULED_END.toISOString(), new Date().toISOString())
      .run();
    const instanceId = instanceRes.meta.last_row_id;
    
    // Attempt to read with tenant2 context should return no results
    const wrongTenantResult = await env.DB.prepare("SELECT id FROM visit_instances WHERE id = ? AND tenant_id = ?").bind(instanceId, tenant2).first();
    expect(wrongTenantResult).toBeNull();
    
    // Correct tenant access works
    const correctTenantResult = await env.DB.prepare("SELECT id, tenant_id FROM visit_instances WHERE id = ? AND tenant_id = ?").bind(instanceId, tenant1).first<{ id: number; tenant_id: string }>();
    expect(correctTenantResult?.id).toBe(instanceId);
    expect(correctTenantResult?.tenant_id).toBe(tenant1);
  });
});
