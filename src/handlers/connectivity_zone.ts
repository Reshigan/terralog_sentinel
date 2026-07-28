// GENERATED from the manifest. Do not edit.
import { json, noteTenant, readJson, requestId } from "../lib/http";
import { ADMIN_ROLES, audit, requireRole, requireSession, WRITE_ROLES } from "./auth";
import type { Connectivity_zone, Row, Bucket, LowSyncZonesHandler, ListConnectivity_zonesHandler, ListConnectivity_zonesStatsHandler, GetConnectivity_zoneHandler, CreateConnectivity_zoneHandler, CreateConnectivity_zoneBulkHandler, UpdateConnectivity_zoneHandler, DeleteConnectivity_zoneHandler } from "../types";

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
const FIELDS: Spec[] = [{ name: "name", type: "text" }, { name: "polygon_geojson", type: "text" }, { name: "sync_success_rate", type: "real" }, { name: "last_updated", type: "date" }, { name: "technician_email", type: "text" }, { name: "status", type: "enum", values: ["active","monitoring","degraded"] }];
function validate(body: Partial<Connectivity_zone>, partial = false): string | null {
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

const WORKFLOW: Record<string, string[]> = {"active":["monitoring","degraded"],"monitoring":["active","degraded"],"degraded":["active","monitoring"]};

const SORTABLE: string[] = ["id","name","polygon_geojson","sync_success_rate","last_updated","technician_email","status"];
const SEARCHABLE: string[] = ["name","polygon_geojson","last_updated","technician_email","status"];
const FILTERABLE: string[] = [];
const MATCHABLE: string[] = ["status"];
const DATED: string[] = ["last_updated"];
const GROUPABLE: string[] = ["last_updated","status"];
const MEASURABLE: string[] = ["sync_success_rate"];
/** ref column -> the parent it names, and what a rollup may group by over there. */
const HOPS: Record<string, { table: string; cols: string[] }> = {};
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

export const lowSyncZones: LowSyncZonesHandler = async (req, env, params) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  void params;
  const { results } = await env.DB.prepare("SELECT * FROM connectivity_zones WHERE sync_success_rate < 0.7 AND tenant = ? AND deleted_at IS NULL ORDER BY sync_success_rate ASC").bind(user.tenant).all<Row>();
  return json(results);
};

export const listConnectivity_zones: ListConnectivity_zonesHandler = async (req, env) => {
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
  const counted = await env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(sync_success_rate), 0) AS s_sync_success_rate FROM connectivity_zones WHERE " + where).bind(...args).first<Record<string, number>>();
  let pageWhere = where;
  const pageArgs = [...args];
  const cursor = Math.trunc(Number(url.searchParams.get("cursor")));
  if (sort === "id" && Number.isInteger(cursor) && cursor > 0) {
    pageWhere += dir === "ASC" ? " AND id > ?" : " AND id < ?";
    pageArgs.push(cursor);
  }
  const { results } = await env.DB.prepare(
    "SELECT * FROM connectivity_zones WHERE " + pageWhere + " ORDER BY " + sort + " " + dir + " LIMIT ? OFFSET ?",
  ).bind(...pageArgs, per, cursor > 0 && sort === "id" ? 0 : (page - 1) * per).all<Connectivity_zone>();
  const out = json(results);
  out.headers.set("x-total-count", String(counted?.n ?? results.length));
  const last = results[results.length - 1];
  if (sort === "id" && last && results.length === per) out.headers.set("x-next-cursor", String(last.id));
  if (counted) out.headers.set("x-totals", JSON.stringify({ sync_success_rate: counted.s_sync_success_rate ?? 0 }));
  return out;
};

export const listConnectivity_zonesStats: ListConnectivity_zonesStatsHandler = async (req, env) => {
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
    ? "connectivity_zones JOIN (SELECT id AS \"hop.id\", " + hopCol + " AS \"hop.key\" FROM " + hop.table + " WHERE tenant = ? AND deleted_at IS NULL) ON \"hop.id\" = " + by.slice(0, dot)
    : "connectivity_zones";
  const { results } = await env.DB.prepare(
    "SELECT " + key + " AS key, COUNT(*) AS count, " + agg +
    " FROM " + from + " WHERE " + sc.where + " GROUP BY " + key + " ORDER BY count DESC LIMIT ?",
  ).bind(...(hop ? [user.tenant] : []), ...sc.args, limit).all<Bucket>();
  return json(results);
};

