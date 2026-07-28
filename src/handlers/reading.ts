// GENERATED from the manifest. Do not edit.
import { json, noteTenant, readJson, requestId } from "../lib/http";
import { ADMIN_ROLES, audit, requireRole, requireSession, WRITE_ROLES } from "./auth";
import type { Reading, Row, Bucket, PendingReadingsHandler, SyncStatusSummaryHandler, GridStatisticsHandler, SiteAggregatesHandler, TechnicianPerformanceHandler, FailedSyncsHandler, ErasureCandidatesHandler, ReadingAgeDistributionHandler, ReadingTypeDistributionHandler, SiteAnomalyRateHandler, TechnicianAnomalyRateHandler, ReadingValueTrendHandler, ComplianceReportHandler, ListReadingsHandler, ListReadingsStatsHandler, GetReadingHandler, CreateReadingHandler, CreateReadingBulkHandler, UpdateReadingHandler, DeleteReadingHandler } from "../types";

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
const FIELDS: Spec[] = [{ name: "capture_timestamp", type: "date" }, { name: "latitude", type: "real" }, { name: "longitude", type: "real" }, { name: "numeric_value", type: "real" }, { name: "photo_blob_id", type: "text" }, { name: "encrypted_blob", type: "text" }, { name: "sync_status", type: "enum", values: ["pending","synced","failed","erased"] }, { name: "sync_attempts", type: "integer" }, { name: "device_fingerprint", type: "text" }, { name: "dedupe_id", type: "text" }, { name: "erasure_policy_id", type: "integer" }, { name: "reading_type_id", type: "integer" }, { name: "site_id", type: "integer" }, { name: "technician_id", type: "integer" }, { name: "weather_conditions", type: "text" }, { name: "equipment_used", type: "text" }, { name: "notes", type: "text" }];
function validate(body: Partial<Reading>, partial = false): string | null {
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

const WORKFLOW: Record<string, string[]> = {"pending":["synced","failed"],"synced":["erased"],"failed":["pending","erased"],"erased":[]};

const SORTABLE: string[] = ["id","capture_timestamp","latitude","longitude","numeric_value","photo_blob_id","encrypted_blob","sync_status","sync_attempts","device_fingerprint","dedupe_id","erasure_policy_id","reading_type_id","site_id","technician_id","weather_conditions","equipment_used","notes"];
const SEARCHABLE: string[] = ["capture_timestamp","photo_blob_id","encrypted_blob","sync_status","device_fingerprint","dedupe_id","weather_conditions","equipment_used","notes"];
const FILTERABLE: string[] = ["erasure_policy_id","reading_type_id","site_id","technician_id"];
const MATCHABLE: string[] = ["sync_status"];
const DATED: string[] = ["capture_timestamp"];
const GROUPABLE: string[] = ["capture_timestamp","sync_status","erasure_policy_id","reading_type_id","site_id","technician_id"];
const MEASURABLE: string[] = ["latitude","longitude","numeric_value","sync_attempts"];
/** ref column -> the parent it names, and what a rollup may group by over there. */
const HOPS: Record<string, { table: string; cols: string[] }> = {"erasure_policy_id":{"table":"erasure_policys","cols":["is_active","policy_type","created_at","updated_at"]},"reading_type_id":{"table":"reading_types","cols":["is_active","category"]},"site_id":{"table":"sites","cols":["is_active","site_type","region_id","status","installation_date","last_inspection_date"]},"technician_id":{"table":"technicians","cols":["last_active","is_active","status","hire_date","supervisor_id","certification_level"]}};
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

export const pendingReadings: PendingReadingsHandler = async (req, env, params) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  void params;
  const { results } = await env.DB.prepare("SELECT id, capture_timestamp, latitude, longitude, numeric_value, sync_attempts FROM readings WHERE sync_status = 'pending' AND tenant = ? AND deleted_at IS NULL ORDER BY capture_timestamp ASC").bind(user.tenant).all<Row>();
  return json(results);
};

