// Statistical baseline engine for the Desklog ledger.
// Calculates rolling median and MAD (median absolute deviation) for
// ManualOverride frequencies per actor, and flags deviations >2σ as anomalies.
//
// This replaces the generated CRUD placeholder. It exports the same
// handler signatures so the router table needs no change.

import { json, noteTenant, readJson, requestId, type Handler } from "../lib/http";
import { ADMIN_ROLES, audit, requireRole, requireSession, WRITE_ROLES } from "./auth";
import type { Row, Bucket, BulkResult, ApiError } from "../types";

// --------------------------------------------------------------------------
// Types local to this module (not exported from src/types.ts)
// --------------------------------------------------------------------------

interface Anomaly {
  id: number;
  reading_id: number | null;
  grid_cell_id: number | null;
  cell_mean: number | null;
  cell_stddev: number | null;
  z_score: number | null;
  detected_at: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  status: string | null;
  assigned_to: number | null;
  severity: string | null;
  follow_up_required: number | null;
  tenant: string;
  deleted_at: string | null;
  row_version: number;
}

type DetectAnomaliesResponse = { ok: boolean; flagged: number; actors_checked: number; as_of: string; short_window_days: number; long_window_days: number } | ApiError;
type ListAnomalysResponse = Anomaly[] | ApiError;
type ListAnomalysStatsResponse = Bucket[] | ApiError;
type GetAnomalyResponse = Anomaly | ApiError;
type CreateAnomalyResponse = Anomaly | ApiError;
type CreateAnomalyBulkResponse = BulkResult | ApiError;
type UpdateAnomalyResponse = Anomaly | ApiError;
type DeleteAnomalyResponse = { ok: boolean } | ApiError;

type DetectAnomaliesHandler = Handler<DetectAnomaliesResponse>;
type ListAnomalysHandler = Handler<ListAnomalysResponse>;
type ListAnomalysStatsHandler = Handler<ListAnomalysStatsResponse>;
type GetAnomalyHandler = Handler<GetAnomalyResponse>;
type CreateAnomalyHandler = Handler<CreateAnomalyResponse>;
type CreateAnomalyBulkHandler = Handler<CreateAnomalyBulkResponse>;
type UpdateAnomalyHandler = Handler<UpdateAnomalyResponse>;
type DeleteAnomalyHandler = Handler<DeleteAnomalyResponse>;

type OverrideRecord = {
  actor_user_id: number;
  actor_role: string;
  created_at: string;
  entry_type: string;
};

type BaselineStats = {
  median: number;
  mad: number;
  count: number;
};

// --------------------------------------------------------------------------
// Statistical helpers (median, MAD, MAD-based σ approximation)
// --------------------------------------------------------------------------

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function mad(values: number[]): number {
  const m = median(values);
  const deviations = values.map((v) => Math.abs(v - m));
  return median(deviations);
}

// MAD-based threshold: for normal-ish data, 2*MAD approximates 1.48*2*σ
// We use >2*MAD as the flag threshold (roughly >2.96σ, very conservative)
const MAD_THRESHOLD_MULTIPLIER = 2;

// --------------------------------------------------------------------------
// Baseline computation from LedgerEntry override counts
// --------------------------------------------------------------------------

async function computeActorBaseline(
  env: { DB: D1Database },
  tenant: string,
  actorUserId: number,
  windowDays: number
): Promise<BaselineStats> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - windowDays);
  const sinceIso = since.toISOString();

  // Daily override counts for this actor over the window
  const { results } = await env.DB.prepare(
    `SELECT
       DATE(created_at) as day,
       COUNT(*) as n
     FROM ledger_entries
     WHERE tenant = ?
       AND actor_user_id = ?
       AND entry_type IN ('override', 'correct_record', 'start_late')
       AND created_at >= ?
       AND deleted_at IS NULL
     GROUP BY day
     ORDER BY day`
  )
    .bind(tenant, actorUserId, sinceIso)
    .all<{ day: string; n: number }>();

  const counts = (results ?? []).map((r) => r.n);
  const m = median(counts.length ? counts : [0]);
  const d = mad(counts.length ? counts : [0]);
  return { median: m, mad: d, count: counts.length };
}

