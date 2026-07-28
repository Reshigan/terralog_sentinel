// GENERATED from the manifest. Do not edit.
import { json, noteTenant, readJson, requestId } from "../lib/http";
import { ADMIN_ROLES, audit, requireRole, requireSession, WRITE_ROLES } from "./auth";
import type { Notification, Bucket, ListNotificationsHandler, ListNotificationsStatsHandler, GetNotificationHandler, CreateNotificationHandler, CreateNotificationBulkHandler, UpdateNotificationHandler, DeleteNotificationHandler } from "../types";

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
const FIELDS: Spec[] = [{ name: "recipient_email", type: "text" }, { name: "type", type: "enum", values: ["sync_failure","outlier_detected","visit_reminder","calibration_due","device_lost"] }, { name: "content", type: "text" }, { name: "is_read", type: "bool" }, { name: "created_at", type: "date" }, { name: "related_entity_id", type: "integer" }, { name: "related_entity_type", type: "enum", values: ["reading","site_visit","equipment","device"] }];
function validate(body: Partial<Notification>, partial = false): string | null {
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

const SORTABLE: string[] = ["id","recipient_email","type","content","is_read","created_at","related_entity_id","related_entity_type"];
const SEARCHABLE: string[] = ["recipient_email","type","content","created_at","related_entity_type"];
const FILTERABLE: string[] = [];
const MATCHABLE: string[] = ["type","related_entity_type"];
const DATED: string[] = ["created_at"];
const GROUPABLE: string[] = ["type","is_read","created_at","related_entity_type"];
const MEASURABLE: string[] = ["related_entity_id"];
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

export const listNotifications: ListNotificationsHandler = async (req, env) => {
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
  const counted = await env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(related_entity_id), 0) AS s_related_entity_id FROM notifications WHERE " + where).bind(...args).first<Record<string, number>>();
  let pageWhere = where;
  const pageArgs = [...args];
  const cursor = Math.trunc(Number(url.searchParams.get("cursor")));
  if (sort === "id" && Number.isInteger(cursor) && cursor > 0) {
    pageWhere += dir === "ASC" ? " AND id > ?" : " AND id < ?";
    pageArgs.push(cursor);
  }
  const { results } = await env.DB.prepare(
    "SELECT * FROM notifications WHERE " + pageWhere + " ORDER BY " + sort + " " + dir + " LIMIT ? OFFSET ?",
  ).bind(...pageArgs, per, cursor > 0 && sort === "id" ? 0 : (page - 1) * per).all<Notification>();
  const out = json(results);
  out.headers.set("x-total-count", String(counted?.n ?? results.length));
  const last = results[results.length - 1];
  if (sort === "id" && last && results.length === per) out.headers.set("x-next-cursor", String(last.id));
  if (counted) out.headers.set("x-totals", JSON.stringify({ related_entity_id: counted.s_related_entity_id ?? 0 }));
  return out;
};

export const listNotificationsStats: ListNotificationsStatsHandler = async (req, env) => {
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
    ? "notifications JOIN (SELECT id AS \"hop.id\", " + hopCol + " AS \"hop.key\" FROM " + hop.table + " WHERE tenant = ? AND deleted_at IS NULL) ON \"hop.id\" = " + by.slice(0, dot)
    : "notifications";
  const { results } = await env.DB.prepare(
    "SELECT " + key + " AS key, COUNT(*) AS count, " + agg +
    " FROM " + from + " WHERE " + sc.where + " GROUP BY " + key + " ORDER BY count DESC LIMIT ?",
  ).bind(...(hop ? [user.tenant] : []), ...sc.args, limit).all<Bucket>();
  return json(results);
};

export const getNotification: GetNotificationHandler = async (req, env, params) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  const row = await env.DB.prepare("SELECT * FROM notifications WHERE id = ? AND tenant = ? AND deleted_at IS NULL").bind(params.id, user.tenant).first<Notification>();
  if (!row) return json({ error: "not found" }, 404);
  const out = json(row);
  out.headers.set("etag", 'W/"' + row.row_version + '"');
  return out;
};

