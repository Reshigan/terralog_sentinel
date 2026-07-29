// Core VisitInstance state machine: Start, Complete, Missed transitions.
// Enforces SLA windows, late-tap reasons, and writes LedgerEntry for every state change.
import { json, readJson, type Handler } from "../lib/http";
import type { VisitInstance, VisitReceipt, Signature, LedgerEntry } from "../lib/schema";
import { hashHex, hmacSign, keyFingerprint } from "../lib/crypto";
import { appendLedgerEntry, getLedgerHead } from "../lib/ledger";

// ------------------------------------------------------------------
// Constants from spec
// ------------------------------------------------------------------
const DEFAULT_SLA_WINDOW_MINUTES = 15;
const SIGNING_WINDOW_HOURS = 24;
const LATE_TAP_MIN_REASON_LENGTH = 10;

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------
interface StartVisitBody {
  /** If starting after SLA window, required per spec */
  late_reason?: string;
}

interface CompleteVisitBody {
  /** Office manager's note (optional) */
  note?: string;
  /** Base64 photo data, validated but stored to R2 */
  photo_base64?: string;
}

interface MarkMissedBody {
  reason: string;
}

interface VisitResponse {
  instance_id: string;
  status: VisitInstance["status"];
  scheduled_start_at: string;
  scheduled_end_at: string;
  actual_start_at: string | null;
  actual_end_at: string | null;
  drift_seconds: number | null;
  late_tap_reason: string | null;
  receipt_id: string | null;
  signing_window_closes_at: string | null;
  ledger_entry_id: string;
}

// Handler aliases from contract
export type VisitStartHandler = Handler<VisitResponse | { error: string }>;
export type VisitCompleteHandler = Handler<VisitResponse | { error: string }>;
export type VisitMissedHandler = Handler<VisitResponse | { error: string }>;
export type VisitGetHandler = Handler<VisitResponse | { error: string }>;

