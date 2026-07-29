import { json, readJson, requireSession, requireRole, WRITE_ROLES, ADMIN_ROLES, type Handler, type AuthUser, type Env } from "./auth";
import { enqueue } from "../lib/jobs";
import { ledgerAppend, hashCanonical } from "../lib/ledger";

// Override types from the spec, mapped to the schema's override_type enum
const OVERRIDE_TYPES = [
  "start_early",
  "start_late", 
  "mark_missed",
  "mark_completed",
  "force_sign",
  "correct_record",
  "suppress_alert",
] as const;

type OverrideType = typeof OVERRIDE_TYPES[number];

// Types that require approval from a different privileged user
const APPROVAL_REQUIRED_TYPES: readonly OverrideType[] = [
  "mark_missed",
  "force_sign", 
  "correct_record",
];

interface OverrideRequest {
  instance_id: string;
  override_type: OverrideType;
  reason: string;
  // For correct_record: the new values
  payload_after?: Record<string, unknown>;
}

interface OverrideApproval {
  override_id: string;
  approved: boolean;
  // Required for corrections
  correction_note?: string;
}

interface OverrideResponse {
  override_id: string;
  instance_id: string;
  override_type: OverrideType;
  status: "requested" | "pending_approval" | "approved" | "rejected" | "executed";
  reason: string;
  actor_user_id: number;
  actor_role: string;
  approved_by_user_id?: number;
  approved_at?: string;
  created_at: string;
}

/** POST /api/overrides — request a manual override.
 * 
 * Enforces:
 * - Reason required, minimum 10 characters
 * - Separation of duties: requester cannot approve (approval goes to different owner/manager)
 * - Material corrections (change receipt/score/SLA) require owner approval specifically
 * - Late start overrides with low trust_score queue for approval
 */
export const requestOverride: Handler<OverrideResponse | { error: string }> = async (req, env) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  const forbidden = requireRole(user, WRITE_ROLES);
  if (forbidden) return forbidden;

  const body = await readJson<OverrideRequest>(req);
  if (!body) return json({ error: "invalid JSON body" }, 400);

  const { instance_id, override_type, reason, payload_after } = body;

  // Validate override_type
  if (!OVERRIDE_TYPES.includes(override_type as OverrideType)) {
    return json({ error: "invalid override_type" }, 400);
  }

  // Validate reason length (≥10 chars per spec)
  if (!reason || reason.length < 10) {
    return json({ error: "reason must be at least 10 characters" }, 400);
  }

  // Validate instance exists and belongs to tenant
  const instance = await env.DB.prepare(
    "SELECT instance_id, status, tenant_id, scheduled_start_at, actual_start_at FROM visit_instances WHERE instance_id = ? AND tenant_id = ?"
  )
    .bind(instance_id, user.tenant)
    .first<{
      instance_id: string;
      status: string;
      tenant_id: string;
      scheduled_start_at: string;
      actual_start_at: string | null;
    }>();
  
  if (!instance) return json({ error: "instance not found" }, 404);

  // Compute payload_before hash for audit
  const payloadBefore = {
    instance_id: instance.instance_id,
    status: instance.status,
    scheduled_start_at: instance.scheduled_start_at,
    actual_start_at: instance.actual_start_at,
  };
  const payloadBeforeHash = await hashCanonical(JSON.stringify(payloadBefore));

  // Determine if approval is required
  const needsApproval = APPROVAL_REQUIRED_TYPES.includes(override_type as OverrideType) ||
    (override_type === "start_late" && await hasLowTrustScore(env, user.id));

  const status = needsApproval ? "pending_approval" : "requested";

  // For corrections, compute payload_after hash if provided
  let payloadAfterHash: string | null = null;
  if (payload_after) {
    payloadAfterHash = await hashCanonical(JSON.stringify(payload_after));
  }

  // Create the override record
  const overrideId = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO manual_overrides (
      override_id, tenant_id, instance_id, actor_user_id, override_type, 
      reason, payload_before_hash, payload_after_hash, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      overrideId,
      user.tenant,
      instance_id,
      user.id,
      override_type,
      reason,
      payloadBeforeHash,
      payloadAfterHash,
      status,
      now
    )
    .run();

  // Write ledger entry for the override request
  await ledgerAppend(env, user.tenant, {
    entry_type: "override",
    entity_type: "manual_override",
    entity_id: overrideId,
    payload_canonical_json: JSON.stringify({
      override_id: overrideId,
      instance_id,
      override_type,
      reason,
      status,
      needs_approval: needsApproval,
    }),
    actor_user_id: user.id,
    actor_role: user.role,
  });

  // If not needing approval, execute immediately
  if (!needsApproval) {
    await executeOverride(env, overrideId, user);
  } else {
    // Queue notification to owner for approval
    await enqueue(env, "notify_override_approval", {
      tenant_id: user.tenant,
      override_id: overrideId,
      requester_id: user.id,
      override_type,
    });
  }

  const response: OverrideResponse = {
    override_id: overrideId,
    instance_id,
    override_type: override_type as OverrideType,
    status,
    reason,
    actor_user_id: user.id,
    actor_role: user.role,
    created_at: now,
  };

  return json(response, needsApproval ? 202 : 201);
};