export const createNotification: CreateNotificationHandler = async (req, env) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  const denied = requireRole(user, WRITE_ROLES);
  if (denied) return denied;
  const body = await readJson<Partial<Notification>>(req);
  if (!body) return json({ error: "invalid body" }, 400);
  const invalid = validate(body);
  if (invalid) return json({ error: invalid }, 400);
  const key = (req.headers.get("idempotency-key") ?? new URL(req.url).searchParams.get("idempotency_key") ?? "").trim().slice(0, 200);
  if (key) {
    const seen = await env.DB.prepare("SELECT row_id FROM idempotency WHERE tenant = ? AND key = ? AND endpoint = ?").bind(user.tenant, key, "createNotification").first<{ row_id: number }>();
    if (seen) {
      const prior = await env.DB.prepare("SELECT * FROM notifications WHERE id = ? AND tenant = ? AND deleted_at IS NULL").bind(seen.row_id, user.tenant).first<Notification>();
      if (prior) {
        const replay = json(prior);
        replay.headers.set("idempotent-replay", "true");
        return replay;
      }
    }
  }
  try {
    const res = await env.DB.prepare("INSERT INTO notifications (recipient_email, type, content, is_read, created_at, related_entity_id, related_entity_type, tenant) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(body.recipient_email ?? null, body.type ?? null, body.content ?? null, body.is_read ?? null, body.created_at ?? null, body.related_entity_id ?? null, body.related_entity_type ?? null, user.tenant).run();
    const row = await env.DB.prepare("SELECT * FROM notifications WHERE id = ?").bind(res.meta.last_row_id).first<Notification>();
    if (key)
      await env.DB.prepare("INSERT OR IGNORE INTO idempotency (tenant, key, endpoint, row_id, at) VALUES (?, ?, ?, ?, ?)")
        .bind(user.tenant, key, "createNotification", Number(res.meta.last_row_id), new Date().toISOString()).run();
    await audit(env, user, "create", "notification", Number(res.meta.last_row_id), row);
    return row ? json(row) : json({ error: "insert failed" }, 500);
  } catch (err) {
    const bad = constraintError(err);
    if (!bad) throw err;
    return json({ error: bad, requestId: requestId(req) }, 409);
  }
};

export const createNotificationBulk: CreateNotificationBulkHandler = async (req, env) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  const denied = requireRole(user, WRITE_ROLES);
  if (denied) return denied;
  const payload = await readJson<{ rows?: Partial<Notification>[] }>(req);
  const rows = payload?.rows;
  if (!Array.isArray(rows)) return json({ error: "expected { rows: [...] }" }, 400);
  if (!rows.length) return json({ error: "rows is empty" }, 400);
  if (rows.length > 100) return json({ error: "at most 100 rows per batch; got " + rows.length }, 400);
  for (let i = 0; i < rows.length; i++) {
    const bad = validate(rows[i] as Partial<Notification>);
    if (bad) return json({ error: "row " + i + ": " + bad }, 400);
  }
  try {
    const stmt = env.DB.prepare("INSERT INTO notifications (recipient_email, type, content, is_read, created_at, related_entity_id, related_entity_type, tenant) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id");
    const out = await env.DB.batch<{ id: number }>(
      rows.map((body) => stmt.bind(body.recipient_email ?? null, body.type ?? null, body.content ?? null, body.is_read ?? null, body.created_at ?? null, body.related_entity_id ?? null, body.related_entity_type ?? null, user.tenant)),
    );
    const ids = out.flatMap((r) => (r.results ?? []).map((x) => x.id));
    for (const id of ids) await audit(env, user, "create", "notification", id, null);
    return json({ created: ids.length, ids });
  } catch (err) {
    const bad = constraintError(err);
    if (!bad) throw err;
    return json({ error: bad, requestId: requestId(req) }, 409);
  }
};

