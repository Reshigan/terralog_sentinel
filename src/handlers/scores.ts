import { json, requireSession, requireRole, WRITE_ROLES, ADMIN_ROLES, type Handler, type Env, type AuthUser } from "../lib/http";
import { enqueue } from "../lib/jobs";

// Domain types from shared contract (import pattern matches other handlers)
interface VendorScore {
  score_id: string;
  tenant_id: string;
  vendor_id: string;
  window_days: 30 | 90 | 365;
  on_time_starts: number;
  late_starts: number;
  missed_visits: number;
  disputed_visits: number;
  score_value: number;
  score_band: "ok" | "warning" | "critical";
  computed_at: string;
  previous_score_id: string | null;
}

interface StaffScore {
  score_id: string;
  tenant_id: string;
  user_id: string;
  window_days: number;
  actions_total: number;
  actions_reverted: number;
  overrides_approved: number;
  overrides_against: number;
  score_value: number;
  computed_at: string;
  previous_score_id: string | null;
}

interface Vendor {
  vendor_id: string;
  tenant_id: string;
  display_name: string;
  shadow_mode: boolean;
  shadow_mode_visit_limit: number | null;
  score: number;
}

interface VisitInstance {
  instance_id: string;
  tenant_id: string;
  vendor_id: string;
  status: "scheduled" | "due" | "in_progress" | "completed" | "missed" | "disputed" | "archived";
  drift_seconds: number | null;
  actual_start_at: string | null;
  scheduled_start_at: string;
}

interface ManualOverride {
  override_id: string;
  tenant_id: string;
  instance_id: string | null;
  actor_user_id: string;
  override_type: string;
  created_at: string;
}

interface LedgerEntry {
  entry_id: number;
  tenant_id: string;
  entry_type: string;
  entity_type: string;
  entity_id: string;
  actor_user_id: string | null;
  created_at: string;
}

// Helper: compute score band from value
function computeBand(scoreValue: number): "ok" | "warning" | "critical" {
  if (scoreValue >= 80) return "ok";
  if (scoreValue >= 60) return "warning";
  return "critical";
}

// Helper: calculate vendor reliability score
function calculateVendorScore(
  onTime: number,
  late: number,
  missed: number,
  disputed: number,
  total: number
): number {
  if (total === 0) return 50; // neutral baseline for no data
  const weightedOnTime = onTime * 1.0;
  const weightedLate = late * 0.7;
  const weightedMissed = missed * 0.0;
  const weightedDisputed = disputed * 0.3;
  const rawScore = (weightedOnTime + weightedLate + weightedDisputed) / total * 100;
  return Math.max(0, Math.min(100, Math.round(rawScore * 100) / 100));
}

// Helper: calculate staff trust score
function calculateStaffScore(
  actionsTotal: number,
  actionsReverted: number,
  overridesApproved: number,
  overridesAgainst: number
): number {
  if (actionsTotal === 0) return 70; // baseline for new staff
  const actionReliability = actionsTotal > 0 
    ? (actionsTotal - actionsReverted) / actionsTotal 
    : 1;
  const overrideReliability = (overridesApproved + overridesAgainst) > 0
    ? overridesApproved / (overridesApproved + overridesAgainst)
    : 1;
  const score = (actionReliability * 0.6 + overrideReliability * 0.4) * 100;
  return Math.max(0, Math.min(100, Math.round(score * 100) / 100));
}

// Get current timestamp in ISO format
function now(): string {
  return new Date().toISOString();
}

// Generate UUID v4
function generateUuid(): string {
  return crypto.randomUUID();
}

// ---- Vendor Score Computation ----

interface ComputeVendorScoresBody {
  vendor_id?: string;
  window_days?: 30 | 90 | 365;
}

interface VendorScoreResponse {
  score_id: string;
  vendor_id: string;
  window_days: number;
  score_value: number;
  score_band: "ok" | "warning" | "critical";
  on_time_starts: number;
  late_starts: number;
  missed_visits: number;
  disputed_visits: number;
  computed_at: string;
}