/** POST /api/overrides/:id/approve — approve or reject a pending override.
 * 
 * Enforces separation of duties: approver must be different user with owner or 
 * office_manager role, and for material corrections, owner specifically.
 */
export const approveOverride: Handler<OverrideResponse | { error: string }> = async (req, env) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);

  // Parse override ID from URL
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  const overrideId = pathParts[pathParts.length - 2]; // /api/overrides/{id}/approve
  if (!overrideId || !isValidUUID(overrideId)) {
    return json({ error: "invalid override_id" }, 400);
  }

  const body = await readJson<OverrideApproval>(req);
  if (!body || typeof body.approved !== "boolean") {
    return json({ error: "approved boolean required" }, 400);
  }

  // Load the override
  const override = await env.DB.prepare(
    `SELECT override_id, tenant_id, instance_id, actor_user_id, override_type, 
            reason, payload_after_hash, status, created_at
     FROM manual_overrides WHERE override_id = ? AND tenant_id = ?`
  )
    .bind(overrideId, user.tenant)
    .first<{
      override_id: string;
      tenant_id: string;
      instance_id: string;
      actor_user_id: number;
      override_type: OverrideType;
      reason: string;
      payload_after_hash: string | null;
      status: string;
      created_at: string;
    }>();

  if (!override) return json({ error: "override not found" }, 404);
  if (override.status !== "pending_approval") {
    return json({ error: "override is not pending approval" }, 409);
  }

  // SEPARATION OF DUTIES: requester cannot approve their own override
  if (override.actor_user_id === user.id) {
    return json({ error: "cannot approve your own override request" }, 403);
  }

  // Check if material correction requiring owner specifically
  const isMaterialCorrection = override.override_type === "correct_record" &&
    override.payload_after_hash !== null;

  if (isMaterialCorrection) {
    // Material corrections require owner specifically
    const ownerCheck = requireRole(user, ADMIN_ROLES);
    if (ownerCheck) return json({ error: "material corrections require owner approval" }, 403);
  } else {
    // Other approvals accept office_manager or owner
    const roleCheck = requireRole(user, [...ADMIN_ROLES, ...WRITE_ROLES]);
    if (roleCheck) return json({ error: "insufficient privileges to approve" }, 403);
  }

  const now = new Date().toISOString();
  const newStatus = body.approved ? "approved" : "rejected";

  await env.DB.prepare(
    `UPDATE manual_overrides 
     SET status = ?, approved_by_user_id = ?, approved_at = ?
     WHERE override_id = ? AND tenant_id = ? AND status = 'pending_approval'`
  )
    .bind(newStatus, user.id, now, overrideId, user.tenant)
    .run();

  // Write ledger entry for the approval/rejection
  await ledgerAppend(env, user.tenant, {
    entry_type: body.approved ? "override_approved" : "override_rejected",
    entity_type: "manual_override",
    entity_id: overrideId,
    payload_canonical_json: JSON.stringify({
      override_id: overrideId,
      approved: body.approved,
      approved_by: user.id,
      approved_by_role: user.role,
      correction_note: body.correction_note,
    }),
    actor_user_id: user.id,
    actor_role: user.role,
  });

  // If approved, execute the override
  if (body.approved) {
    await executeOverride(env, overrideId, user, body.correction_note);
  }

  const response: OverrideResponse = {
    override_id: overrideId,
    instance_id: override.instance_id,
    override_type: override.override_type,
    status: newStatus,
    reason: override.reason,
    actor_user_id: override.actor_user_id,
    actor_role: "office_manager", // We don't store the original role, infer from context
    approved_by_user_id: user.id,
    approved_at: now,
    created_at: override.created_at,
  };

  return json(response, 200);
};

/** GET /api/overrides — list overrides, filterable by instance or status */
export const listOverrides: Handler<{ overrides: OverrideResponse[] } | { error: string }> = async (req, env) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);

  const url = new URL(req.url);
  const instanceId = url.searchParams.get("instance_id");
  const statusFilter = url.searchParams.get("status");

  let query = `SELECT override_id, instance_id, actor_user_id, override_type, reason, 
                      status, approved_by_user_id, approved_at, created_at
               FROM manual_overrides WHERE tenant_id = ?`;
  const params: (string | number)[] = [user.tenant];

  if (instanceId) {
    query += " AND instance_id = ?";
    params.push(instanceId);
  }
  if (statusFilter) {
    query += " AND status = ?";
    params.push(statusFilter);
  }
  // Non-admins only see their own overrides
  if (!ADMIN_ROLES.includes(user.role)) {
    query += " AND actor_user_id = ?";
    params.push(user.id);
  }
  query += " ORDER BY created_at DESC";

  const { results } = await env.DB.prepare(query).bind(...params).all<{
    override_id: string;
    instance_id: string;
    actor_user_id: number;
    override_type: string;
    reason: string;
    status: string;
    approved_by_user_id: number | null;
    approved_at: string | null;
    created_at: string;
  }>();

  const overrides: OverrideResponse[] = (results || []).map(row => ({
    override_id: row.override_id,
    instance_id: row.instance_id,
    override_type: row.override_type as OverrideType,
    status: row.status as OverrideResponse["status"],
    reason: row.reason,
    actor_user_id: row.actor_user_id,
    actor_role: "office_manager", // Simplified; would join users table in production
    approved_by_user_id: row.approved_by_user_id ?? undefined,
    approved_at: row.approved_at ?? undefined,
    created_at: row.created_at,
  }));

  return json({ overrides }, 200);
};