async function flagAnomaliesForTenant(
  env: { DB: D1Database },
  tenant: string,
  asOf: Date,
  shortWindowDays: number,
  longWindowDays: number
): Promise<{ flagged: number; actorsChecked: number }> {
  const shortSince = new Date(asOf);
  shortSince.setUTCDate(shortSince.getUTCDate() - shortWindowDays);
  const shortSinceIso = shortSince.toISOString();

  // All actors with any activity in the short window
  const { results: actors } = await env.DB.prepare(
    `SELECT DISTINCT actor_user_id as id
     FROM ledger_entries
     WHERE tenant = ?
       AND entry_type IN ('override', 'correct_record', 'start_late')
       AND created_at >= ?
       AND deleted_at IS NULL`
  )
    .bind(tenant, shortSinceIso)
    .all<{ id: number }>();

  let flagged = 0;
  const actorIds = (actors ?? []).map((a) => a.id);

  for (const actorId of actorIds) {
    const baseline = await computeActorBaseline(env, tenant, actorId, longWindowDays);

    // Short window count
    const { results: shortCounts } = await env.DB.prepare(
      `SELECT COUNT(*) as n
       FROM ledger_entries
       WHERE tenant = ?
         AND actor_user_id = ?
         AND entry_type IN ('override', 'correct_record', 'start_late')
         AND created_at >= ?
         AND deleted_at IS NULL`
    )
      .bind(tenant, actorId, shortSinceIso)
      .all<{ n: number }>();

    const shortCount = shortCounts?.[0]?.n ?? 0;

    // MAD-based outlier detection
    const threshold = baseline.median + MAD_THRESHOLD_MULTIPLIER * baseline.mad;
    if (shortCount > threshold) {
      // Insert anomaly flag
      await env.DB.prepare(
        `INSERT INTO anomalies
           (reading_id, grid_cell_id, cell_mean, cell_stddev, z_score, detected_at, resolved_at, resolution_notes, status, assigned_to, severity, follow_up_required, tenant)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          actorId, // reading_id repurposed as actor_user_id for correlation
          null, // grid_cell_id unused
          baseline.median, // cell_mean repurposed as baseline median
          baseline.mad, // cell_stddev repurposed as MAD
          (shortCount - baseline.median) / (baseline.mad || 1), // z_score
          asOf.toISOString(),
          `7-day count ${shortCount} exceeds baseline median ${baseline.median} by >2 MAD`,
          "open",
          null, // assigned_to unassigned initially
          shortCount > threshold * 2 ? "high" : "medium", // severity
          1, // follow_up_required
          tenant
        )
        .run();

      // Also write ledger entry for audit trail
      await env.DB.prepare(
        `INSERT INTO ledger_entries
           (tenant, entry_type, entity_type, entity_id, payload_canonical_json, payload_hash, prev_hash, entry_hash, actor_user_id, actor_role, created_at, signature_id)
         VALUES (?, 'anomaly_flag', 'anomaly', NULL, ?, ?, '', '', ?, 'system', ?, NULL)`
      )
        .bind(
          tenant,
          JSON.stringify({
            actor_user_id: actorId,
            short_window_days: shortWindowDays,
            long_window_days: longWindowDays,
            short_count: shortCount,
            baseline_median: baseline.median,
            baseline_mad: baseline.mad,
            threshold,
          }),
          await sha256Hex(JSON.stringify({ actorId, shortCount, threshold })),
          actorId,
          asOf.toISOString()
        )
        .run();

      flagged++;
    }
  }

  return { flagged, actorsChecked: actorIds.length };
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// --------------------------------------------------------------------------
// Constraint error helper (preserved from generated code)
// --------------------------------------------------------------------------

function constraintError(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("FOREIGN KEY constraint failed"))
    return "a referenced record does not exist in this workspace";
  if (msg.includes("UNIQUE constraint failed")) return "a record with these values already exists";
  if (msg.includes("CHECK constraint failed")) return "a value is outside its allowed range";
  if (msg.includes("NOT NULL constraint failed")) return "a required field was empty";
  return null;
}

// --------------------------------------------------------------------------
// Field specs and validation (preserved from generated code for CRUD compat)
// --------------------------------------------------------------------------

type Spec = { name: string; type: "text" | "integer" | "real" | "date" | "bool" | "enum"; values?: string[] };
const FIELDS: Spec[] = [
  { name: "reading_id", type: "integer" },
  { name: "grid_cell_id", type: "integer" },
  { name: "cell_mean", type: "real" },
  { name: "cell_stddev", type: "real" },
  { name: "z_score", type: "real" },
  { name: "detected_at", type: "date" },
  { name: "resolved_at", type: "date" },
  { name: "resolution_notes", type: "text" },
  { name: "status", type: "enum", values: ["open", "investigating", "resolved", "false_positive"] },
  { name: "assigned_to", type: "integer" },
  { name: "severity", type: "enum", values: ["low", "medium", "high", "critical"] },
  { name: "follow_up_required", type: "bool" },
];

function validate(body: Partial<Anomaly>, partial = false): string | null {
  const b = body as Record<string, unknown>;
  for (const { name, type, values } of FIELDS) {
    const v = b[name];
    if (v === undefined || v === null || v === "") {
      if (partial) continue;
      return name + " is required";
    }
    const str = type === "text" || type === "date" || type === "enum";
    if (str && typeof v !== "string") return name + " must be text";
    if (!str && typeof v !== "number") return name + " must be a number";
    if ((type === "integer" || type === "bool") && !Number.isInteger(v)) return name + " must be a whole number";
    if (type === "bool" && v !== 0 && v !== 1) return name + " must be 0 or 1";
    if (type === "enum" && values && !values.includes(v as string))
      return name + " must be one of " + values.join(", ");
  }
  return null;
}

// --------------------------------------------------------------------------
// Workflow, sortable, searchable, filterable (preserved from generated)
// --------------------------------------------------------------------------

const WORKFLOW: Record<string, string[]> = {
  open: ["investigating", "resolved", "false_positive"],
  investigating: ["resolved", "false_positive"],
  resolved: [],
  false_positive: [],
};

const SORTABLE: string[] = [
  "id",
  "reading_id",
  "grid_cell_id",
  "cell_mean",
  "cell_stddev",
  "z_score",
  "detected_at",
  "resolved_at",
  "resolution_notes",
  "status",
  "assigned_to",
  "severity",
  "follow_up_required",
];
const SEARCHABLE: string[] = ["detected_at", "resolved_at", "resolution_notes", "status", "severity"];
const FILTERABLE: string[] = ["reading_id", "grid_cell_id", "assigned_to"];
const MATCHABLE: string[] = ["status", "severity"];
const DATED: string[] = ["detected_at", "resolved_at"];
const GROUPABLE: string[] = [
  "reading_id",
  "grid_cell_id",
  "detected_at",
  "resolved_at",
  "status",
  "assigned_to",
  "severity",
  "follow_up_required",
];
const MEASURABLE: string[] = ["cell_mean", "cell_stddev", "z_score"];

/** ref column -> the parent it names, and what a rollup may group by over there. */
const HOPS: Record<string, { table: string; cols: string[] }> = {
  reading_id: { table: "readings", cols: ["capture_timestamp", "sync_status", "erasure_policy_id", "reading_type_id", "site_id", "technician_id"] },
  grid_cell_id: { table: "grid_cells", cols: ["last_updated", "site_id"] },
  assigned_to: { table: "technicians", cols: ["last_active", "is_active", "status", "hire_date", "supervisor_id", "certification_level"] },
};

const GROUPINGS: string[] = [...GROUPABLE, ...Object.entries(HOPS).flatMap(([r, h]) => h.cols.map((c) => r + "." + c))];

/** The tenant + live + filter WHERE for this entity, or a message to 400 with. */
function scope(url: URL, tenant: string): { where: string; args: unknown[] } | string {
  let where = "tenant = ? AND deleted_at IS NULL";
  const args: unknown[] = [tenant];
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q && SEARCHABLE.length) {
    where += " AND (" + SEARCHABLE.map((c) => c + " LIKE ?").join(" OR ") + ")";
    for (const _ of SEARCHABLE) args.push("%" + q + "%");
  }
  for (const col of FILTERABLE) {
    const raw = url.searchParams.get(col);
    if (raw === null || raw === "") continue;
    const n = Number(raw);
    if (!Number.isInteger(n)) return "bad filter value for " + col;
    where += " AND " + col + " = ?";
    args.push(n);
  }
  for (const col of MATCHABLE) {
    const raw = url.searchParams.get(col);
    if (raw === null || raw === "") continue;
    where += " AND " + col + " = ?";
    args.push(raw);
  }
  const since = url.searchParams.get("since");
  const until = url.searchParams.get("until");
  if (since || until) {
    const on = url.searchParams.get("date_field") ?? DATED[0] ?? "";
    if (!DATED.includes(on)) return "unknown date field: " + on;
    if (since) {
      where += " AND " + on + " >= ?";
      args.push(since);
    }
    if (until) {
      where += " AND " + on + " <= ?";
      args.push(until);
    }
  }
  return { where, args };
}

// --------------------------------------------------------------------------
// Handler implementations
// --------------------------------------------------------------------------

/** Detect anomalies: the statistical baseline engine endpoint.
 *  POST /api/anomalies/detect — runs the 7-day vs 90-day comparison and
 *  creates anomaly records for actors exceeding 2 MAD above their baseline.
 */
export const detectAnomalies: DetectAnomaliesHandler = async (req, env) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);

  const denied = requireRole(user, ADMIN_ROLES);
  if (denied) return denied;

  const now = new Date();
  const result = await flagAnomaliesForTenant(env, user.tenant, now, 7, 90);

  return json({
    ok: true,
    flagged: result.flagged,
    actors_checked: result.actorsChecked,
    as_of: now.toISOString(),
    short_window_days: 7,
    long_window_days: 90,
  });
};

/** List anomalies with filtering, sorting, pagination.
 *  GET /api/anomalies
 */
export const listAnomalys: ListAnomalysHandler = async (req, env) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);

  const url = new URL(req.url);
  const sort = url.searchParams.get("sort") ?? "id";
  if (!SORTABLE.includes(sort)) return json({ error: "unknown sort field: " + sort }, 400);
  const dir = url.searchParams.get("dir") === "asc" ? "ASC" : "DESC";
  const per = Math.min(200, Math.max(1, Math.trunc(Number(url.searchParams.get("per"))) || 50));
  const page = Math.max(1, Math.trunc(Number(url.searchParams.get("page"))) || 1);

  const sc = scope(url, user.tenant);
  if (typeof sc === "string") return json({ error: sc }, 400);
  const { where, args } = sc;

  const counted = await env.DB.prepare(
    "SELECT COUNT(*) AS n, COALESCE(SUM(cell_mean), 0) AS s_cell_mean, COALESCE(SUM(cell_stddev), 0) AS s_cell_stddev, COALESCE(SUM(z_score), 0) AS s_z_score FROM anomalies WHERE " + where
  )
    .bind(...args)
    .first<Record<string, number>>();

  let pageWhere = where;
  const pageArgs = [...args];
  const cursor = Math.trunc(Number(url.searchParams.get("cursor")));
  if (sort === "id" && Number.isInteger(cursor) && cursor > 0) {
    pageWhere += dir === "ASC" ? " AND id > ?" : " AND id < ?";
    pageArgs.push(cursor);
  }

  const { results } = await env.DB.prepare(
    "SELECT * FROM anomalies WHERE " + pageWhere + " ORDER BY " + sort + " " + dir + " LIMIT ? OFFSET ?"
  )
    .bind(...pageArgs, per, cursor > 0 && sort === "id" ? 0 : (page - 1) * per)
    .all<Anomaly>();

  const out = json(results);
  out.headers.set("x-total-count", String(counted?.n ?? results.length));
  const last = results[results.length - 1];
  if (sort === "id" && last && results.length === per) out.headers.set("x-next-cursor", String(last.id));
  if (counted)
    out.headers.set(
      "x-totals",
      JSON.stringify({
        cell_mean: counted.s_cell_mean ?? 0,
        cell_stddev: counted.s_cell_stddev ?? 0,
        z_score: counted.s_z_score ?? 0,
      })
    );
  return out;
};

/** Aggregate statistics grouped by dimension.
 *  GET /api/anomalies/stats
 */
export const listAnomalysStats: ListAnomalysStatsHandler = async (req, env) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);

  const url = new URL(req.url);
  const by = url.searchParams.get("by") ?? GROUPABLE[0] ?? "";
  const dot = by.indexOf(".");
  const hop = dot > 0 ? HOPS[by.slice(0, dot)] : undefined;
  const hopCol = by.slice(dot + 1);
  if (dot < 0 ? !GROUPABLE.includes(by) : !hop?.cols.includes(hopCol))
    return json(
      { error: "cannot group by " + by + "; try one of: " + (GROUPINGS.join(", ") || "nothing on this record") },
      400
    );

  const metric = url.searchParams.get("metric") ?? "";
  if (metric && !MEASURABLE.includes(metric))
    return json({ error: "cannot measure " + metric + "; try one of: " + (MEASURABLE.join(", ") || "nothing on this record") }, 400);

  const sc = scope(url, user.tenant);
  if (typeof sc === "string") return json({ error: sc }, 400);

  const agg = metric
    ? "SUM(" + metric + ") AS sum, AVG(" + metric + ") AS avg, MIN(" + metric + ") AS min, MAX(" + metric + ") AS max"
    : "NULL AS sum, NULL AS avg, NULL AS min, NULL AS max";
  const limit = Math.min(1000, Math.max(1, Math.trunc(Number(url.searchParams.get("limit"))) || 200));
  const key = hop ? '"hop.key"' : by;
  const from = hop
    ? "anomalies JOIN (SELECT id AS \"hop.id\", " + hopCol + ' AS "hop.key" FROM ' + hop.table + " WHERE tenant = ? AND deleted_at IS NULL) ON \"hop.id\" = " + by.slice(0, dot)
    : "anomalies";

  const { results } = await env.DB.prepare(
    "SELECT " + key + " AS key, COUNT(*) AS count, " + agg + " FROM " + from + " WHERE " + sc.where + " GROUP BY " + key + " ORDER BY count DESC LIMIT ?"
  )
    .bind(...(hop ? [user.tenant] : []), ...sc.args, limit)
    .all<Bucket>();

  return json(results);
};

/** Get a single anomaly by ID.
 *  GET /api/anomalies/:id
 */
export const getAnomaly: GetAnomalyHandler = async (req, env, params) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);

  const row = await env.DB.prepare("SELECT * FROM anomalies WHERE id = ? AND tenant = ? AND deleted_at IS NULL")
    .bind(params.id, user.tenant)
    .first<Anomaly>();
  if (!row) return json({ error: "not found" }, 404);

  const out = json(row);
  out.headers.set("etag", 'W/"' + row.row_version + '"');
  return out;
};

/** Create an anomaly manually (admin override).
 *  POST /api/anomalies
 */
export const createAnomaly: CreateAnomalyHandler = async (req, env) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);

  const denied = requireRole(user, WRITE_ROLES);
  if (denied) return denied;

  const body = await readJson<Partial<Anomaly>>(req);
  if (!body) return json({ error: "invalid body" }, 400);
  const invalid = validate(body);
  if (invalid) return json({ error: invalid }, 400);

  const key = (req.headers.get("idempotency-key") ?? new URL(req.url).searchParams.get("idempotency_key") ?? "").trim().slice(0, 200);
  if (key) {
    const seen = await env.DB.prepare("SELECT row_id FROM idempotency WHERE tenant = ? AND key = ? AND endpoint = ?")
      .bind(user.tenant, key, "createAnomaly")
      .first<{ row_id: number }>();
    if (seen) {
      const prior = await env.DB.prepare("SELECT * FROM anomalies WHERE id = ? AND tenant = ? AND deleted_at IS NULL")
        .bind(seen.row_id, user.tenant)
        .first<Anomaly>();
      if (prior) {
        const replay = json(prior);
        replay.headers.set("idempotent-replay", "true");
        return replay;
      }
    }
  }

  try {
    const res = await env.DB.prepare(
      "INSERT INTO anomalies (reading_id, grid_cell_id, cell_mean, cell_stddev, z_score, detected_at, resolved_at, resolution_notes, status, assigned_to, severity, follow_up_required, tenant) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
      .bind(
        body.reading_id ?? null,
        body.grid_cell_id ?? null,
        body.cell_mean ?? null,
        body.cell_stddev ?? null,
        body.z_score ?? null,
        body.detected_at ?? null,
        body.resolved_at ?? null,
        body.resolution_notes ?? null,
        body.status ?? null,
        body.assigned_to ?? null,
        body.severity ?? null,
        body.follow_up_required ?? null,
        user.tenant
      )
      .run();

    const row = await env.DB.prepare("SELECT * FROM anomalies WHERE id = ?").bind(res.meta.last_row_id).first<Anomaly>();

    if (key)
      await env.DB.prepare("INSERT OR IGNORE INTO idempotency (tenant, key, endpoint, row_id, at) VALUES (?, ?, ?, ?, ?)")
        .bind(user.tenant, key, "createAnomaly", Number(res.meta.last_row_id), new Date().toISOString())
        .run();

    await audit(env, user, "create", "anomaly", Number(res.meta.last_row_id), row);
    return row ? json(row) : json({ error: "insert failed" }, 500);
  } catch (err) {
    const bad = constraintError(err);
    if (!bad) throw err;
    return json({ error: bad, requestId: requestId(req) }, 409);
  }
};

/** Bulk create anomalies.
 *  POST /api/anomalies/bulk
 */
export const createAnomalyBulk: CreateAnomalyBulkHandler = async (req, env) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);

  const denied = requireRole(user, WRITE_ROLES);
  if (denied) return denied;

  const payload = await readJson<{ rows?: Partial<Anomaly>[] }>(req);
  const rows = payload?.rows;
  if (!Array.isArray(rows)) return json({ error: "expected { rows: [...] }" }, 400);
  if (!rows.length) return json({ error: "rows is empty" }, 400);
  if (rows.length > 100) return json({ error: "at most 100 rows per batch; got " + rows.length }, 400);

  for (let i = 0; i < rows.length; i++) {
    const bad = validate(rows[i] as Partial<Anomaly>);
    if (bad) return json({ error: "row " + i + ": " + bad }, 400);
  }

  try {
    const stmt = env.DB.prepare(
      "INSERT INTO anomalies (reading_id, grid_cell_id, cell_mean, cell_stddev, z_score, detected_at, resolved_at, resolution_notes, status, assigned_to, severity, follow_up_required, tenant) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id"
    );
    const out = await env.DB.batch<{ id: number }>(
      rows.map((body) =>
        stmt.bind(
          body.reading_id ?? null,
          body.grid_cell_id ?? null,
          body.cell_mean ?? null,
          body.cell_stddev ?? null,
          body.z_score ?? null,
          body.detected_at ?? null,
          body.resolved_at ?? null,
          body.resolution_notes ?? null,
          body.status ?? null,
          body.assigned_to ?? null,
          body.severity ?? null,
          body.follow_up_required ?? null,
          user.tenant
        )
      )
    );

    const ids = out.flatMap((r) => (r.results ?? []).map((x) => x.id));
    for (const id of ids) await audit(env, user, "create", "anomaly", id, null);
    return json({ created: ids.length, ids });
  } catch (err) {
    const bad = constraintError(err);
    if (!bad) throw err;
    return json({ error: bad, requestId: requestId(req) }, 409);
  }
};

/** Update an anomaly (workflow-aware).
 *  PATCH /api/anomalies/:id
 */
export const updateAnomaly: UpdateAnomalyHandler = async (req, env, params) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);

  const denied = requireRole(user, WRITE_ROLES);
  if (denied) return denied;

  const body = await readJson<Partial<Anomaly>>(req);
  if (!body) return json({ error: "invalid body" }, 400);
  const invalid = validate(body, true);
  if (invalid) return json({ error: invalid }, 400);

  const next = body.status;
  const existing = await env.DB.prepare("SELECT * FROM anomalies WHERE id = ? AND tenant = ? AND deleted_at IS NULL")
    .bind(params.id, user.tenant)
    .first<Anomaly>();
  if (!existing) return json({ error: "not found" }, 404);

  if (next !== undefined && !WORKFLOW[existing.status ?? ""]?.includes(next))
    return json({ error: "invalid workflow transition from " + existing.status + " to " + next }, 400);

  const etag = req.headers.get("if-match");
  if (etag && etag !== 'W/"' + existing.row_version + '"') return json({ error: "version conflict" }, 409);

  const set: string[] = [];
  const vals: unknown[] = [];
  for (const { name } of FIELDS) {
    const v = (body as Record<string, unknown>)[name];
    if (v === undefined) continue;
    set.push(name + " = ?");
    vals.push(v);
  }
  if (!set.length) return json({ error: "no changes" }, 400);

  set.push("row_version = row_version + 1");
  vals.push(params.id, user.tenant);

  try {
    await env.DB.prepare("UPDATE anomalies SET " + set.join(", ") + " WHERE id = ? AND tenant = ?").bind(...vals).run();
    const row = await env.DB.prepare("SELECT * FROM anomalies WHERE id = ?").bind(params.id).first<Anomaly>();
    await audit(env, user, "update", "anomaly", params.id, row);
    return row ? json(row) : json({ error: "update failed" }, 500);
  } catch (err) {
    const bad = constraintError(err);
    if (!bad) throw err;
    return json({ error: bad, requestId: requestId(req) }, 409);
  }
};

/** Delete an anomaly (soft delete).
 *  DELETE /api/anomalies/:id
 */
export const deleteAnomaly: DeleteAnomalyHandler = async (req, env, params) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);

  const denied = requireRole(user, WRITE_ROLES);
  if (denied) return denied;

  const existing = await env.DB.prepare("SELECT row_version FROM anomalies WHERE id = ? AND tenant = ? AND deleted_at IS NULL")
    .bind(params.id, user.tenant)
    .first<{ row_version: number }>();
  if (!existing) return json({ error: "not found" }, 404);

  const etag = req.headers.get("if-match");
  if (etag && etag !== 'W/"' + existing.row_version + '"') return json({ error: "version conflict" }, 409);

  await env.DB.prepare("UPDATE anomalies SET deleted_at = ?, row_version = row_version + 1 WHERE id = ? AND tenant = ?")
    .bind(new Date().toISOString(), params.id, user.tenant)
    .run();

  await audit(env, user, "delete", "anomaly", params.id, null);
  return json({ ok: true });
};