export const computeVendorScores: Handler<VendorScoreResponse | { error: string }> = async (req, env) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  const forbidden = requireRole(user, WRITE_ROLES);
  if (forbidden) return forbidden;

  const body = await req.json?.().catch(() => ({})) as ComputeVendorScoresBody | undefined;
  const vendorId = body?.vendor_id;
  const windowDays = body?.window_days ?? 30;

  if (![30, 90, 365].includes(windowDays)) {
    return json({ error: "window_days must be 30, 90, or 365" }, 400);
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - windowDays);
  const cutoffIso = cutoffDate.toISOString();

  // Build query for vendor(s)
  let vendorQuery = "SELECT vendor_id, display_name, shadow_mode, shadow_mode_visit_limit FROM vendors WHERE tenant_id = ?";
  const vendorParams: (string | number)[] = [user.tenant];
  if (vendorId) {
    vendorQuery += " AND vendor_id = ?";
    vendorParams.push(vendorId);
  }

  const vendors = await env.DB.prepare(vendorQuery).bind(...vendorParams).all<Vendor>();

  if (!vendorId && (!vendors.results || vendors.results.length === 0)) {
    return json({ error: "no vendors found" }, 404);
  }
  if (vendorId && (!vendors.results || vendors.results.length === 0)) {
    return json({ error: "vendor not found" }, 404);
  }

  const results: VendorScoreResponse[] = [];

  for (const vendor of vendors.results ?? []) {
    // Get visit stats for the window
    const visitStats = await env.DB.prepare(
      "SELECT status, drift_seconds FROM visit_instances WHERE tenant_id = ? AND vendor_id = ? AND scheduled_start_at >= ? AND status IN ('completed', 'missed', 'disputed')"
    ).bind(user.tenant, vendor.vendor_id, cutoffIso).all<VisitInstance>();

    let onTime = 0;
    let late = 0;
    let missed = 0;
    let disputed = 0;

    for (const visit of visitStats.results ?? []) {
      if (visit.status === "missed") {
        missed++;
      } else if (visit.status === "disputed") {
        disputed++;
      } else if (visit.status === "completed") {
        const driftMinutes = visit.drift_seconds ? visit.drift_seconds / 60 : 0;
        // On time if started within 5 minutes of scheduled
        if (driftMinutes <= 5) {
          onTime++;
        } else {
          late++;
        }
      }
    }

    const total = onTime + late + missed + disputed;

    // Shadow mode logic: if vendor is in shadow mode and under visit limit, keep score neutral
    let scoreValue: number;
    let inShadowMode = false;
    if (vendor.shadow_mode && vendor.shadow_mode_visit_limit !== null && total < vendor.shadow_mode_visit_limit) {
      scoreValue = 50; // neutral while shadowing
      inShadowMode = true;
    } else {
      scoreValue = calculateVendorScore(onTime, late, missed, disputed, total);
    }

    const scoreBand = computeBand(scoreValue);

    // Find previous score for chain
    const prevScore = await env.DB.prepare(
      "SELECT score_id FROM vendor_scores WHERE tenant_id = ? AND vendor_id = ? AND window_days = ? ORDER BY computed_at DESC LIMIT 1"
    ).bind(user.tenant, vendor.vendor_id, windowDays).first<{ score_id: string }>();

    const scoreId = generateUuid();
    const computedAt = now();

    await env.DB.prepare(
      "INSERT INTO vendor_scores (score_id, tenant_id, vendor_id, window_days, on_time_starts, late_starts, missed_visits, disputed_visits, score_value, score_band, computed_at, previous_score_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      scoreId,
      user.tenant,
      vendor.vendor_id,
      windowDays,
      onTime,
      late,
      missed,
      disputed,
      scoreValue,
      scoreBand,
      computedAt,
      prevScore?.score_id ?? null
    ).run();

    // Update cached score on vendor if not in shadow mode
    if (!inShadowMode) {
      await env.DB.prepare(
        "UPDATE vendors SET score = ?, score_band = ? WHERE vendor_id = ? AND tenant_id = ?"
      ).bind(scoreValue, scoreBand, vendor.vendor_id, user.tenant).run();
    }

    // If score entered critical band, trigger notification
    if (scoreBand === "critical" && (!inShadowMode || total >= (vendor.shadow_mode_visit_limit ?? 0))) {
      await enqueue(env, {
        type: "vendor_score_critical",
        payload: { tenant_id: user.tenant, vendor_id: vendor.vendor_id, score_value: scoreValue },
      });
    }

    // Write ledger entry for score update
    await env.DB.prepare(
      "INSERT INTO ledger_entries (tenant_id, entry_type, entity_type, entity_id, payload_canonical_json, payload_hash, prev_hash, actor_user_id, actor_role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      user.tenant,
      "score_update",
      "vendor_score",
      scoreId,
      JSON.stringify({ on_time: onTime, late: late, missed: missed, disputed: disputed, score: scoreValue }),
      await sha256Hex(JSON.stringify({ scoreId, scoreValue })),
      prevScore?.score_id ?? "00000000-0000-0000-0000-000000000000",
      user.id.toString(),
      user.role,
      computedAt
    ).run();

    results.push({
      score_id: scoreId,
      vendor_id: vendor.vendor_id,
      window_days: windowDays,
      score_value: scoreValue,
      score_band: scoreBand,
      on_time_starts: onTime,
      late_starts: late,
      missed_visits: missed,
      disputed_visits: disputed,
      computed_at: computedAt,
    });
  }

  // Return single result if specific vendor requested, otherwise first result
  return json(results[0] ?? { error: "computation failed" }, results.length > 0 ? 200 : 500);
};