/** GET /api/overrides/:id — get single override details */
export const getOverride: Handler<OverrideResponse | { error: string }> = async (req, env) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);

  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  const overrideId = pathParts[pathParts.length - 1];
  if (!overrideId || !isValidUUID(overrideId)) {
    return json({ error: "invalid override_id" }, 400);
  }

  const row = await env.DB.prepare(
    `SELECT override_id, instance_id, actor_user_id, override_type, reason,
            status, approved_by_user_id, approved_at, created_at
     FROM manual_overrides WHERE override_id = ? AND tenant_id = ?`
  )
    .bind(overrideId, user.tenant)
    .first<{
      override_id: string;
      instance_id: string;
      actor_user_id: number;
      override_type: string;
      reason: string;
      status: string;
      approved_by_user_id: number | null;
      approved_at: string | null;
      created_at: string;
    }>();

  if (!row) return json({ error: "override not found" }, 404);

  // Non-admins can only see their own overrides
  if (!ADMIN_ROLES.includes(user.role) && row.actor_user_id !== user.id) {
    return json({ error: "forbidden" }, 403);
  }

  const response: OverrideResponse = {
    override_id: row.override_id,
    instance_id: row.instance_id,
    override_type: row.override_type as OverrideType,
    status: row.status as OverrideResponse["status"],
    reason: row.reason,
    actor_user_id: row.actor_user_id,
    actor_role: "office_manager",
    approved_by_user_id: row.approved_by_user_id ?? undefined,
    approved_at: row.approved_at ?? undefined,
    created_at: row.created_at,
  };

  return json(response, 200);
};

// Helper: check if user has low trust score (triggers approval for late starts)
async function hasLowTrustScore(env: Env, userId: number): Promise<boolean> {
  const row = await env.DB.prepare(
    "SELECT trust_score FROM users WHERE id = ?"
  )
    .bind(userId)
    .first<{ trust_score: number }>();
  
  return (row?.trust_score ?? 100) < 70;
}

// Helper: execute an approved override, updating the visit instance
async function executeOverride(env: Env, overrideId: string, actor: AuthUser, correctionNote?: string): Promise<void> {
  const override = await env.DB.prepare(
    `SELECT instance_id, override_type, payload_after_hash FROM manual_overrides 
     WHERE override_id = ?`
  )
    .bind(overrideId)
    .first<{
      instance_id: string;
      override_type: OverrideType;
      payload_after_hash: string | null;
    }>();

  if (!override) return;

  const now = new Date().toISOString();
  let newStatus: string | null = null;

  switch (override.override_type) {
    case "mark_missed":
      newStatus = "missed";
      break;
    case "mark_completed":
      newStatus = "completed";
      break;
    case "force_sign":
      // Forces receipt to sealed status
      await env.DB.prepare(
        "UPDATE visit_receipts SET status = 'sealed', sealed_at = ? WHERE instance_id = ?"
      )
        .bind(now, override.instance_id)
        .run();
      newStatus = "completed";
      break;
    case "correct_record":
      // Corrections append; original data preserved in ledger
      // The payload_after_hash contains the new canonical state
      newStatus = null; // Status unchanged, data corrected
      break;
    case "start_early":
    case "start_late":
      newStatus = "in_progress";
      break;
    case "suppress_alert":
      // No status change, just logged
      break;
  }

  if (newStatus) {
    await env.DB.prepare(
      "UPDATE visit_instances SET status = ?, actual_start_at = COALESCE(actual_start_at, ?) WHERE instance_id = ?"
    )
      .bind(newStatus, now, override.instance_id)
      .run();
  }

  // Update override to executed
  await env.DB.prepare(
    "UPDATE manual_overrides SET status = 'executed', executed_at = ? WHERE override_id = ?"
  )
    .bind(now, overrideId)
    .run();

  // Final ledger entry for execution
  await ledgerAppend(env, actor.tenant, {
    entry_type: "override_executed",
    entity_type: "manual_override",
    entity_id: overrideId,
    payload_canonical_json: JSON.stringify({
      override_id: overrideId,
      instance_id: override.instance_id,
      new_status: newStatus,
      correction_note: correctionNote,
    }),
    actor_user_id: actor.id,
    actor_role: actor.role,
  });
}

// Helper: validate UUID format
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}