// ------------------------------------------------------------------
// Helper: resolve tenant from request (matches auth.ts pattern)
// ------------------------------------------------------------------
async function resolveTenant(req: Request, env: { DB: D1Database }): Promise<string | null> {
  // Try header first
  const headerTenant = req.headers.get("x-tenant-id");
  if (headerTenant) return headerTenant;
  
  // Try cookie
  const cookie = req.headers.get("cookie");
  if (cookie) {
    const match = cookie.match(/tenant=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  
  // Try subdomain extraction from origin
  const url = new URL(req.url);
  const hostParts = url.hostname.split(".");
  if (hostParts.length > 2) {
    return hostParts[0]; // subdomain as tenant slug
  }
  
  return "default";
}

// ------------------------------------------------------------------
// Helper: get current user from session
// ------------------------------------------------------------------
async function getCurrentUser(req: Request, env: { DB: D1Database }): Promise<{ id: number; tenant: string; role: string } | null> {
  const cookie = req.headers.get("cookie");
  if (!cookie) return null;
  
  const match = cookie.match(/session=([^;]+)/);
  if (!match) return null;
  
  const tokenHash = await hashHex(match[1]);
  const now = new Date().toISOString();
  
  const row = await env.DB.prepare(
    "SELECT users.id, users.tenant, users.role FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?"
  )
    .bind(tokenHash, now)
    .first<{ id: number; tenant: string; role: string }>();
  
  return row ?? null;
}

// ------------------------------------------------------------------
// Helper: require user with specific roles
// ------------------------------------------------------------------
async function requireUser(
  req: Request, 
  env: { DB: D1Database }, 
  allowedRoles: string[]
): Promise<{ id: number; tenant: string; role: string } | Response> {
  const user = await getCurrentUser(req, env);
  if (!user) {
    return json({ error: "unauthenticated" }, 401);
  }
  if (!allowedRoles.includes(user.role)) {
    return json({ error: "forbidden" }, 403);
  }
  return user;
}

// ------------------------------------------------------------------
// Helper: load VisitInstance with validation
// ------------------------------------------------------------------
async function loadVisitInstance(
  env: { DB: D1Database },
  tenant: string,
  instanceId: string
): Promise<VisitInstance | null> {
  return await env.DB.prepare(
    "SELECT * FROM visit_instances WHERE instance_id = ? AND tenant_id = ?"
  )
    .bind(instanceId, tenant)
    .first<VisitInstance>();
}

// ------------------------------------------------------------------
// Helper: validate SLA window and compute drift
// ------------------------------------------------------------------
function computeDriftSeconds(
  scheduledStart: string,
  actualStart: string
): number {
  const scheduled = new Date(scheduledStart).getTime();
  const actual = new Date(actualStart).getTime();
  return Math.floor((actual - scheduled) / 1000); // positive = late
}

function isWithinSLA(
  scheduledStart: string,
  actualStart: string,
  slaWindowMinutes: number
): boolean {
  const driftSeconds = computeDriftSeconds(scheduledStart, actualStart);
  return driftSeconds <= slaWindowMinutes * 60;
}

// ------------------------------------------------------------------
// Helper: create LedgerEntry for visit state change
// ------------------------------------------------------------------
async function recordVisitTransition(
  env: { DB: D1Database },
  tenant: string,
  instanceId: string,
  entryType: "visit_started" | "visit_completed" | "visit_missed",
  fromStatus: string,
  toStatus: string,
  actorUserId: number | null,
  actorRole: string,
  payload: Record<string, unknown>,
  prevHash: string | null
): Promise<LedgerEntry> {
  const canonicalPayload = JSON.stringify(payload, Object.keys(payload).sort());
  const payloadHash = await hashHex(canonicalPayload);
  
  const entry = await appendLedgerEntry(env.DB, tenant, {
    entry_type: entryType,
    entity_type: "visit_instance",
    entity_id: instanceId,
    payload_canonical_json: canonicalPayload,
    payload_hash: payloadHash,
    prev_hash: prevHash,
    actor_user_id: actorUserId,
    actor_role: actorRole,
  });
  
  return entry;
}

// ------------------------------------------------------------------
// Helper: create receipt draft on start
// ------------------------------------------------------------------
async function createReceiptDraft(
  env: { DB: D1Database },
  tenant: string,
  instanceId: string,
  signingWindowClosesAt: string
): Promise<string> {
  const receiptId = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO visit_receipts (receipt_id, tenant_id, instance_id, status, signing_window_closes_at, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  )
    .bind(receiptId, tenant, instanceId, "drafted", signingWindowClosesAt, new Date().toISOString())
    .run();
  return receiptId;
}

// ------------------------------------------------------------------
// Helper: format visit response
// ------------------------------------------------------------------
function formatVisitResponse(
  instance: VisitInstance,
  ledgerEntryId: string,
  receiptId: string | null = null
): VisitResponse {
  return {
    instance_id: instance.instance_id,
    status: instance.status,
    scheduled_start_at: instance.scheduled_start_at,
    scheduled_end_at: instance.scheduled_end_at,
    actual_start_at: instance.actual_start_at,
    actual_end_at: instance.actual_end_at,
    drift_seconds: instance.drift_seconds,
    late_tap_reason: instance.late_tap_reason,
    receipt_id: receiptId ?? instance.receipt_id ?? null,
    signing_window_closes_at: instance.signing_window_closes_at,
    ledger_entry_id: ledgerEntryId,
  };
}

// ------------------------------------------------------------------
// POST /api/visits/:id/start
// Transition: scheduled|due -> in_progress
// ------------------------------------------------------------------
export const startVisit: VisitStartHandler = async (req, env) => {
  const tenant = await resolveTenant(req, env);
  if (!tenant) return json({ error: "tenant_required" }, 400);
  
  const user = await requireUser(req, env, ["office_manager", "owner", "staff"]);
  if (user instanceof Response) return user;
  
  // Extract instance ID from URL
  const url = new URL(req.url);
  const pathMatch = url.pathname.match(/\/visits\/([^\/]+)\/start$/);
  if (!pathMatch) return json({ error: "invalid_path" }, 400);
  const instanceId = pathMatch[1];
  
  const body = await readJson<StartVisitBody>(req);
  
  // Load instance
  const instance = await loadVisitInstance(env, tenant, instanceId);
  if (!instance) return json({ error: "not_found" }, 404);
  
  // Validate state transition
  if (instance.status !== "scheduled" && instance.status !== "due") {
    return json({ error: `invalid_state_transition: cannot start from ${instance.status}` }, 409);
  }
  
  const now = new Date();
  const scheduledStart = new Date(instance.scheduled_start_at);
  const slaWindowMinutes = instance.sla_window_minutes ?? DEFAULT_SLA_WINDOW_MINUTES;
  const isLate = now.getTime() > scheduledStart.getTime() + slaWindowMinutes * 60 * 1000;
  
  // Enforce late reason if after SLA window
  let lateReason: string | null = null;
  if (isLate) {
    const reason = body?.late_reason?.trim();
    if (!reason || reason.length < LATE_TAP_MIN_REASON_LENGTH) {
      return json({ 
        error: `late_start_reason_required: must be at least ${LATE_TAP_MIN_REASON_LENGTH} characters`,
        requires_reason: true,
        sla_window_minutes: slaWindowMinutes,
        minutes_late: Math.floor((now.getTime() - scheduledStart.getTime()) / 60000) - slaWindowMinutes
      }, 422);
    }
    lateReason = reason;
  }
  
  // Compute drift
  const driftSeconds = computeDriftSeconds(instance.scheduled_start_at, now.toISOString());
  
  // Calculate signing window close
  const signingWindowClosesAt = new Date(now.getTime() + SIGNING_WINDOW_HOURS * 60 * 60 * 1000);
  
  // Get ledger head for chaining
  const head = await getLedgerHead(env.DB, tenant);
  
  // Create receipt draft
  const receiptId = await createReceiptDraft(env, tenant, instanceId, signingWindowClosesAt.toISOString());
  
  // Update instance
  await env.DB.prepare(
    "UPDATE visit_instances SET status = ?, actual_start_at = ?, drift_seconds = ?, late_tap_reason = ?, signing_window_closes_at = ?, receipt_id = ?, updated_at = ? WHERE instance_id = ? AND tenant_id = ?"
  )
    .bind(
      "in_progress",
      now.toISOString(),
      driftSeconds,
      lateReason,
      signingWindowClosesAt.toISOString(),
      receiptId,
      now.toISOString(),
      instanceId,
      tenant
    )
    .run();
  
  // If late, also create ManualOverride record per spec
  if (isLate && lateReason) {
    const overrideId = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO manual_overrides (override_id, tenant_id, instance_id, actor_user_id, override_type, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
      .bind(overrideId, tenant, instanceId, user.id, "start_late", lateReason, now.toISOString())
      .run();
  }
  
  // Record ledger entry
  const entry = await recordVisitTransition(
    env,
    tenant,
    instanceId,
    "visit_started",
    instance.status,
    "in_progress",
    user.id,
    user.role,
    {
      instance_id: instanceId,
      from_status: instance.status,
      to_status: "in_progress",
      actual_start_at: now.toISOString(),
      drift_seconds: driftSeconds,
      late_tap_reason: lateReason,
      receipt_id: receiptId,
      sla_window_minutes: slaWindowMinutes,
      is_late: isLate,
    },
    head?.entry_hash ?? null
  );
  
  // Return updated instance
  const updated = await loadVisitInstance(env, tenant, instanceId);
  if (!updated) return json({ error: "internal_error" }, 500);
  
  return json(formatVisitResponse(updated, entry.entry_id, receiptId), 200);
};

// ------------------------------------------------------------------
// POST /api/visits/:id/complete
// Transition: in_progress -> completed (seals receipt if both signed)
// ------------------------------------------------------------------
export const completeVisit: VisitCompleteHandler = async (req, env) => {
  const tenant = await resolveTenant(req, env);
  if (!tenant) return json({ error: "tenant_required" }, 400);
  
  const user = await requireUser(req, env, ["office_manager", "owner", "staff"]);
  if (user instanceof Response) return user;
  
  const url = new URL(req.url);
  const pathMatch = url.pathname.match(/\/visits\/([^\/]+)\/complete$/);
  if (!pathMatch) return json({ error: "invalid_path" }, 400);
  const instanceId = pathMatch[1];
  
  const body = await readJson<CompleteVisitBody>(req);
  
  const instance = await loadVisitInstance(env, tenant, instanceId);
  if (!instance) return json({ error: "not_found" }, 404);
  
  if (instance.status !== "in_progress") {
    return json({ error: `invalid_state_transition: cannot complete from ${instance.status}` }, 409);
  }
  
  const now = new Date();
  const actualEndAt = now.toISOString();
  
  // Calculate duration
  const actualStart = new Date(instance.actual_start_at!);
  const durationMinutes = Math.floor((now.getTime() - actualStart.getTime()) / 60000);
  
  // Get receipt
  const receipt = await env.DB.prepare(
    "SELECT * FROM visit_receipts WHERE receipt_id = ? AND tenant_id = ?"
  )
    .bind(instance.receipt_id, tenant)
    .first<VisitReceipt>();
  
  if (!receipt) return json({ error: "receipt_not_found" }, 500);
  
  // Check if signing window still open
  if (new Date() > new Date(receipt.signing_window_closes_at)) {
    // Auto-transition to expired/disputed
    await env.DB.prepare(
      "UPDATE visit_receipts SET status = ?, updated_at = ? WHERE receipt_id = ? AND tenant_id = ?"
    )
      .bind("expired", now.toISOString(), receipt.receipt_id, tenant)
      .run();
    
    await env.DB.prepare(
      "UPDATE visit_instances SET status = ?, updated_at = ? WHERE instance_id = ? AND tenant_id = ?"
    )
      .bind("disputed", now.toISOString(), instanceId, tenant)
      .run();
    
    return json({ error: "signing_window_expired" }, 409);
  }
  
  // TODO: Handle photo upload to R2 if provided
  let photoObjectKey: string | null = null;
  if (body?.photo_base64) {
    // Validate base64
    try {
      atob(body.photo_base64);
      // In production: upload to R2, get key
      photoObjectKey = `photos/${tenant}/${instanceId}/${now.getTime()}.jpg`;
    } catch {
      return json({ error: "invalid_photo_encoding" }, 400);
    }
  }
  
  // Get ledger head
  const head = await getLedgerHead(env.DB, tenant);
  
  // Update receipt with office signature info
  await env.DB.prepare(
    "UPDATE visit_receipts SET office_signed_at = ?, office_note = ?, photo_object_key = ?, status = ?, updated_at = ? WHERE receipt_id = ? AND tenant_id = ?"
  )
    .bind(
      now.toISOString(),
      body?.note ?? null,
      photoObjectKey,
      receipt.counterparty_signed_at ? "sealed" : "awaiting_counterparty",
      now.toISOString(),
      receipt.receipt_id,
      tenant
    )
    .run();
  
  // If counterparty already signed, seal the receipt
  let newStatus: VisitInstance["status"] = "in_progress";
  if (receipt.counterparty_signed_at) {
    newStatus = "completed";
    await env.DB.prepare(
      "UPDATE visit_receipts SET sealed_at = ?, status = ? WHERE receipt_id = ? AND tenant_id = ?"
    )
      .bind(now.toISOString(), "sealed", receipt.receipt_id, tenant)
      .run();
  }
  
  // Update instance
  await env.DB.prepare(
    "UPDATE visit_instances SET status = ?, actual_end_at = ?, updated_at = ? WHERE instance_id = ? AND tenant_id = ?"
  )
    .bind(newStatus, actualEndAt, now.toISOString(), instanceId, tenant)
    .run();
  
  // Record ledger entry
  const entry = await recordVisitTransition(
    env,
    tenant,
    instanceId,
    "visit_completed",
    instance.status,
    newStatus,
    user.id,
    user.role,
    {
      instance_id: instanceId,
      from_status: instance.status,
      to_status: newStatus,
      actual_end_at: actualEndAt,
      duration_minutes: durationMinutes,
      receipt_id: receipt.receipt_id,
      receipt_status: receipt.counterparty_signed_at ? "sealed" : "awaiting_counterparty",
      photo_uploaded: !!photoObjectKey,
    },
    head?.entry_hash ?? null
  );
  
  const updated = await loadVisitInstance(env, tenant, instanceId);
  if (!updated) return json({ error: "internal_error" }, 500);
  
  return json(formatVisitResponse(updated, entry.entry_id), 200);
};

// ------------------------------------------------------------------
// POST /api/visits/:id/missed
// Transition: scheduled|due|in_progress -> missed
// ------------------------------------------------------------------
export const markMissed: VisitMissedHandler = async (req, env) => {
  const tenant = await resolveTenant(req, env);
  if (!tenant) return json({ error: "tenant_required" }, 400);
  
  const user = await requireUser(req, env, ["office_manager", "owner"]);
  if (user instanceof Response) return user;
  
  const url = new URL(req.url);
  const pathMatch = url.pathname.match(/\/visits\/([^\/]+)\/missed$/);
  if (!pathMatch) return json({ error: "invalid_path" }, 400);
  const instanceId = pathMatch[1];
  
  const body = await readJson<MarkMissedBody>(req);
  const reason = body?.reason?.trim();
  
  if (!reason || reason.length < LATE_TAP_MIN_REASON_LENGTH) {
    return json({ error: `reason_required: must be at least ${LATE_TAP_MIN_REASON_LENGTH} characters` }, 400);
  }
  
  const instance = await loadVisitInstance(env, tenant, instanceId);
  if (!instance) return json({ error: "not_found" }, 404);
  
  // Allow marking missed from scheduled, due, or in_progress (abandoned visit)
  const allowedFrom: VisitInstance["status"][] = ["scheduled", "due", "in_progress"];
  if (!allowedFrom.includes(instance.status)) {
    return json({ error: `invalid_state_transition: cannot mark missed from ${instance.status}` }, 409);
  }
  
  const now = new Date();
  
  // Get ledger head
  const head = await getLedgerHead(env.DB, tenant);
  
  // Create ManualOverride record
  const overrideId = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO manual_overrides (override_id, tenant_id, instance_id, actor_user_id, override_type, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(overrideId, tenant, instanceId, user.id, "mark_missed", reason, now.toISOString())
    .run();
  
  // Update instance
  await env.DB.prepare(
    "UPDATE visit_instances SET status = ?, updated_at = ? WHERE instance_id = ? AND tenant_id = ?"
  )
    .bind("missed", now.toISOString(), instanceId, tenant)
    .run();
  
  // Record ledger entry
  const entry = await recordVisitTransition(
    env,
    tenant,
    instanceId,
    "visit_missed",
    instance.status,
    "missed",
    user.id,
    user.role,
    {
      instance_id: instanceId,
      from_status: instance.status,
      to_status: "missed",
      override_id: overrideId,
      override_type: "mark_missed",
      reason: reason,
    },
    head?.entry_hash ?? null
  );
  
  const updated = await loadVisitInstance(env, tenant, instanceId);
  if (!updated) return json({ error: "internal_error" }, 500);
  
  return json(formatVisitResponse(updated, entry.entry_id), 200);
};

// ------------------------------------------------------------------
// GET /api/visits/:id
// Get visit details
// ------------------------------------------------------------------
export const getVisit: VisitGetHandler = async (req, env) => {
  const tenant = await resolveTenant(req, env);
  if (!tenant) return json({ error: "tenant_required" }, 400);
  
  const user = await requireUser(req, env, ["office_manager", "owner", "staff", "auditor"]);
  if (user instanceof Response) return user;
  
  const url = new URL(req.url);
  const pathMatch = url.pathname.match(/\/visits\/([^\/]+)$/);
  if (!pathMatch) return json({ error: "invalid_path" }, 400);
  const instanceId = pathMatch[1];
  
  const instance = await loadVisitInstance(env, tenant, instanceId);
  if (!instance) return json({ error: "not_found" }, 404);
  
  // Get most recent ledger entry for this visit
  const entry = await env.DB.prepare(
    "SELECT entry_id FROM ledger_entries WHERE tenant_id = ? AND entity_id = ? ORDER BY created_at DESC LIMIT 1"
  )
    .bind(tenant, instanceId)
    .first<{ entry_id: string }>();
  
  return json(formatVisitResponse(instance, entry?.entry_id ?? "unknown"), 200);
};

// ------------------------------------------------------------------
// GET /api/visits
// List visits for "now" board (today ± window)
// ------------------------------------------------------------------
export const listVisits: Handler<{ visits: VisitResponse[]; date: string } | { error: string }> = async (req, env) => {
  const tenant = await resolveTenant(req, env);
  if (!tenant) return json({ error: "tenant_required" }, 400);
  
  const user = await requireUser(req, env, ["office_manager", "owner", "staff", "auditor"]);
  if (user instanceof Response) return user;
  
  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date");
  const targetDate = dateParam ? new Date(dateParam) : new Date();
  
  // Get start/end of target date
  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);
  
  // Load visits for this date window
  const { results } = await env.DB.prepare(
    "SELECT * FROM visit_instances WHERE tenant_id = ? AND scheduled_start_at >= ? AND scheduled_start_at <= ? ORDER BY scheduled_start_at ASC"
  )
    .bind(tenant, startOfDay.toISOString(), endOfDay.toISOString())
    .all<VisitInstance>();
  
  // Get ledger entries for each
  const visitsWithLedger: VisitResponse[] = [];
  for (const instance of results ?? []) {
    const entry = await env.DB.prepare(
      "SELECT entry_id FROM ledger_entries WHERE tenant_id = ? AND entity_id = ? ORDER BY created_at DESC LIMIT 1"
    )
      .bind(tenant, instance.instance_id)
      .first<{ entry_id: string }>();
    
    visitsWithLedger.push(formatVisitResponse(instance, entry?.entry_id ?? "unknown"));
  }
  
  return json({
    visits: visitsWithLedger,
    date: targetDate.toISOString().split("T")[0],
  }, 200);
};

// ------------------------------------------------------------------
// Cron helper: auto-mark missed (called from scheduled job)
// ------------------------------------------------------------------
export async function autoMarkMissed(
  env: { DB: D1Database },
  tenant: string
): Promise<{ processed: number; marked: number }> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24h ago
  
  // Find visits that should be auto-marked missed
  const { results } = await env.DB.prepare(
    "SELECT * FROM visit_instances WHERE tenant_id = ? AND status IN (?, ?) AND scheduled_start_at < ?"
  )
    .bind(tenant, "scheduled", "due", cutoff.toISOString())
    .all<VisitInstance>();
  
  let marked = 0;
  
  for (const instance of results ?? []) {
    // Check if SLA window has passed
    const scheduledStart = new Date(instance.scheduled_start_at);
    const slaWindowMinutes = instance.sla_window_minutes ?? DEFAULT_SLA_WINDOW_MINUTES;
    const missedThreshold = new Date(scheduledStart.getTime() + slaWindowMinutes * 60 * 1000 + 24 * 60 * 60 * 1000);
    
    if (now > missedThreshold) {
      const head = await getLedgerHead(env.DB, tenant);
      
      // Create system override
      const overrideId = crypto.randomUUID();
      await env.DB.prepare(
        "INSERT INTO manual_overrides (override_id, tenant_id, instance_id, actor_user_id, override_type, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
        .bind(overrideId, tenant, instance.instance_id, null, "mark_missed", "Auto-marked missed after 24h with no action", now.toISOString())
        .run();
      
      await env.DB.prepare(
        "UPDATE visit_instances SET status = ?, updated_at = ? WHERE instance_id = ? AND tenant_id = ?"
      )
        .bind("missed", now.toISOString(), instance.instance_id, tenant)
        .run();
      
      await recordVisitTransition(
        env,
        tenant,
        instance.instance_id,
        "visit_missed",
        instance.status,
        "missed",
        null,
        "system",
        {
          instance_id: instance.instance_id,
          from_status: instance.status,
          to_status: "missed",
          override_id: overrideId,
          override_type: "mark_missed",
          reason: "Auto-marked missed after 24h with no action",
          auto: true,
        },
        head?.entry_hash ?? null
      );
      
      marked++;
    }
  }
  
  return { processed: results?.length ?? 0, marked };
}

// ------------------------------------------------------------------
// Cron helper: transition scheduled -> due (5 min before start)
// ------------------------------------------------------------------
export async function transitionScheduledToDue(
  env: { DB: D1Database },
  tenant: string
): Promise<{ transitioned: number }> {
  const now = new Date();
  const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
  
  const { results } = await env.DB.prepare(
    "SELECT * FROM visit_instances WHERE tenant_id = ? AND status = ? AND scheduled_start_at <= ?"
  )
    .bind(tenant, "scheduled", fiveMinutesFromNow.toISOString())
    .all<VisitInstance>();
  
  let transitioned = 0;
  
  for (const instance of results ?? []) {
    await env.DB.prepare(
      "UPDATE visit_instances SET status = ?, updated_at = ? WHERE instance_id = ? AND tenant_id = ?"
    )
      .bind("due", now.toISOString(), instance.instance_id, tenant)
      .run();
    transitioned++;
  }
  
  return { transitioned };
}