export const updateNotification: UpdateNotificationHandler = async (req, env, params) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  const denied = requireRole(user, WRITE_ROLES);
  if (denied) return denied;
  const body = await readJson<Partial<Notification>>(req);
  if (!body) return json({ error: "invalid body" }, 400);
  const invalid = validate(body, true);
  if (invalid) return json({ error: invalid }, 400);
  const tag = (req.headers.get("if-match") ?? new URL(req.url).searchParams.get("if_match") ?? "").replace(/^W\//, "").replace(/"/g, "").trim();
  const want = tag ? Math.trunc(Number(tag)) : NaN;
  if (tag && !Number.isInteger(want)) return json({ error: "if-match must be a version number" }, 400);
  let sql = "UPDATE notifications SET recipient_email = COALESCE(?, recipient_email), type = COALESCE(?, type), content = COALESCE(?, content), is_read = COALESCE(?, is_read), created_at = COALESCE(?, created_at), related_entity_id = COALESCE(?, related_entity_id), related_entity_type = COALESCE(?, related_entity_type), row_version = row_version + 1 WHERE id = ? AND tenant = ? AND deleted_at IS NULL";
  const args: unknown[] = [body.recipient_email ?? null, body.type ?? null, body.content ?? null, body.is_read ?? null, body.created_at ?? null, body.related_entity_id ?? null, body.related_entity_type ?? null, params.id, user.tenant];
  if (Number.isInteger(want)) { sql += " AND row_version = ?"; args.push(want); }
  try {
    const res = await env.DB.prepare(sql).bind(...args).run();
    if (!res.meta.changes) {
      const cur = await env.DB.prepare("SELECT row_version FROM notifications WHERE id = ? AND tenant = ? AND deleted_at IS NULL").bind(params.id, user.tenant).first<{ row_version: number }>();
      if (!cur) return json({ error: "not found" }, 404);
      return json({ error: "version conflict: this record was changed by someone else (now at version " + cur.row_version + ")", requestId: requestId(req) }, 409);
    }
    const row = await env.DB.prepare("SELECT * FROM notifications WHERE id = ? AND tenant = ? AND deleted_at IS NULL").bind(params.id, user.tenant).first<Notification>();
    if (row) await audit(env, user, "update", "notification", Number(params.id), body);
    const out = row ? json(row) : json({ error: "not found" }, 404);
    if (row) out.headers.set("etag", 'W/"' + row.row_version + '"');
    return out;
  } catch (err) {
    const bad = constraintError(err);
    if (!bad) throw err;
    return json({ error: bad, requestId: requestId(req) }, 409);
  }
};

export const deleteNotification: DeleteNotificationHandler = async (req, env, params) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  const denied = requireRole(user, WRITE_ROLES);
  if (denied) return denied;
  const res = await env.DB.prepare("UPDATE notifications SET deleted_at = ? WHERE id = ? AND tenant = ? AND deleted_at IS NULL").bind(new Date().toISOString(), params.id, user.tenant).run();
  if (res.meta.changes) await audit(env, user, "delete", "notification", Number(params.id), null);
  return res.meta.changes ? json({ ok: true }) : json({ error: "not found" }, 404);
};

export const deleteNotificationRestore: DeleteNotificationHandler = async (req, env, params) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  const denied = requireRole(user, ADMIN_ROLES);
  if (denied) return denied;
  const res = await env.DB.prepare("UPDATE notifications SET deleted_at = NULL WHERE id = ? AND tenant = ? AND deleted_at IS NOT NULL").bind(params.id, user.tenant).run();
  if (res.meta.changes) await audit(env, user, "restore", "notification", Number(params.id), null);
  return res.meta.changes ? json({ ok: true }) : json({ error: "not found" }, 404);
};
