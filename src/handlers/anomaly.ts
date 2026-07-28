// GENERATED from the manifest. Do not edit.
import { json, noteTenant, readJson, requestId } from "../lib/http";
import { ADMIN_ROLES, audit, requireRole, requireSession, WRITE_ROLES } from "./auth";
import type { Anomaly, Row, Bucket, DetectAnomaliesHandler, ListAnomalysHandler, ListAnomalysStatsHandler, GetAnomalyHandler, CreateAnomalyHandler, CreateAnomalyBulkHandler, UpdateAnomalyHandler, DeleteAnomalyHandler } from "../types";

function constraintError(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("FOREIGN KEY constraint failed"))
    return "a referenced record does not exist in this workspace";
  if (msg.includes("UNIQUE constraint failed")) return "a record with these values already exists";
  if (msg.includes("CHECK constraint failed")) return "a value is outside its allowed range";
  if (msg.includes("NOT NULL constraint failed")) return "a required field was empty";
  return null;
}

type Spec = { name: string; type: "text" | "integer" | "real" | "date" | "bool" | "enum"; values?: string[] };
const FIELDS: Spec[] = [{ name: "reading_id", type: "integer" }, { name: "grid_cell_id", type: "integer" }, { name: "cell_mean", type: "real" }, { name: "cell_stddev", type: "real" }, { name: "z_score", type: "real" }, { name: "detected_at", type: "date" }, { name: "resolved_at", type: "date" }, { name: "resolution_notes", type: "text" }, { name: "status", type: "enum", values: ["open","investigating","resolved","false_positive"] }, { name: "assigned_to", type: "integer" }, { name: "severity", type: "enum", values: ["low","medium","high","critical"] }, { name: "follow_up_required", type: "bool" }];
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
    if (type === "enum" && values && !values.includes(v as string)) return name + " must be one of " + values.join(", ");
  }
  return null;
}

const WORKFLOW: Record<string, string[]> = {"open":["investigating","resolved","false_positive"],"investigating":["resolved","false_positive"],"resolved":[],"false_positive":[]};

const SORTABLE: string[] = ["id","reading_id","grid_cell_id","cell_mean","cell_stddev","z_score","detected_at","resolved_at","resolution_notes","status","assigned_to","severity","follow_up_required"];
const SEARCHABLE: string[] = ["detected_at","resolved_at","resolution_notes","status","severity"];
const FILTERABLE: string[] = ["reading_id","grid_cell_id","assigned_to"];
const MATCHABLE: string[] = ["status","severity"];
const DATED: string[] = ["detected_at","resolved_at"];
const GROUPABLE: string[] = ["reading_id","grid_cell_id","detected_at","resolved_at","status","assigned_to","severity","follow_up_required"];
const MEASURABLE: string[] = ["cell_mean","cell_stddev","z_score"];
/** ref column -> the parent it names, and what a rollup may group by over there. */
const HOPS: Record<string, { table: string; cols: string[] }> = {"reading_id":{"table":"readings","cols":["capture_timestamp","sync_status","erasure_policy_id","reading_type_id","site_id","technician_id"]},"grid_cell_id":{"table":"grid_cells","cols":["last_updated","site_id"]},"assigned_to":{"table":"technicians","cols":["last_active","is_active","status","hire_date","supervisor_id","certification_level"]}};
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
    if (since) { where += " AND " + on + " >= ?"; args.push(since); }
    if (until) { where += " AND " + on + " <= ?"; args.push(until); }
  }
  return { where, args };
}