export const syncStatusSummary: SyncStatusSummaryHandler = async (req, env, params) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  void params;
  const { results } = await env.DB.prepare("SELECT sync_status, COUNT(*) as count, SUM(sync_attempts) as total_attempts FROM readings WHERE tenant = ? AND deleted_at IS NULL GROUP BY sync_status").bind(user.tenant).all<Row>();
  return json(results);
};

export const gridStatistics: GridStatisticsHandler = async (req, env, params) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  void params;
  const { results } = await env.DB.prepare("SELECT g.id, g.cell_hash, COUNT(r.id) as count, AVG(r.numeric_value) as mean, STDDEV(r.numeric_value) as stddev FROM readings r JOIN grid_cells g ON ST_Within(ST_Point(r.longitude, r.latitude), ST_MakeEnvelope(g.longitude_min, g.latitude_min, g.longitude_max, g.latitude_max, 4326)) WHERE r.tenant = ? AND r.deleted_at IS NULL AND g.grid_size_meters = ? GROUP BY g.id, g.cell_hash").bind(user.tenant, params.id).all<Row>();
  return json(results);
};

export const siteAggregates: SiteAggregatesHandler = async (req, env, params) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  void params;
  const { results } = await env.DB.prepare("SELECT s.id, s.name, COUNT(r.id) as reading_count, AVG(r.numeric_value) as avg_value, MIN(r.numeric_value) as min_value, MAX(r.numeric_value) as max_value FROM readings r JOIN sites s ON r.site_id = s.id WHERE r.tenant = ? AND r.deleted_at IS NULL GROUP BY s.id, s.name").bind(user.tenant).all<Row>();
  return json(results);
};

export const technicianPerformance: TechnicianPerformanceHandler = async (req, env, params) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  void params;
  const { results } = await env.DB.prepare("SELECT t.id, t.name, COUNT(r.id) as reading_count, AVG(r.numeric_value) as avg_value FROM readings r JOIN technicians t ON r.technician_id = t.id WHERE r.tenant = ? AND r.deleted_at IS NULL GROUP BY t.id, t.name").bind(user.tenant).all<Row>();
  return json(results);
};

export const failedSyncs: FailedSyncsHandler = async (req, env, params) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  void params;
  const { results } = await env.DB.prepare("SELECT r.id, r.capture_timestamp, r.sync_attempts, sl.error_message FROM readings r JOIN sync_logs sl ON r.id = sl.reading_id WHERE r.sync_status = 'failed' AND r.tenant = ? AND r.deleted_at IS NULL AND sl.status = 'failure' ORDER BY r.sync_attempts DESC").bind(user.tenant).all<Row>();
  return json(results);
};

export const erasureCandidates: ErasureCandidatesHandler = async (req, env, params) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  void params;
  const { results } = await env.DB.prepare("SELECT r.id, r.capture_timestamp, r.sync_attempts, ep.name as policy_name FROM readings r JOIN erasure_policies ep ON r.erasure_policy_id = ep.id WHERE r.sync_status = 'failed' AND r.sync_attempts >= ep.max_attempts AND r.tenant = ? AND r.deleted_at IS NULL").bind(user.tenant).all<Row>();
  return json(results);
};

export const readingAgeDistribution: ReadingAgeDistributionHandler = async (req, env, params) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  void params;
  const { results } = await env.DB.prepare("SELECT CASE WHEN DATEDIFF('day', capture_timestamp, CURRENT_DATE) <= 7 THEN '0-7 days' WHEN DATEDIFF('day', capture_timestamp, CURRENT_DATE) <= 30 THEN '8-30 days' WHEN DATEDIFF('day', capture_timestamp, CURRENT_DATE) <= 90 THEN '31-90 days' ELSE '90+ days' END as age_bucket, COUNT(*) as count FROM readings WHERE tenant = ? AND deleted_at IS NULL GROUP BY age_bucket").bind(user.tenant).all<Row>();
  return json(results);
};