// ---- Staff Score Computation ----

interface ComputeStaffScoresBody {
  user_id?: string;
}

interface StaffScoreResponse {
  score_id: string;
  user_id: string;
  score_value: number;
  actions_total: number;
  actions_reverted: number;
  overrides_approved: number;
  overrides_against: number;
  computed_at: string;
}

export const computeStaffScores: Handler<StaffScoreResponse | { error: string }> = async (req, env) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  const forbidden = requireRole(user, ADMIN_ROLES);
  if (forbidden) return forbidden;

  const body = await req.json?.().catch(() => ({})) as ComputeStaffScoresBody | undefined;
  const targetUserId = body?.user_id;

  // Build query for staff member(s)
  let staffQuery = "SELECT user_id, display_name FROM staff_members WHERE tenant_id = ?";
  const staffParams: (string | number)[] = [user.tenant];
  if (targetUserId) {
    staffQuery += " AND user_id = ?";
    staffParams.push(targetUserId);
  }

  const staffMembers = await env.DB.prepare(staffQuery).bind(...staffParams).all<{ user_id: string; display_name: string }>();

  if (!targetUserId && (!staffMembers.results || staffMembers.results.length === 0)) {
    return json({ error: "no staff members found" }, 404);
  }
  if (targetUserId && (!staffMembers.results || staffMembers.results.length === 0)) {
    return json({ error: "staff member not found" }, 404);
  }

  const results: StaffScoreResponse[] = [];
  const windowDays = 90; // Fixed window for staff scores
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - windowDays);
  const cutoffIso = cutoffDate.toISOString();

  for (const staff of staffMembers.results ?? []) {
    // Count actions (ledger entries by this user)
    const actions = await env.DB.prepare(
      "SELECT COUNT(*) as total FROM ledger_entries WHERE tenant_id = ? AND actor_user_id = ? AND created_at >= ?"
    ).bind(user.tenant, staff.user_id, cutoffIso).first<{ total: number }>();

    // Count reverted actions (corrections targeting their entries)
    const reverted = await env.DB.prepare(
      "SELECT COUNT(*) as total FROM manual_overrides mo JOIN ledger_entries le ON mo.payload_before_hash = le.payload_hash WHERE mo.tenant_id = ? AND le.actor_user_id = ? AND mo.override_type = 'correct_record' AND mo.created_at >= ?"
    ).bind(user.tenant, staff.user_id, cutoffIso).first<{ total: number }>();

    // Count overrides filed and their approval status
    const overrides = await env.DB.prepare(
      "SELECT override_type, approved_by_user_id FROM manual_overrides WHERE tenant_id = ? AND actor_user_id = ? AND created_at >= ?"
    ).bind(user.tenant, staff.user_id, cutoffIso).all<ManualOverride>();

    let overridesApproved = 0;
    let overridesAgainst = 0;
    for (const override of overrides.results ?? []) {
      // Override types that need approval: mark_missed, force_sign, correct_record
      if (["mark_missed", "force_sign", "correct_record"].includes(override.override_type)) {
        if (override.approved_by_user_id) {
          overridesApproved++;
        } else {
          // Check if explicitly rejected or just pending
          const rejected = await env.DB.prepare(
            "SELECT 1 FROM manual_overrides WHERE override_id = ? AND approved_by_user_id IS NULL AND created_at < ?"
          ).bind(override.override_id, now()).first();
          if (rejected) {
            overridesAgainst++;
          }
        }
      } else {
        // Auto-approved overrides
        overridesApproved++;
      }
    }

    const actionsTotal = actions?.total ?? 0;
    const actionsReverted = reverted?.total ?? 0;

    const scoreValue = calculateStaffScore(actionsTotal, actionsReverted, overridesApproved, overridesAgainst);

    // Find previous score for chain
    const prevScore = await env.DB.prepare(
      "SELECT score_id FROM staff_scores WHERE tenant_id = ? AND user_id = ? ORDER BY computed_at DESC LIMIT 1"
    ).bind(user.tenant, staff.user_id).first<{ score_id: string }>();

    const scoreId = generateUuid();
    const computedAt = now();

    await env.DB.prepare(
      "INSERT INTO staff_scores (score_id, tenant_id, user_id, window_days, actions_total, actions_reverted, overrides_approved, overrides_against, score_value, computed_at, previous_score_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      scoreId,
      user.tenant,
      staff.user_id,
      windowDays,
      actionsTotal,
      actionsReverted,
      overridesApproved,
      overridesAgainst,
      scoreValue,
      computedAt,
      prevScore?.score_id ?? null
    ).run();

    // Update cached score on staff member
    await env.DB.prepare(
      "UPDATE staff_members SET trust_score = ? WHERE user_id = ? AND tenant_id = ?"
    ).bind(scoreValue, staff.user_id, user.tenant).run();

    results.push({
      score_id: scoreId,
      user_id: staff.user_id,
      score_value: scoreValue,
      actions_total: actionsTotal,
      actions_reverted: actionsReverted,
      overrides_approved: overridesApproved,
      overrides_against: overridesAgainst,
      computed_at: computedAt,
    });
  }

  return json(results[0] ?? { error: "computation failed" }, results.length > 0 ? 200 : 500);
};