export const detectAnomalies: DetectAnomaliesHandler = async (req, env, params) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  void params;
  const { results } = await env.DB.prepare("SELECT r.id, r.latitude, r.longitude, r.numeric_value, g.cell_hash, a.cell_mean, a.cell_stddev, a.z_score FROM readings r JOIN anomalies a ON r.id = a.reading_id JOIN grid_cells g ON a.grid_cell_id = g.id WHERE r.tenant = ? AND r.deleted_at IS NULL AND g.grid_size_meters = ? AND a.z_score > ?").bind(user.tenant, params.id, params.id).all<Row>();
  return json(results);
};

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
  const counted = await env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(cell_mean), 0) AS s_cell_mean, COALESCE(SUM(cell_stddev), 0) AS s_cell_stddev, COALESCE(SUM(z_score), 0) AS s_z_score FROM anomalys WHERE " + where).bind(...args).first<Record<string, number>>();
  let pageWhere = where;
  const pageArgs = [...args];
  const cursor = Math.trunc(Number(url.searchParams.get("cursor")));
  if (sort === "id" && Number.isInteger(cursor) && cursor > 0) {
    pageWhere += dir === "ASC" ? " AND id > ?" : " AND id < ?";
    pageArgs.push(cursor);
  }
  const { results } = await env.DB.prepare(
    "SELECT * FROM anomalys WHERE " + pageWhere + " ORDER BY " + sort + " " + dir + " LIMIT ? OFFSET ?",
  ).bind(...pageArgs, per, cursor > 0 && sort === "id" ? 0 : (page - 1) * per).all<Anomaly>();
  const out = json(results);
  out.headers.set("x-total-count", String(counted?.n ?? results.length));
  const last = results[results.length - 1];
  if (sort === "id" && last && results.length === per) out.headers.set("x-next-cursor", String(last.id));
  if (counted) out.headers.set("x-totals", JSON.stringify({ cell_mean: counted.s_cell_mean ?? 0, cell_stddev: counted.s_cell_stddev ?? 0, z_score: counted.s_z_score ?? 0 }));
  return out;
};

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
    return json({ error: "cannot group by " + by + "; try one of: " + (GROUPINGS.join(", ") || "nothing on this record") }, 400);
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
    ? "anomalys JOIN (SELECT id AS \"hop.id\", " + hopCol + " AS \"hop.key\" FROM " + hop.table + " WHERE tenant = ? AND deleted_at IS NULL) ON \"hop.id\" = " + by.slice(0, dot)
    : "anomalys";
  const { results } = await env.DB.prepare(
    "SELECT " + key + " AS key, COUNT(*) AS count, " + agg +
    " FROM " + from + " WHERE " + sc.where + " GROUP BY " + key + " ORDER BY count DESC LIMIT ?",
  ).bind(...(hop ? [user.tenant] : []), ...sc.args, limit).all<Bucket>();
  return json(results);
};