export const readingTypeDistribution: ReadingTypeDistributionHandler = async (req, env, params) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  void params;
  const { results } = await env.DB.prepare("SELECT rt.name as reading_type, COUNT(r.id) as count FROM readings r JOIN reading_types rt ON r.reading_type_id = rt.id WHERE r.tenant = ? AND r.deleted_at IS NULL GROUP BY rt.name").bind(user.tenant).all<Row>();
  return json(results);
};

export const siteAnomalyRate: SiteAnomalyRateHandler = async (req, env, params) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  void params;
  const { results } = await env.DB.prepare("SELECT s.id, s.name, COUNT(a.id) as anomaly_count, COUNT(r.id) as reading_count, (COUNT(a.id) * 100.0 / COUNT(r.id)) as anomaly_rate FROM sites s LEFT JOIN readings r ON s.id = r.site_id LEFT JOIN anomalies a ON r.id = a.reading_id WHERE r.tenant = ? AND r.deleted_at IS NULL GROUP BY s.id, s.name HAVING COUNT(r.id) > 0").bind(user.tenant).all<Row>();
  return json(results);
};

export const technicianAnomalyRate: TechnicianAnomalyRateHandler = async (req, env, params) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  void params;
  const { results } = await env.DB.prepare("SELECT t.id, t.name, COUNT(a.id) as anomaly_count, COUNT(r.id) as reading_count, (COUNT(a.id) * 100.0 / COUNT(r.id)) as anomaly_rate FROM technicians t LEFT JOIN readings r ON t.id = r.technician_id LEFT JOIN anomalies a ON r.id = a.reading_id WHERE r.tenant = ? AND r.deleted_at IS NULL GROUP BY t.id, t.name HAVING COUNT(r.id) > 0").bind(user.tenant).all<Row>();
  return json(results);
};

export const readingValueTrend: ReadingValueTrendHandler = async (req, env, params) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  void params;
  const { results } = await env.DB.prepare("SELECT DATE(capture_timestamp) as day, AVG(numeric_value) as avg_value FROM readings WHERE tenant = ? AND deleted_at IS NULL AND capture_timestamp >= DATE('now', '-30 days') GROUP BY day ORDER BY day").bind(user.tenant).all<Row>();
  return json(results);
};

export const complianceReport: ComplianceReportHandler = async (req, env, params) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  void params;
  const { results } = await env.DB.prepare("SELECT rt.name as reading_type, COUNT(r.id) as actual_count, rt.expected_frequency_hours, (COUNT(r.id) * 24.0 / NULLIF(rt.expected_frequency_hours, 0)) as compliance_percentage FROM reading_types rt LEFT JOIN readings r ON rt.id = r.reading_type_id AND r.capture_timestamp >= DATE('now', '-30 days') AND r.tenant = ? AND r.deleted_at IS NULL GROUP BY rt.name, rt.expected_frequency_hours").bind(user.tenant).all<Row>();
  return json(results);
};

export const listReadings: ListReadingsHandler = async (req, env) => {
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
  const counted = await env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(latitude), 0) AS s_latitude, COALESCE(SUM(longitude), 0) AS s_longitude, COALESCE(SUM(numeric_value), 0) AS s_numeric_value, COALESCE(SUM(sync_attempts), 0) AS s_sync_attempts FROM readings WHERE " + where).bind(...args).first<Record<string, number>>();
  let pageWhere = where;
  const pageArgs = [...args];
  const cursor = Math.trunc(Number(url.searchParams.get("cursor")));
  if (sort === "id" && Number.isInteger(cursor) && cursor > 0) {
    pageWhere += dir === "ASC" ? " AND id > ?" : " AND id < ?";
    pageArgs.push(cursor);
  }
  const { results } = await env.DB.prepare(
    "SELECT * FROM readings WHERE " + pageWhere + " ORDER BY " + sort + " " + dir + " LIMIT ? OFFSET ?",
  ).bind(...pageArgs, per, cursor > 0 && sort === "id" ? 0 : (page - 1) * per).all<Reading>();
  const out = json(results);
  out.headers.set("x-total-count", String(counted?.n ?? results.length));
  const last = results[results.length - 1];
  if (sort === "id" && last && results.length === per) out.headers.set("x-next-cursor", String(last.id));
  if (counted) out.headers.set("x-totals", JSON.stringify({ latitude: counted.s_latitude ?? 0, longitude: counted.s_longitude ?? 0, numeric_value: counted.s_numeric_value ?? 0, sync_attempts: counted.s_sync_attempts ?? 0 }));
  return out;
};