// ---- Get Vendor Score ----

interface GetVendorScoreParams {
  vendor_id: string;
  window_days?: string;
}

export const getVendorScore: Handler<VendorScoreResponse | { error: string }> = async (req, env) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);

  const url = new URL(req.url);
  const vendorId = url.pathname.split("/").pop();
  const windowDays = parseInt(url.searchParams.get("window_days") ?? "30") as 30 | 90 | 365;

  if (!vendorId || !/^[0-9a-f-]{36}$/i.test(vendorId)) {
    return json({ error: "invalid vendor_id" }, 400);
  }

  if (![30, 90, 365].includes(windowDays)) {
    return json({ error: "window_days must be 30, 90, or 365" }, 400);
  }

  const score = await env.DB.prepare(
    "SELECT score_id, vendor_id, window_days, score_value, score_band, on_time_starts, late_starts, missed_visits, disputed_visits, computed_at FROM vendor_scores WHERE tenant_id = ? AND vendor_id = ? AND window_days = ? ORDER BY computed_at DESC LIMIT 1"
  ).bind(user.tenant, vendorId, windowDays).first<VendorScoreResponse>();

  if (!score) {
    return json({ error: "no score found for vendor" }, 404);
  }

  return json(score, 200);
};

// ---- Get Staff Score ----

interface GetStaffScoreParams {
  user_id: string;
}

export const getStaffScore: Handler<StaffScoreResponse | { error: string }> = async (req, env) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);

  const url = new URL(req.url);
  const targetUserId = url.pathname.split("/").pop();

  if (!targetUserId) {
    return json({ error: "user_id required" }, 400);
  }

  // Users can see their own score, admins can see any
  if (targetUserId !== user.id.toString()) {
    const forbidden = requireRole(user, ADMIN_ROLES);
    if (forbidden) return forbidden;
  }

  const score = await env.DB.prepare(
    "SELECT score_id, user_id, score_value, actions_total, actions_reverted, overrides_approved, overrides_against, computed_at FROM staff_scores WHERE tenant_id = ? AND user_id = ? ORDER BY computed_at DESC LIMIT 1"
  ).bind(user.tenant, targetUserId).first<StaffScoreResponse>();

  if (!score) {
    return json({ error: "no score found for staff member" }, 404);
  }

  return json(score, 200);
};

// ---- List Vendor Scores ----

interface ListVendorScoresQuery {
  window_days?: string;
  score_band?: "ok" | "warning" | "critical";
}

interface VendorScoreListItem extends VendorScoreResponse {
  vendor_display_name: string;
}