export const getConnectivity_zone: GetConnectivity_zoneHandler = async (req, env, params) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  const row = await env.DB.prepare("SELECT * FROM connectivity_zones WHERE id = ? AND tenant = ? AND deleted_at IS NULL").bind(params.id, user.tenant).first<Connectivity_zone>();
  if (!row) return json({ error: "not found" }, 404);
  const out = json(row);
  out.headers.set("etag", 'W/"' + row.row_version + '"');
  return out;
};

export const createConnectivity_zone: CreateConnectivity_zoneHandler = async (req, env) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  const denied = requireRole(user, WRITE_ROLES);
  if (denied) return denied;
  const body = await readJson<Partial<Connectivity_zone>>(req);
  if (!body) return json({ error: "invalid body" }, 400);
  const invalid = validate(body);
  if (invalid) return json({ error: invalid }, 400);
  const key = (req.headers.get("idempotency-key") ?? new URL(req.url).searchParams.get("idempotency_key") ?? "").trim().slice(0, 200);
  if (key) {
    const seen = await env.DB.prepare("SELECT row_id FROM idempotency WHERE tenant = ? AND key = ? AND endpoint = ?").bind(user.tenant, key, "createConnectivity_zone").first<{ row_id: number }>();
    if (seen) {
      const prior = await env.DB.prepare("SELECT * FROM connectivity_zones WHERE id = ? AND tenant = ? AND deleted_at IS NULL").bind(seen.row_id, user.tenant).first<Connectivity_zone>();
      if (prior) {
        const replay = json(prior);
        replay.headers.set("idempotent-replay", "true");
        return replay;
      }
    }
  }
  try {
    const res = await env.DB.prepare("INSERT INTO connectivity_zones (name, polygon_geojson, sync_success_rate, last_updated, technician_email, status, tenant) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(body.name ?? null, body.polygon_geojson ?? null, body.sync_success_rate ?? null, body.last_updated ?? null, body.technician_email ?? null, body.status ?? null, user.tenant).run();
    const row = await env.DB.prepare("SELECT * FROM connectivity_zones WHERE id = ?").bind(res.meta.last_row_id).first<Connectivity_zone>();
    if (key)
      await env.DB.prepare("INSERT OR IGNORE INTO idempotency (tenant, key, endpoint, row_id, at) VALUES (?, ?, ?, ?, ?)")
        .bind(user.tenant, key, "createConnectivity_zone", Number(res.meta.last_row_id), new Date().toISOString()).run();
    await audit(env, user, "create", "connectivity_zone", Number(res.meta.last_row_id), row);
    return row ? json(row) : json({ error: "insert failed" }, 500);
  } catch (err) {
    const bad = constraintError(err);
    if (!bad) throw err;
    return json({ error: bad, requestId: requestId(req) }, 409);
  }
};

export const createConnectivity_zoneBulk: CreateConnectivity_zoneBulkHandler = async (req, env) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  const denied = requireRole(user, WRITE_ROLES);
  if (denied) return denied;
  const payload = await readJson<{ rows?: Partial<Connectivity_zone>[] }>(req);
  const rows = payload?.rows;
  if (!Array.isArray(rows)) return json({ error: "expected { rows: [...] }" }, 400);
  if (!rows.length) return json({ error: "rows is empty" }, 400);
  if (rows.length > 100) return json({ error: "at most 100 rows per batch; got " + rows.length }, 400);
  for (let i = 0; i < rows.length; i++) {
    const bad = validate(rows[i] as Partial<Connectivity_zone>);
    if (bad) return json({ error: "row " + i + ": " + bad }, 400);
  }
  try {
    const stmt = env.DB.prepare("INSERT INTO connectivity_zones (name, polygon_geojson, sync_success_rate, last_updated, technician_email, status, tenant) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id");
    const out = await env.DB.batch<{ id: number }>(
      rows.map((body) => stmt.bind(body.name ?? null, body.polygon_geojson ?? null, body.sync_success_rate ?? null, body.last_updated ?? null, body.technician_email ?? null, body.status ?? null, user.tenant)),
    );
    const ids = out.flatMap((r) => (r.results ?? []).map((x) => x.id));
    for (const id of ids) await audit(env, user, "create", "connectivity_zone", id, null);
    return json({ created: ids.length, ids });
  } catch (err) {
    const bad = constraintError(err);
    if (!bad) throw err;
    return json({ error: bad, requestId: requestId(req) }, 409);
  }
};