export const listReadingsStats: ListReadingsStatsHandler = async (req, env) => {
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
    ? "readings JOIN (SELECT id AS \"hop.id\", " + hopCol + " AS \"hop.key\" FROM " + hop.table + " WHERE tenant = ? AND deleted_at IS NULL) ON \"hop.id\" = " + by.slice(0, dot)
    : "readings";
  const { results } = await env.DB.prepare(
    "SELECT " + key + " AS key, COUNT(*) AS count, " + agg +
    " FROM " + from + " WHERE " + sc.where + " GROUP BY " + key + " ORDER BY count DESC LIMIT ?",
  ).bind(...(hop ? [user.tenant] : []), ...sc.args, limit).all<Bucket>();
  return json(results);
};

export const getReading: GetReadingHandler = async (req, env, params) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  const row = await env.DB.prepare("SELECT * FROM readings WHERE id = ? AND tenant = ? AND deleted_at IS NULL").bind(params.id, user.tenant).first<Reading>();
  if (!row) return json({ error: "not found" }, 404);
  const out = json(row);
  out.headers.set("etag", 'W/"' + row.row_version + '"');
  return out;
};

export const createReading: CreateReadingHandler = async (req, env) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  const denied = requireRole(user, WRITE_ROLES);
  if (denied) return denied;
  const body = await readJson<Partial<Reading>>(req);
  if (!body) return json({ error: "invalid body" }, 400);
  const invalid = validate(body);
  if (invalid) return json({ error: invalid }, 400);
  const key = (req.headers.get("idempotency-key") ?? new URL(req.url).searchParams.get("idempotency_key") ?? "").trim().slice(0, 200);
  if (key) {
    const seen = await env.DB.prepare("SELECT row_id FROM idempotency WHERE tenant = ? AND key = ? AND endpoint = ?").bind(user.tenant, key, "createReading").first<{ row_id: number }>();
    if (seen) {
      const prior = await env.DB.prepare("SELECT * FROM readings WHERE id = ? AND tenant = ? AND deleted_at IS NULL").bind(seen.row_id, user.tenant).first<Reading>();
      if (prior) {
        const replay = json(prior);
        replay.headers.set("idempotent-replay", "true");
        return replay;
      }
    }
  }
  try {
    const res = await env.DB.prepare("INSERT INTO readings (capture_timestamp, latitude, longitude, numeric_value, photo_blob_id, encrypted_blob, sync_status, sync_attempts, device_fingerprint, dedupe_id, erasure_policy_id, reading_type_id, site_id, technician_id, weather_conditions, equipment_used, notes, tenant) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(body.capture_timestamp ?? null, body.latitude ?? null, body.longitude ?? null, body.numeric_value ?? null, body.photo_blob_id ?? null, body.encrypted_blob ?? null, body.sync_status ?? null, body.sync_attempts ?? null, body.device_fingerprint ?? null, body.dedupe_id ?? null, body.erasure_policy_id ?? null, body.reading_type_id ?? null, body.site_id ?? null, body.technician_id ?? null, body.weather_conditions ?? null, body.equipment_used ?? null, body.notes ?? null, user.tenant).run();
    const row = await env.DB.prepare("SELECT * FROM readings WHERE id = ?").bind(res.meta.last_row_id).first<Reading>();
    if (key)
      await env.DB.prepare("INSERT OR IGNORE INTO idempotency (tenant, key, endpoint, row_id, at) VALUES (?, ?, ?, ?, ?)")
        .bind(user.tenant, key, "createReading", Number(res.meta.last_row_id), new Date().toISOString()).run();
    await audit(env, user, "create", "reading", Number(res.meta.last_row_id), row);
    return row ? json(row) : json({ error: "insert failed" }, 500);
  } catch (err) {
    const bad = constraintError(err);
    if (!bad) throw err;
    return json({ error: bad, requestId: requestId(req) }, 409);
  }
};