export const listVendorScores: Handler<{ scores: VendorScoreListItem[]; total: number } | { error: string }> = async (req, env) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);

  const url = new URL(req.url);
  const windowDays = parseInt(url.searchParams.get("window_days") ?? "30") as 30 | 90 | 365;
  const scoreBand = url.searchParams.get("score_band") as "ok" | "warning" | "critical" | null;

  if (![30, 90, 365].includes(windowDays)) {
    return json({ error: "window_days must be 30, 90, or 365" }, 400);
  }

  let query = `
    SELECT vs.score_id, vs.vendor_id, vs.window_days, vs.score_value, vs.score_band, 
           vs.on_time_starts, vs.late_starts, vs.missed_visits, vs.disputed_visits, vs.computed_at,
           v.display_name as vendor_display_name
    FROM vendor_scores vs
    JOIN vendors v ON vs.vendor_id = v.vendor_id AND vs.tenant_id = v.tenant_id
    WHERE vs.tenant_id = ? AND vs.window_days = ?
    AND vs.computed_at = (
      SELECT MAX(computed_at) FROM vendor_scores 
      WHERE tenant_id = vs.tenant_id AND vendor_id = vs.vendor_id AND window_days = vs.window_days
    )
  `;
  const params: (string | number)[] = [user.tenant, windowDays];

  if (scoreBand) {
    query += " AND vs.score_band = ?";
    params.push(scoreBand);
  }

  query += " ORDER BY vs.score_value DESC";

  const scores = await env.DB.prepare(query).bind(...params).all<VendorScoreListItem>();

  return json({
    scores: scores.results ?? [],
    total: scores.results?.length ?? 0,
  }, 200);
};

// ---- Shadow Mode Management ----

interface UpdateShadowModeBody {
  shadow_mode: boolean;
  shadow_mode_visit_limit?: number;
}

interface VendorShadowResponse {
  vendor_id: string;
  shadow_mode: boolean;
  shadow_mode_visit_limit: number | null;
  current_visit_count: number;
  predicted_score: number | null;
}

export const updateVendorShadowMode: Handler<VendorShadowResponse | { error: string }> = async (req, env) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  const forbidden = requireRole(user, ADMIN_ROLES);
  if (forbidden) return forbidden;

  const url = new URL(req.url);
  const vendorId = url.pathname.split("/").slice(-2)[0];

  if (!vendorId || !/^[0-9a-f-]{36}$/i.test(vendorId)) {
    return json({ error: "invalid vendor_id" }, 400);
  }

  const body = await req.json?.().catch(() => ({})) as UpdateShadowModeBody | undefined;
  if (typeof body?.shadow_mode !== "boolean") {
    return json({ error: "shadow_mode boolean required" }, 400);
  }

  const limit = body.shadow_mode_visit_limit ?? (body.shadow_mode ? 10 : null);

  // Verify vendor exists
  const vendor = await env.DB.prepare(
    "SELECT vendor_id, display_name FROM vendors WHERE vendor_id = ? AND tenant_id = ?"
  ).bind(vendorId, user.tenant).first<{ vendor_id: string; display_name: string }>();

  if (!vendor) {
    return json({ error: "vendor not found" }, 404);
  }

  // Get current visit count
  const visitCount = await env.DB.prepare(
    "SELECT COUNT(*) as total FROM visit_instances WHERE tenant_id = ? AND vendor_id = ?"
  ).bind(user.tenant, vendorId).first<{ total: number }>();

  const currentCount = visitCount?.total ?? 0;

  // Calculate predicted score if shadow were removed
  let predictedScore: number | null = null;
  if (body.shadow_mode && currentCount > 0) {
    const visitStats = await env.DB.prepare(
      "SELECT status, drift_seconds FROM visit_instances WHERE tenant_id = ? AND vendor_id = ? AND status IN ('completed', 'missed', 'disputed')"
    ).bind(user.tenant, vendorId).all<VisitInstance>();

    let onTime = 0;
    let late = 0;
    let missed = 0;
    let disputed = 0;

    for (const visit of visitStats.results ?? []) {
      if (visit.status === "missed") {
        missed++;
      } else if (visit.status === "disputed") {
        disputed++;
      } else if (visit.status === "completed") {
        const driftMinutes = visit.drift_seconds ? visit.drift_seconds / 60 : 0;
        if (driftMinutes <= 5) {
          onTime++;
        } else {
          late++;
        }
      }
    }

    const total = onTime + late + missed + disputed;
    predictedScore = calculateVendorScore(onTime, late, missed, disputed, total);
  }

  await env.DB.prepare(
    "UPDATE vendors SET shadow_mode = ?, shadow_mode_visit_limit = ? WHERE vendor_id = ? AND tenant_id = ?"
  ).bind(body.shadow_mode ? 1 : 0, limit, vendorId, user.tenant).run();

  // Write ledger entry
  await env.DB.prepare(
    "INSERT INTO ledger_entries (tenant_id, entry_type, entity_type, entity_id, payload_canonical_json, payload_hash, prev_hash, actor_user_id, actor_role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    user.tenant,
    "shadow_mode_change",
    "vendor",
    vendorId,
    JSON.stringify({ shadow_mode: body.shadow_mode, limit }),
    await sha256Hex(JSON.stringify({ vendorId, shadow_mode: body.shadow_mode })),
    "00000000-0000-0000-0000-000000000000",
    user.id.toString(),
    user.role,
    now()
  ).run();

  return json({
    vendor_id: vendorId,
    shadow_mode: body.shadow_mode,
    shadow_mode_visit_limit: limit,
    current_visit_count: currentCount,
    predicted_score: predictedScore,
  }, 200);
};

