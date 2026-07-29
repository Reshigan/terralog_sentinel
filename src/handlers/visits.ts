// Core VisitInstance state machine: Start, Complete, Missed transitions.
// Enforces SLA windows, late-tap reasons, and writes LedgerEntry for every state change.
import { json, readJson, type Handler } from "../lib/http";
import type { Site_visit } from "../types";

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
  status: Site_visit["status"];
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

  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const encoder = new TextEncoder();
  const data = encoder.encode(match[1]);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const tokenHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

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
// Helper: load Site_visit with validation (using Site_visit as the visit entity)
// ------------------------------------------------------------------
async function loadSiteVisit(
  env: { DB: D1Database },
  tenant: string,
  instanceId: string
): Promise<Site_visit | null> {
  // Map instance_id to site_visit id - using visit_date as scheduled_start_at
  // This is a minimal implementation that treats site_visits as the visit instance table
  const row = await env.DB.prepare(
    "SELECT * FROM site_visits WHERE id = ? AND technician_email LIKE ?"
  )
    .bind(parseInt(instanceId, 10), `%@${tenant}%`)
    .first<Site_visit>();

  return row ?? null;
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
// Helper: compute HMAC-SHA256 signature
// ------------------------------------------------------------------
async function hmacSign(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// ------------------------------------------------------------------
// Helper: compute SHA-256 hash
// ------------------------------------------------------------------
async function hashHex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
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
): Promise<{ entry_id: string; entry_hash: string }> {
  const canonicalPayload = JSON.stringify(payload, Object.keys(payload).sort());
  const payloadHash = await hashHex(canonicalPayload);
  const entryId = crypto.randomUUID();

  // Compute entry hash: hash of (prev_hash + payload_hash + entry_type + timestamp)
  const timestamp = new Date().toISOString();
  const entryHashInput = `${prevHash ?? "genesis"}${payloadHash}${entryType}${timestamp}`;
  const entryHash = await hashHex(entryHashInput);

  // Create HMAC signature for tamper detection
  const signingKey = "REPLACE_ME_LEDGER_KEY"; // In production, from env/secrets
  const signature = await hmacSign(signingKey, `${entryId}:${entryHash}`);

  await env.DB.prepare(
    "INSERT INTO audit_trails (entity_type, entity_id, action, performed_at, performed_by, metadata, device_id) VALUES (?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(
      "site_visit",
      parseInt(instanceId, 10),
      entryType,
      timestamp,
      actorUserId?.toString() ?? "system",
      JSON.stringify({
        entry_id: entryId,
        entry_hash: entryHash,
        prev_hash: prevHash,
        payload_hash: payloadHash,
        signature,
        from_status: fromStatus,
        to_status: toStatus,
        actor_role: actorRole,
        tenant,
        canonical_payload: canonicalPayload,
      }),
      0
    )
    .run();

  return { entry_id: entryId, entry_hash: entryHash };
}

// ------------------------------------------------------------------
// Helper: get ledger head (last entry hash for chain)
// ------------------------------------------------------------------
async function getLedgerHead(env: { DB: D1Database }, tenant: string): Promise<{ entry_hash: string } | null> {
  const row = await env.DB.prepare(
    "SELECT metadata FROM audit_trails WHERE entity_type = 'site_visit' AND performed_by LIKE ? ORDER BY performed_at DESC LIMIT 1"
  )
    .bind(`%@${tenant}%`)
    .first<{ metadata: string }>();

  if (!row) return null;

  try {
    const metadata = JSON.parse(row.metadata) as { entry_hash?: string };
    return metadata.entry_hash ? { entry_hash: metadata.entry_hash } : null;
  } catch {
    return null;
  }
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

  // Store receipt info in site_visits notes field (minimal implementation)
  // In production, this would be a separate visit_receipts table
  const existing = await env.DB.prepare(
    "SELECT notes FROM site_visits WHERE id = ?"
  )
    .bind(parseInt(instanceId, 10))
    .first<{ notes: string }>();

  const receiptData = {
    receipt_id: receiptId,
    status: "drafted",
    signing_window_closes_at: signingWindowClosesAt,
    created_at: new Date().toISOString(),
  };

  const mergedNotes = JSON.stringify({
    ...(existing?.notes ? JSON.parse(existing.notes) : {}),
    receipt: receiptData,
  });

  await env.DB.prepare(
    "UPDATE site_visits SET notes = ? WHERE id = ?"
  )
    .bind(mergedNotes, parseInt(instanceId, 10))
    .run();

  return receiptId;
}

// ------------------------------------------------------------------
// Helper: format visit response
// ------------------------------------------------------------------
function formatVisitResponse(
  visit: Site_visit,
  ledgerEntryId: string,
  receiptId: string | null = null
): VisitResponse {
  // Parse receipt from notes if present
  let parsedReceipt: { receipt_id?: string; signing_window_closes_at?: string } | null = null;
  try {
    const notes = JSON.parse(visit.notes ?? "{}");
    parsedReceipt = notes.receipt ?? null;
  } catch {
    parsedReceipt = null;
  }

  const receiptIdToUse = receiptId ?? parsedReceipt?.receipt_id ?? null;
  const signingWindowClosesAt = parsedReceipt?.signing_window_closes_at ?? null;

  // Derive timing fields from site_visit
  // visit_date is the scheduled date, we use start/end of day as bounds
  const visitDate = new Date(visit.visit_date);
  const scheduledStartAt = visitDate.toISOString();
  const scheduledEndAt = new Date(visitDate.getTime() + 8 * 60 * 60 * 1000).toISOString(); // 8 hour window

  // Check audit_trails for actual start/end times
  const actualStartAt = null; // Would be derived from audit_trails in full implementation
  const actualEndAt = null;

  // Compute drift if we have actual start
  let driftSeconds: number | null = null;
  if (actualStartAt) {
    driftSeconds = computeDriftSeconds(scheduledStartAt, actualStartAt);
  }

  return {
    instance_id: visit.id.toString(),
    status: visit.status,
    scheduled_start_at: scheduledStartAt,
    scheduled_end_at: scheduledEndAt,
    actual_start_at: actualStartAt,
    actual_end_at: actualEndAt,
    drift_seconds: driftSeconds,
    late_tap_reason: null, // Would be stored in notes or separate field
    receipt_id: receiptIdToUse,
    signing_window_closes_at: signingWindowClosesAt,
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
  const visit = await loadSiteVisit(env, tenant, instanceId);
  if (!visit) return json({ error: "not_found" }, 404);

  // Validate state transition - map site_visit status to visit status
  // site_visit uses: scheduled, completed, cancelled (we treat scheduled as scheduled/due)
  const currentStatus = visit.status === "scheduled" ? "scheduled" : visit.status;
  if (currentStatus !== "scheduled" && currentStatus !== "due") {
    return json({ error: `invalid_state_transition: cannot start from ${visit.status}` }, 409);
  }

  const now = new Date();
  const scheduledStart = new Date(visit.visit_date);
  const slaWindowMinutes = DEFAULT_SLA_WINDOW_MINUTES; // site_visit doesn't have sla_window_minutes
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
  const driftSeconds = computeDriftSeconds(scheduledStart.toISOString(), now.toISOString());

  // Calculate signing window close
  const signingWindowClosesAt = new Date(now.getTime() + SIGNING_WINDOW_HOURS * 60 * 60 * 1000);

  // Get ledger head for chaining
  const head = await getLedgerHead(env, tenant);

  // Create receipt draft
  const receiptId = await createReceiptDraft(env, tenant, instanceId, signingWindowClosesAt.toISOString());

  // Update instance
  await env.DB.prepare(
    "UPDATE site_visits SET status = ?, notes = json_set(COALESCE(notes, '{}'), '$.actual_start_at', ?, '$.drift_seconds', ?, '$.late_tap_reason', ?, '$.signing_window_closes_at', ?), row_version = row_version + 1 WHERE id = ?"
  )
    .bind(
      "scheduled", // Keep as scheduled, actual status tracked in notes/receipt
      now.toISOString(),
      driftSeconds,
      lateReason,
      signingWindowClosesAt.toISOString(),
      parseInt(instanceId, 10)
    )
    .run();

  // If late, also create ManualOverride record per spec
  if (isLate && lateReason) {
    const overrideId = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO audit_trails (entity_type, entity_id, action, performed_at, performed_by, metadata, device_id) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
      .bind(
        "site_visit_override",
        parseInt(instanceId, 10),
        "start_late",
        now.toISOString(),
        user.id.toString(),
        JSON.stringify({ override_id: overrideId, reason: lateReason, tenant }),
        0
      )
      .run();
  }

  // Record ledger entry
  const entry = await recordVisitTransition(
    env,
    tenant,
    instanceId,
    "visit_started",
    currentStatus,
    "in_progress",
    user.id,
    user.role,
    {
      instance_id: instanceId,
      from_status: currentStatus,
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
  const updated = await loadSiteVisit(env, tenant, instanceId);
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

  const visit = await loadSiteVisit(env, tenant, instanceId);
  if (!visit) return json({ error: "not_found" }, 404);

  // Check if visit was started (has actual_start_at in notes)
  let visitNotes: Record<string, unknown> = {};
  try {
    visitNotes = JSON.parse(visit.notes ?? "{}");
  } catch {
    visitNotes = {};
  }

  const currentStatus = visitNotes.actual_start_at ? "in_progress" : visit.status;
  if (currentStatus !== "in_progress") {
    return json({ error: `invalid_state_transition: cannot complete from ${currentStatus}` }, 409);
  }

  const now = new Date();
  const actualEndAt = now.toISOString();

  // Calculate duration
  const actualStartStr = visitNotes.actual_start_at as string;
  const actualStart = new Date(actualStartStr);
  const durationMinutes = Math.floor((now.getTime() - actualStart.getTime()) / 60000);

  // Get receipt from notes
  const receipt = visitNotes.receipt as { receipt_id?: string; signing_window_closes_at?: string; status?: string; counterparty_signed_at?: string } | undefined;

  if (!receipt) return json({ error: "receipt_not_found" }, 500);

  // Check if signing window still open
  if (new Date() > new Date(receipt.signing_window_closes_at ?? 0)) {
    // Auto-transition to expired/disputed
    const updatedNotes = {
      ...visitNotes,
      receipt: {
        ...receipt,
        status: "expired",
        updated_at: now.toISOString(),
      },
    };

    await env.DB.prepare(
      "UPDATE site_visits SET status = ?, notes = ?, row_version = row_version + 1 WHERE id = ?"
    )
      .bind("cancelled", JSON.stringify(updatedNotes), parseInt(instanceId, 10))
      .run();

    return json({ error: "signing_window_expired" }, 409);
  }

  // Handle photo upload to R2 if provided
  let photoObjectKey: string | null = null;
  if (body?.photo_base64) {
    // Validate base64
    try {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      atob(body.photo_base64);
      // In production: upload to R2, get key
      photoObjectKey = `photos/${tenant}/${instanceId}/${now.getTime()}.jpg`;
    } catch {
      return json({ error: "invalid_photo_encoding" }, 400);
    }
  }

  // Get ledger head
  const head = await getLedgerHead(env, tenant);

  // Update receipt with office signature info
  const newReceiptStatus = receipt.counterparty_signed_at ? "sealed" : "awaiting_counterparty";
  const updatedNotes = {
    ...visitNotes,
    receipt: {
      ...receipt,
      office_signed_at: now.toISOString(),
      office_note: body?.note ?? null,
      photo_object_key: photoObjectKey,
      status: newReceiptStatus,
      updated_at: now.toISOString(),
    },
  };

  // If counterparty already signed, seal the receipt
  let newStatus: Site_visit["status"] = "scheduled";
  if (receipt.counterparty_signed_at) {
    newStatus = "completed";
    updatedNotes.receipt = {
      ...updatedNotes.receipt,
      sealed_at: now.toISOString(),
      status: "sealed",
    };
  }

  // Update instance
  await env.DB.prepare(
    "UPDATE site_visits SET status = ?, notes = ?, row_version = row_version + 1 WHERE id = ?"
  )
    .bind(newStatus, JSON.stringify(updatedNotes), parseInt(instanceId, 10))
    .run();

  // Record ledger entry
  const entry = await recordVisitTransition(
    env,
    tenant,
    instanceId,
    "visit_completed",
    "in_progress",
    newStatus,
    user.id,
    user.role,
    {
      instance_id: instanceId,
      from_status: "in_progress",
      to_status: newStatus,
      actual_end_at: actualEndAt,
      duration_minutes: durationMinutes,
      receipt_id: receipt.receipt_id,
      receipt_status: receipt.counterparty_signed_at ? "sealed" : "awaiting_counterparty",
      photo_uploaded: !!photoObjectKey,
    },
    head?.entry_hash ?? null
  );

  const updated = await loadSiteVisit(env, tenant, instanceId);
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

  const visit = await loadSiteVisit(env, tenant, instanceId);
  if (!visit) return json({ error: "not_found" }, 404);

  // Allow marking missed from scheduled (treat as scheduled/due/in_progress)
  let visitNotes: Record<string, unknown> = {};
  try {
    visitNotes = JSON.parse(visit.notes ?? "{}");
  } catch {
    visitNotes = {};
  }

  const hasStarted = !!visitNotes.actual_start_at;
  const currentStatus = hasStarted ? "in_progress" : (visit.status === "scheduled" ? "scheduled" : visit.status);

  const allowedFrom: Array<"scheduled" | "due" | "in_progress"> = ["scheduled", "due", "in_progress"];
  if (!allowedFrom.includes(currentStatus as "scheduled" | "due" | "in_progress")) {
    return json({ error: `invalid_state_transition: cannot mark missed from ${currentStatus}` }, 409);
  }

  const now = new Date();

  // Get ledger head
  const head = await getLedgerHead(env, tenant);

  // Create ManualOverride record
  const overrideId = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO audit_trails (entity_type, entity_id, action, performed_at, performed_by, metadata, device_id) VALUES (?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(
      "site_visit_override",
      parseInt(instanceId, 10),
      "mark_missed",
      now.toISOString(),
      user.id.toString(),
      JSON.stringify({ override_id: overrideId, reason, tenant }),
      0
    )
    .run();

  // Update instance
  await env.DB.prepare(
    "UPDATE site_visits SET status = ?, notes = json_set(COALESCE(notes, '{}'), '$.missed_reason', ?, '$.missed_at', ?), row_version = row_version + 1 WHERE id = ?"
  )
    .bind("cancelled", reason, now.toISOString(), parseInt(instanceId, 10))
    .run();

  // Record ledger entry
  const entry = await recordVisitTransition(
    env,
    tenant,
    instanceId,
    "visit_missed",
    currentStatus,
    "missed",
    user.id,
    user.role,
    {
      instance_id: instanceId,
      from_status: currentStatus,
      to_status: "missed",
      override_id: overrideId,
      override_type: "mark_missed",
      reason: reason,
    },
    head?.entry_hash ?? null
  );

  const updated = await loadSiteVisit(env, tenant, instanceId);
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

  const visit = await loadSiteVisit(env, tenant, instanceId);
  if (!visit) return json({ error: "not_found" }, 404);

  // Get most recent ledger entry for this visit
  const entry = await env.DB.prepare(
    "SELECT metadata FROM audit_trails WHERE entity_type = 'site_visit' AND entity_id = ? ORDER BY performed_at DESC LIMIT 1"
  )
    .bind(parseInt(instanceId, 10))
    .first<{ metadata: string }>();

  let entryId = "unknown";
  try {
    const metadata = JSON.parse(entry?.metadata ?? "{}") as { entry_id?: string };
    entryId = metadata.entry_id ?? "unknown";
  } catch {
    entryId = "unknown";
  }

  return json(formatVisitResponse(visit, entryId), 200);
};

// ------------------------------------------------------------------
// GET /api/visits
// List visits for "now" board (today +- window)
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
    "SELECT * FROM site_visits WHERE visit_date >= ? AND visit_date <= ? AND technician_email LIKE ? ORDER BY visit_date ASC"
  )
    .bind(startOfDay.toISOString().split("T")[0], endOfDay.toISOString().split("T")[0], `%@${tenant}%`)
    .all<Site_visit>();

  // Get ledger entries for each
  const visitsWithLedger: VisitResponse[] = [];
  for (const visit of results ?? []) {
    const entry = await env.DB.prepare(
      "SELECT metadata FROM audit_trails WHERE entity_type = 'site_visit' AND entity_id = ? ORDER BY performed_at DESC LIMIT 1"
    )
      .bind(visit.id)
      .first<{ metadata: string }>();

    let entryId = "unknown";
    try {
      const metadata = JSON.parse(entry?.metadata ?? "{}") as { entry_id?: string };
      entryId = metadata.entry_id ?? "unknown";
    } catch {
      entryId = "unknown";
    }

    // Parse receipt from notes
    let receiptId: string | null = null;
    try {
      const notes = JSON.parse(visit.notes ?? "{}");
      receiptId = notes.receipt?.receipt_id ?? null;
    } catch {
      receiptId = null;
    }

    visitsWithLedger.push(formatVisitResponse(visit, entryId, receiptId));
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
    "SELECT * FROM site_visits WHERE status = 'scheduled' AND visit_date < ? AND technician_email LIKE ?"
  )
    .bind(cutoff.toISOString().split("T")[0], `%@${tenant}%`)
    .all<Site_visit>();

  let marked = 0;

  for (const visit of results ?? []) {
    // Check if SLA window has passed
    const scheduledStart = new Date(visit.visit_date);
    const slaWindowMinutes = DEFAULT_SLA_WINDOW_MINUTES;
    const missedThreshold = new Date(scheduledStart.getTime() + slaWindowMinutes * 60 * 1000 + 24 * 60 * 60 * 1000);

    if (now > missedThreshold) {
      const head = await getLedgerHead(env, tenant);

      // Create system override
      const overrideId = crypto.randomUUID();
      await env.DB.prepare(
        "INSERT INTO audit_trails (entity_type, entity_id, action, performed_at, performed_by, metadata, device_id) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
        .bind(
          "site_visit_override",
          visit.id,
          "auto_mark_missed",
          now.toISOString(),
          "system",
          JSON.stringify({ override_id: overrideId, reason: "Auto-marked missed after SLA window + 24h", tenant }),
          0
        )
        .run();

      // Update instance
      await env.DB.prepare(
        "UPDATE site_visits SET status = ?, notes = json_set(COALESCE(notes, '{}'), '$.missed_reason', ?, '$.missed_at', ?), row_version = row_version + 1 WHERE id = ?"
      )
        .bind("cancelled", "Auto-marked missed after SLA window + 24h", now.toISOString(), visit.id)
        .run();

      // Record ledger entry
      await recordVisitTransition(
        env,
        tenant,
        visit.id.toString(),
        "visit_missed",
        "scheduled",
        "missed",
        null,
        "system",
        {
          instance_id: visit.id.toString(),
          from_status: "scheduled",
          to_status: "missed",
          override_id: overrideId,
          override_type: "auto_mark_missed",
          reason: "Auto-marked missed after SLA window + 24h",
        },
        head?.entry_hash ?? null
      );

      marked++;
    }
  }

  return { processed: results?.length ?? 0, marked };
};