export const createReadingBulk: CreateReadingBulkHandler = async (req, env) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  const denied = requireRole(user, WRITE_ROLES);
  if (denied) return denied;
  const payload = await readJson<{ rows?: Partial<Reading>[] }>(req);
  const rows = payload?.rows;
  if (!Array.isArray(rows)) return json({ error: "expected { rows: [...] }" }, 400);
  if (!rows.length) return json({ error: "rows is empty" }, 400);
  if (rows.length > 100) return json({ error: "at most 100 rows per batch; got " + rows.length }, 400);
  for (let i = 0; i < rows.length; i++) {
    const bad = validate(rows[i] as Partial<Reading>);
    if (bad) return json({ error: "row " + i + ": " + bad }, 400);
  }
  try {
    const stmt = env.DB.prepare("INSERT INTO readings (capture_timestamp, latitude, longitude, numeric_value, photo_blob_id, encrypted_blob, sync_status, sync_attempts, device_fingerprint, dedupe_id, erasure_policy_id, reading_type_id, site_id, technician_id, weather_conditions, equipment_used, notes, tenant) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id");
    const out = await env.DB.batch<{ id: number }>(
      rows.map((body) => stmt.bind(body.capture_timestamp ?? null, body.latitude ?? null, body.longitude ?? null, body.numeric_value ?? null, body.photo_blob_id ?? null, body.encrypted_blob ?? null, body.sync_status ?? null, body.sync_attempts ?? null, body.device_fingerprint ?? null, body.dedupe_id ?? null, body.erasure_policy_id ?? null, body.reading_type_id ?? null, body.site_id ?? null, body.technician_id ?? null, body.weather_conditions ?? null, body.equipment_used ?? null, body.notes ?? null, user.tenant)),
    );
    const ids = out.flatMap((r) => (r.results ?? []).map((x) => x.id));
    for (const id of ids) await audit(env, user, "create", "reading", id, null);
    return json({ created: ids.length, ids });
  } catch (err) {
    const bad = constraintError(err);
    if (!bad) throw err;
    return json({ error: bad, requestId: requestId(req) }, 409);
  }
};