// ---- Anomaly Detection ----

interface TriggerAnomalyDetectionBody {
  actor_user_id?: string;
  detection_window_days?: number;
}

interface AnomalyFlagResponse {
  flag_id: string;
  entry_type: "anomaly_flag";
  actor_user_id: string;
  detected_anomaly: string;
  severity: "low" | "medium" | "high";
  baseline_median: number;
  current_value: number;
  deviation_mad: number;
}

// Calculate median
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// Calculate MAD (median absolute deviation)
function mad(values: number[]): number {
  if (values.length === 0) return 0;
  const m = median(values);
  const deviations = values.map(v => Math.abs(v - m));
  return median(deviations);
}

export const triggerAnomalyDetection: Handler<AnomalyFlagResponse[] | { error: string }> = async (req, env) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  const forbidden = requireRole(user, ADMIN_ROLES);
  if (forbidden) return forbidden;

  const body = await req.json?.().catch(() => ({})) as TriggerAnomalyDetectionBody | undefined;
  const targetActorId = body?.actor_user_id;
  const detectionWindow = Math.min(Math.max(body?.detection_window_days ?? 7, 1), 30);

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 90); // 90-day baseline
  const baselineCutoff = cutoffDate.toISOString();

  const recentCutoff = new Date();
  recentCutoff.setDate(recentCutoff.getDate() - detectionWindow);
  const recentCutoffIso = recentCutoff.toISOString();

  // Build query for actors to check
  let actorQuery = `
    SELECT DISTINCT actor_user_id 
    FROM ledger_entries 
    WHERE tenant_id = ? AND entry_type = 'manual_override' AND created_at >= ?
  `;
  const actorParams: (string | number)[] = [user.tenant, baselineCutoff];
  if (targetActorId) {
    actorQuery += " AND actor_user_id = ?";
    actorParams.push(targetActorId);
  }

  const actors = await env.DB.prepare(actorQuery).bind(...actorParams).all<{ actor_user_id: string }>();
  const flags: AnomalyFlagResponse[] = [];

  for (const actor of actors.results ?? []) {
    if (!actor.actor_user_id) continue;

    // Get 90-day baseline: weekly override counts
    const baselineWeeks: number[] = [];
    for (let i = 0; i < 12; i++) {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - (i + 1) * 7);
      const weekEnd = new Date();
      weekEnd.setDate(weekEnd.getDate() - i * 7);
      
      const weekCount = await env.DB.prepare(
        "SELECT COUNT(*) as total FROM ledger_entries WHERE tenant_id = ? AND actor_user_id = ? AND entry_type = 'manual_override' AND created_at >= ? AND created_at < ?"
      ).bind(user.tenant, actor.actor_user_id, weekStart.toISOString(), weekEnd.toISOString()).first<{ total: number }>();
      
      baselineWeeks.push(weekCount?.total ?? 0);
    }

    // Get current detection window count
    const currentCount = await env.DB.prepare(
      "SELECT COUNT(*) as total FROM ledger_entries WHERE tenant_id = ? AND actor_user_id = ? AND entry_type = 'manual_override' AND created_at >= ?"
    ).bind(user.tenant, actor.actor_user_id, recentCutoffIso).first<{ total: number }>();

    const current = currentCount?.total ?? 0;
    const baselineMedian = median(baselineWeeks);
    const baselineMad = mad(baselineWeeks);

    // Flag if current exceeds 2 MAD above median
    const threshold = baselineMedian + 2 * Math.max(baselineMad, 0.5); // minimum MAD of 0.5 to avoid division by zero

    if (current > threshold && baselineMedian > 0) {
      const flagId = generateUuid();
      const severity: "low" | "medium" | "high" = current > threshold + 2 * baselineMad ? "high" : 
                                                  current > threshold + baselineMad ? "medium" : "low";

      // Write anomaly flag to ledger
      const payload = {
        actor_user_id: actor.actor_user_id,
        detection_window_days: detectionWindow,
        current_overrides: current,
        baseline_median: baselineMedian,
        baseline_mad: baselineMad,
        threshold: threshold,
        severity: severity,
      };

      await env.DB.prepare(
        "INSERT INTO ledger_entries (tenant_id, entry_type, entity_type, entity_id, payload_canonical_json, payload_hash, prev_hash, actor_user_id, actor_role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(
        user.tenant,
        "anomaly_flag",
        "audit",
        flagId,
        JSON.stringify(payload),
        await sha256Hex(JSON.stringify(payload)),
        "00000000-0000-0000-0000-000000000000",
        actor.actor_user_id,
        "system",
        now()
      ).run();

      // Queue notification to owner
      await enqueue(env, {
        type: "anomaly_detected",
        payload: { 
          tenant_id: user.tenant, 
          actor_user_id: actor.actor_user_id,
          severity: severity,
          current_overrides: current,
          baseline_median: baselineMedian,
        },
      });

      flags.push({
        flag_id: flagId,
        entry_type: "anomaly_flag",
        actor_user_id: actor.actor_user_id,
        detected_anomaly: `override frequency ${current}x in ${detectionWindow} days vs ${baselineMedian.toFixed(1)} baseline`,
        severity: severity,
        baseline_median: baselineMedian,
        current_value: current,
        deviation_mad: (current - baselineMedian) / Math.max(baselineMad, 0.5),
      });
    }
  }

  // Also check for vendor drift anomalies
  const vendors = await env.DB.prepare(
    "SELECT vendor_id FROM vendors WHERE tenant_id = ? AND shadow_mode = 0"
  ).bind(user.tenant).all<{ vendor_id: string }>();

  for (const vendor of vendors.results ?? []) {
    // Get drift distribution for this vendor
    const drifts = await env.DB.prepare(
      "SELECT drift_seconds FROM visit_instances WHERE tenant_id = ? AND vendor_id = ? AND drift_seconds IS NOT NULL AND scheduled_start_at >= ?"
    ).bind(user.tenant, vendor.vendor_id, baselineCutoff).all<{ drift_seconds: number }>();

    const driftValues = (drifts.results ?? []).map(d => d.drift_seconds / 60); // minutes
    if (driftValues.length < 5) continue;

    const driftMedian = median(driftValues);
    const driftMad = mad(driftValues);

    // Check recent visits for outliers
    const recentDrifts = await env.DB.prepare(
      "SELECT instance_id, drift_seconds FROM visit_instances WHERE tenant_id = ? AND vendor_id = ? AND drift_seconds IS NOT NULL AND scheduled_start_at >= ?"
    ).bind(user.tenant, vendor.vendor_id, recentCutoffIso).all<{ instance_id: string; drift_seconds: number }>();

    for (const visit of recentDrifts.results ?? []) {
      const driftMinutes = visit.drift_seconds / 60;
      if (Math.abs(driftMinutes - driftMedian) > 2 * Math.max(driftMad, 1)) {
        const flagId = generateUuid();
        
        await env.DB.prepare(
          "INSERT INTO ledger_entries (tenant_id, entry_type, entity_type, entity_id, payload_canonical_json, payload_hash, prev_hash, actor_user_id, actor_role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(
          user.tenant,
          "anomaly_flag",
          "visit",
          visit.instance_id,
          JSON.stringify({ 
            vendor_id: vendor.vendor_id, 
            drift_minutes: driftMinutes,
            median_drift: driftMedian,
            mad: driftMad,
          }),
          await sha256Hex(JSON.stringify({ instance_id: visit.instance_id, drift: driftMinutes })),
          "00000000-0000-0000-0000-000000000000",
          null,
          "system",
          now()
        ).run();

        flags.push({
          flag_id: flagId,
          entry_type: "anomaly_flag",
          actor_user_id: vendor.vendor_id, // Using vendor_id for vendor anomalies
          detected_anomaly: `drift outlier ${driftMinutes.toFixed(1)}min vs ${driftMedian.toFixed(1)}min baseline`,
          severity: driftMinutes - driftMedian > 3 * driftMad ? "high" : "medium",
          baseline_median: driftMedian,
          current_value: driftMinutes,
          deviation_mad: Math.abs(driftMinutes - driftMedian) / Math.max(driftMad, 1),
        });
      }
    }
  }

  return json(flags, flags.length > 0 ? 200 : 204);
};