export const updateConnectivity_zone: UpdateConnectivity_zoneHandler = async (req, env, params) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  const denied = requireRole(user, WRITE_ROLES);
  if (denied) return denied;
  const body = await readJson<Partial<Connectivity_zone>>(req);
  if (!body) return json({ error: "invalid body" }, 400);
  const invalid = validate(body, true);
  if (invalid) return json({ error: invalid }, 400);
  const next = body.status;
  if (next !== undefined && next !== null) {
    const cur = await env.DB.prepare("SELECT status FROM connectivity_zones WHERE id = ? AND tenant = ? AND deleted_at IS NULL").bind(params.id, user.tenant).first<{ status: string }>();
    if (!cur) return json({ error: "not found" }, 404);
    const allowed = WORKFLOW[cur.status] ?? [];
    if (next !== cur.status && !allowed.includes(next))
      return json({ error: "invalid status transition from " + cur.status + "; allowed: " + (allowed.length ? allowed.join(", ") : "none") }, 409);
  }
  const tag = (req.headers.get("if-match") ?? new URL(req.url).searchParams.get("if_match") ?? "").replace(/^W\//, "").replace(/"/g, "").trim();
  const want = tag ? Math.trunc(Number(tag)) : NaN;
  if (tag && !Number.isInteger(want)) return json({ error: "if-match must be a version number" }, 400);
  let sql = "UPDATE connectivity_zones SET name = COALESCE(?, name), polygon_geojson = COALESCE(?, polygon_geojson), sync_success_rate = COALESCE(?, sync_success_rate), last_updated = COALESCE(?, last_updated), technician_email = COALESCE(?, technician_email), status = COALESCE(?, status), row_version = row_version + 1 WHERE id = ? AND tenant = ? AND deleted_at IS NULL";
  const args: unknown[] = [body.name ?? null, body.polygon_geojson ?? null, body.sync_success_rate ?? null, body.last_updated ?? null, body.technician_email ?? null, body.status ?? null, params.id, user.tenant];
  if (Number.isInteger(want)) { sql += " AND row_version = ?"; args.push(want); }
  try {
    const res = await env.DB.prepare(sql).bind(...args).run();
    if (!res.meta.changes) {
      const cur = await env.DB.prepare("SELECT row_version FROM connectivity_zones WHERE id = ? AND tenant = ? AND deleted_at IS NULL").bind(params.id, user.tenant).first<{ row_version: number }>();
      if (!cur) return json({ error: "not found" }, 404);
      return json({ error: "version conflict: this record was changed by someone else (now at version " + cur.row_version + ")", requestId: requestId(req) }, 409);
    }
    const row = await env.DB.prepare("SELECT * FROM connectivity_zones WHERE id = ? AND tenant = ? AND deleted_at IS NULL").bind(params.id, user.tenant).first<Connectivity_zone>();
    if (row) await audit(env, user, "update", "connectivity_zone", Number(params.id), body);
    const out = row ? json(row) : json({ error: "not found" }, 404);
    if (row) out.headers.set("etag", 'W/"' + row.row_version + '"');
    return out;
  } catch (err) {
    const bad = constraintError(err);
    if (!bad) throw err;
    return json({ error: bad, requestId: requestId(req) }, 409);
  }
};

export const deleteConnectivity_zone: DeleteConnectivity_zoneHandler = async (req, env, params) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  const denied = requireRole(user, WRITE_ROLES);
  if (denied) return denied;
  const res = await env.DB.prepare("UPDATE connectivity_zones SET deleted_at = ? WHERE id = ? AND tenant = ? AND deleted_at IS NULL").bind(new Date().toISOString(), params.id, user.tenant).run();
  if (res.meta.changes) await audit(env, user, "delete", "connectivity_zone", Number(params.id), null);
  return res.meta.changes ? json({ ok: true }) : json({ error: "not found" }, 404);
};

export const deleteConnectivity_zoneRestore: DeleteConnectivity_zoneHandler = async (req, env, params) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  const denied = requireRole(user, ADMIN_ROLES);
  if (denied) return denied;
  const res = await env.DB.prepare("UPDATE connectivity_zones SET deleted_at = NULL WHERE id = ? AND tenant = ? AND deleted_at IS NOT NULL").bind(params.id, user.tenant).run();
  if (res.meta.changes) await audit(env, user, "restore", "connectivity_zone", Number(params.id), null);
  return res.meta.changes ? json({ ok: true }) : json({ error: "not found" }, 404);
};