export const updateReading: UpdateReadingHandler = async (req, env, params) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  const denied = requireRole(user, WRITE_ROLES);
  if (denied) return denied;
  const body = await readJson<Partial<Reading>>(req);
  if (!body) return json({ error: "invalid body" }, 400);
  const invalid = validate(body, true);
  if (invalid) return json({ error: invalid }, 400);
  const next = body.sync_status;
  if (next !== undefined && next !== null) {
    const cur = await env.DB.prepare("SELECT sync_status FROM readings WHERE id = ? AND tenant = ? AND deleted_at IS NULL").bind(params.id, user.tenant).first<{ sync_status: string }>();
    if (!cur) return json({ error: "not found" }, 404);
    const allowed = WORKFLOW[cur.sync_status] ?? [];
    if (next !== cur.sync_status && !allowed.includes(next))
      return json({ error: "invalid sync_status transition from " + cur.sync_status + "; allowed: " + (allowed.length ? allowed.join(", ") : "none") }, 409);
  }
  const tag = (req.headers.get("if-match") ?? new URL(req.url).searchParams.get("if_match") ?? "").replace(/^W\//, "").replace(/"/g, "").trim();
  const want = tag ? Math.trunc(Number(tag)) : NaN;
  if (tag && !Number.isInteger(want)) return json({ error: "if-match must be a version number" }, 400);
  let sql = "UPDATE readings SET capture_timestamp = COALESCE(?, capture_timestamp), latitude = COALESCE(?, latitude), longitude = COALESCE(?, longitude), numeric_value = COALESCE(?, numeric_value), photo_blob_id = COALESCE(?, photo_blob_id), encrypted_blob = COALESCE(?, encrypted_blob), sync_status = COALESCE(?, sync_status), sync_attempts = COALESCE(?, sync_attempts), device_fingerprint = COALESCE(?, device_fingerprint), dedupe_id = COALESCE(?, dedupe_id), erasure_policy_id = COALESCE(?, erasure_policy_id), reading_type_id = COALESCE(?, reading_type_id), site_id = COALESCE(?, site_id), technician_id = COALESCE(?, technician_id), weather_conditions = COALESCE(?, weather_conditions), equipment_used = COALESCE(?, equipment_used), notes = COALESCE(?, notes), row_version = row_version + 1 WHERE id = ? AND tenant = ? AND deleted_at IS NULL";
  const args: unknown[] = [body.capture_timestamp ?? null, body.latitude ?? null, body.longitude ?? null, body.numeric_value ?? null, body.photo_blob_id ?? null, body.encrypted_blob ?? null, body.sync_status ?? null, body.sync_attempts ?? null, body.device_fingerprint ?? null, body.dedupe_id ?? null, body.erasure_policy_id ?? null, body.reading_type_id ?? null, body.site_id ?? null, body.technician_id ?? null, body.weather_conditions ?? null, body.equipment_used ?? null, body.notes ?? null, params.id, user.tenant];
  if (Number.isInteger(want)) { sql += " AND row_version = ?"; args.push(want); }
  try {
    const res = await env.DB.prepare(sql).bind(...args).run();
    if (!res.meta.changes) {
      const cur = await env.DB.prepare("SELECT row_version FROM readings WHERE id = ? AND tenant = ? AND deleted_at IS NULL").bind(params.id, user.tenant).first<{ row_version: number }>();
      if (!cur) return json({ error: "not found" }, 404);
      return json({ error: "version conflict: this record was changed by someone else (now at version " + cur.row_version + ")", requestId: requestId(req) }, 409);
    }
    const row = await env.DB.prepare("SELECT * FROM readings WHERE id = ? AND tenant = ? AND deleted_at IS NULL").bind(params.id, user.tenant).first<Reading>();
    if (row) await audit(env, user, "update", "reading", Number(params.id), body);
    const out = row ? json(row) : json({ error: "not found" }, 404);
    if (row) out.headers.set("etag", 'W/"' + row.row_version + '"');
    return out;
  } catch (err) {
    const bad = constraintError(err);
    if (!bad) throw err;
    return json({ error: bad, requestId: requestId(req) }, 409);
  }
};

export const deleteReading: DeleteReadingHandler = async (req, env, params) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  const denied = requireRole(user, WRITE_ROLES);
  if (denied) return denied;
  const res = await env.DB.prepare("UPDATE readings SET deleted_at = ? WHERE id = ? AND tenant = ? AND deleted_at IS NULL").bind(new Date().toISOString(), params.id, user.tenant).run();
  if (res.meta.changes) await audit(env, user, "delete", "reading", Number(params.id), null);
  return res.meta.changes ? json({ ok: true }) : json({ error: "not found" }, 404);
};

export const deleteReadingRestore: DeleteReadingHandler = async (req, env, params) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  const denied = requireRole(user, ADMIN_ROLES);
  if (denied) return denied;
  const res = await env.DB.prepare("UPDATE readings SET deleted_at = NULL WHERE id = ? AND tenant = ? AND deleted_at IS NOT NULL").bind(params.id, user.tenant).run();
  if (res.meta.changes) await audit(env, user, "restore", "reading", Number(params.id), null);
  return res.meta.changes ? json({ ok: true }) : json({ error: "not found" }, 404);
};