// ---- List Anomaly Flags ----

interface ListAnomaliesQuery {
  actor_user_id?: string;
  severity?: "low" | "medium" | "high";
  since?: string;
}

interface AnomalyFlagListItem {
  entry_id: number;
  entity_id: string;
  payload_canonical_json: string;
  actor_user_id: string | null;
  created_at: string;
}

export const listAnomalyFlags: Handler<{ flags: AnomalyFlagListItem[]; total: number } | { error: string }> = async (req, env) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  const forbidden = requireRole(user, ADMIN_ROLES);
  if (forbidden) return forbidden;

  const url = new URL(req.url);
  const actorUserId = url.searchParams.get("actor_user_id");
  const severity = url.searchParams.get("severity") as "low" | "medium" | "high" | null;
  const since = url.searchParams.get("since") ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  let query = `
    SELECT entry_id, entity_id, payload_canonical_json, actor_user_id, created_at
    FROM ledger_entries
    WHERE tenant_id = ? AND entry_type = 'anomaly_flag' AND created_at >= ?
  `;
  const params: (string | number)[] = [user.tenant, since];

  if (actorUserId) {
    query += " AND actor_user_id = ?";
    params.push(actorUserId);
  }

  // Note: severity filtering would require parsing JSON payload; 
  // for performance we filter post-query for severity
  query += " ORDER BY created_at DESC LIMIT 100";

  const flags = await env.DB.prepare(query).bind(...params).all<AnomalyFlagListItem>();
  let results = flags.results ?? [];

  // Post-filter by severity if specified
  if (severity) {
    results = results.filter(f => {
      try {
        const payload = JSON.parse(f.payload_canonical_json);
        return payload.severity === severity;
      } catch {
        return false;
      }
    });
  }

  return json({
    flags: results,
    total: results.length,
  }, 200);
};