export const getAnomaly: GetAnomalyHandler = async (req, env, params) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  const row = await env.DB.prepare("SELECT * FROM anomalys WHERE id = ? AND tenant = ? AND deleted_at IS NULL").bind(params.id, user.tenant).first<Anomaly>();
  if (!row) return json({ error: "not found" }, 404);
  const out = json(row);
  out.headers.set("etag", 'W/"' + row.row_version + '"');
  return out;
};

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
    const seen = await env.DB.prepare("SELECT row_id FROM idempotency WHERE tenant = ? AND key = ? AND endpoint = ?").bind(user.tenant, key, "createAnomaly").first<{ row_id: number }>();
    if (seen) {
      const prior = await env.DB.prepare("SELECT * FROM anomalys WHERE id = ? AND tenant = ? AND deleted_at IS NULL").bind(seen.row_id, user.tenant).first<Anomaly>();
      if (prior) {
        const replay = json(prior);
        replay.headers.set("idempotent-replay", "true");
        return replay;
      }
    }
  }
  try {
    const res = await env.DB.prepare("INSERT INTO anomalys (reading_id, grid_cell_id, cell_mean, cell_stddev, z_score, detected_at, resolved_at, resolution_notes, status, assigned_to, severity, follow_up_required, tenant) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(body.reading_id ?? null, body.grid_cell_id ?? null, body.cell_mean ?? null, body.cell_stddev ?? null, body.z_score ?? null, body.detected_at ?? null, body.resolved_at ?? null, body.resolution_notes ?? null, body.status ?? null, body.assigned_to ?? null, body.severity ?? null, body.follow_up_required ?? null, user.tenant).run();
    const row = await env.DB.prepare("SELECT * FROM anomalys WHERE id = ?").bind(res.meta.last_row_id).first<Anomaly>();
    if (key)
      await env.DB.prepare("INSERT OR IGNORE INTO idempotency (tenant, key, endpoint, row_id, at) VALUES (?, ?, ?, ?, ?)")
        .bind(user.tenant, key, "createAnomaly", Number(res.meta.last_row_id), new Date().toISOString()).run();
    await audit(env, user, "create", "anomaly", Number(res.meta.last_row_id), row);
    return row ? json(row) : json({ error: "insert failed" }, 500);
  } catch (err) {
    const bad = constraintError(err);
    if (!bad) throw err;
    return json({ error: bad, requestId: requestId(req) }, 409);
  }
};

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
    const stmt = env.DB.prepare("INSERT INTO anomalys (reading_id, grid_cell_id, cell_mean, cell_stddev, z_score, detected_at, resolved_at, resolution_notes, status, assigned_to, severity, follow_up_required, tenant) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id");
    const out = await env.DB.batch<{ id: number }>(
      rows.map((body) => stmt.bind(body.reading_id ?? null, body.grid_cell_id ?? null, body.cell_mean ?? null, body.cell_stddev ?? null, body.z_score ?? null, body.detected_at ?? null, body.resolved_at ?? null, body.resolution_notes ?? null, body.status ?? null, body.assigned_to ?? null, body.severity ?? null, body.follow_up_required ?? null, user.tenant)),
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
  if (next !== undefined && next !== null) {
    const cur = await env.DB.prepare("SELECT status FROM anomalys WHERE id = ? AND tenant = ? AND deleted_at IS NULL").bind(params.id, user.tenant).first<{ status: string }>();
    if (!cur) return json({ error: "not found" }, 404);
    const allowed = WORKFLOW[cur.status] ?? [];
    if (next !== cur.status && !allowed.includes(next))
      return json({ error: "invalid status transition from " + cur.status + "; allowed: " + (allowed.length ? allowed.join(", ") : "none") }, 409);
  }
  const tag = (req.headers.get("if-match") ?? new URL(req.url).searchParams.get("if_match") ?? "").replace(/^W\//, "").replace(/"/g, "").trim();
  const want = tag ? Math.trunc(Number(tag)) : NaN;
  if (tag && !Number.isInteger(want)) return json({ error: "if-match must be a version number" }, 400);
  let sql = "UPDATE anomalys SET reading_id = COALESCE(?, reading_id), grid_cell_id = COALESCE(?, grid_cell_id), cell_mean = COALESCE(?, cell_mean), cell_stddev = COALESCE(?, cell_stddev), z_score = COALESCE(?, z_score), detected_at = COALESCE(?, detected_at), resolved_at = COALESCE(?, resolved_at), resolution_notes = COALESCE(?, resolution_notes), status = COALESCE(?, status), assigned_to = COALESCE(?, assigned_to), severity = COALESCE(?, severity), follow_up_required = COALESCE(?, follow_up_required), row_version = row_version + 1 WHERE id = ? AND tenant = ? AND deleted_at IS NULL";
  const args: unknown[] = [body.reading_id ?? null, body.grid_cell_id ?? null, body.cell_mean ?? null, body.cell_stddev ?? null, body.z_score ?? null, body.detected_at ?? null, body.resolved_at ?? null, body.resolution_notes ?? null, body.status ?? null, body.assigned_to ?? null, body.severity ?? null, body.follow_up_required ?? null, params.id, user.tenant];
  if (Number.isInteger(want)) { sql += " AND row_version = ?"; args.push(want); }
  try {
    const res = await env.DB.prepare(sql).bind(...args).run();
    if (!res.meta.changes) {
      const cur = await env.DB.prepare("SELECT row_version FROM anomalys WHERE id = ? AND tenant = ? AND deleted_at IS NULL").bind(params.id, user.tenant).first<{ row_version: number }>();
      if (!cur) return json({ error: "not found" }, 404);
      return json({ error: "version conflict: this record was changed by someone else (now at version " + cur.row_version + ")", requestId: requestId(req) }, 409);
    }
    const row = await env.DB.prepare("SELECT * FROM anomalys WHERE id = ? AND tenant = ? AND deleted_at IS NULL").bind(params.id, user.tenant).first<Anomaly>();
    if (row) await audit(env, user, "update", "anomaly", Number(params.id), body);
    const out = row ? json(row) : json({ error: "not found" }, 404);
    if (row) out.headers.set("etag", 'W/"' + row.row_version + '"');
    return out;
  } catch (err) {
    const bad = constraintError(err);
    if (!bad) throw err;
    return json({ error: bad, requestId: requestId(req) }, 409);
  }
};

export const deleteAnomaly: DeleteAnomalyHandler = async (req, env, params) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  const denied = requireRole(user, WRITE_ROLES);
  if (denied) return denied;
  const res = await env.DB.prepare("UPDATE anomalys SET deleted_at = ? WHERE id = ? AND tenant = ? AND deleted_at IS NULL").bind(new Date().toISOString(), params.id, user.tenant).run();
  if (res.meta.changes) await audit(env, user, "delete", "anomaly", Number(params.id), null);
  return res.meta.changes ? json({ ok: true }) : json({ error: "not found" }, 404);
};

export const deleteAnomalyRestore: DeleteAnomalyHandler = async (req, env, params) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  const denied = requireRole(user, ADMIN_ROLES);
  if (denied) return denied;
  const res = await env.DB.prepare("UPDATE anomalys SET deleted_at = NULL WHERE id = ? AND tenant = ? AND deleted_at IS NOT NULL").bind(params.id, user.tenant).run();
  if (res.meta.changes) await audit(env, user, "restore", "anomaly", Number(params.id), null);
  return res.meta.changes ? json({ ok: true }) : json({ error: "not found" }, 404);
};