// ---- Get Score Trend ----

interface ScoreTrendPoint {
  computed_at: string;
  score_value: number;
  on_time_starts: number;
  late_starts: number;
  missed_visits: number;
}

interface GetVendorScoreTrendParams {
  vendor_id: string;
}

export const getVendorScoreTrend: Handler<{ vendor_id: string; window_days: number; trend: ScoreTrendPoint[] } | { error: string }> = async (req, env) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);

  const url = new URL(req.url);
  const vendorId = url.pathname.split("/").slice(-2)[0];
  const windowDays = parseInt(url.searchParams.get("window_days") ?? "30") as 30 | 90 | 365;

  if (!vendorId || !/^[0-9a-f-]{36}$/i.test(vendorId)) {
    return json({ error: "invalid vendor_id" }, 400);
  }

  if (![30, 90, 365].includes(windowDays)) {
    return json({ error: "window_days must be 30, 90, or 365" }, 400);
  }

  const trend = await env.DB.prepare(
    "SELECT computed_at, score_value, on_time_starts, late_starts, missed_visits FROM vendor_scores WHERE tenant_id = ? AND vendor_id = ? AND window_days = ? ORDER BY computed_at DESC LIMIT 30"
  ).bind(user.tenant, vendorId, windowDays).all<ScoreTrendPoint>();

  return json({
    vendor_id: vendorId,
    window_days: windowDays,
    trend: (trend.results ?? []).reverse(),
  }, 200);
};

// ---- Scheduled Score Recomputation (called by cron) ----

export async function runScheduledScoreRecomputation(env: Env): Promise<void> {
  const tenants = await env.DB.prepare(
    "SELECT DISTINCT tenant_id FROM vendors WHERE suspended_at IS NULL"
  ).all<{ tenant_id: string }>();

  for (const tenant of tenants.results ?? []) {
    // Recompute all vendor scores for this tenant
    for (const windowDays of [30, 90, 365] as const) {
      await enqueue(env, {
        type: "recompute_vendor_scores",
        payload: { tenant_id: tenant.tenant_id, window_days: windowDays },
      });
    }

    // Recompute staff scores
    await enqueue(env, {
      type: "recompute_staff_scores",
      payload: { tenant_id: tenant.tenant_id },
    });

    // Run anomaly detection
    await enqueue(env, {
      type: "detect_anomalies",
      payload: { tenant_id: tenant.tenant_id },
    });
  }
}

// ---- SHA-256 helper ----

async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}
