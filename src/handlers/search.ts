// GENERATED search handler. Do not edit.
import { json, noteTenant } from "../lib/http";
import type { Handler } from "../lib/http";
import { ROLES, requireRole, requireSession } from "./auth";

/** One match: which record type, which row, and the matching text in context. */
export interface SearchHit {
  entity: string;
  id: number;
  snippet: string;
}

// One tenant-filtered SELECT per searchable entity, generated from the manifest.
// Empty when no entity has a text or enum field to index.
const BRANCHES: readonly string[] = [
  "SELECT * FROM (SELECT 'reading' AS entity, b.id AS id, snippet(readings_fts, -1, '[', ']', '...', 12) AS snippet FROM readings_fts JOIN readings b ON b.id = readings_fts.rowid WHERE readings_fts MATCH ? AND b.tenant = ? AND b.deleted_at IS NULL ORDER BY rank LIMIT 20)",
  "SELECT * FROM (SELECT 'sync_log' AS entity, b.id AS id, snippet(sync_logs_fts, -1, '[', ']', '...', 12) AS snippet FROM sync_logs_fts JOIN sync_logs b ON b.id = sync_logs_fts.rowid WHERE sync_logs_fts MATCH ? AND b.tenant = ? AND b.deleted_at IS NULL ORDER BY rank LIMIT 20)",
  "SELECT * FROM (SELECT 'encryption_key' AS entity, b.id AS id, snippet(encryption_keys_fts, -1, '[', ']', '...', 12) AS snippet FROM encryption_keys_fts JOIN encryption_keys b ON b.id = encryption_keys_fts.rowid WHERE encryption_keys_fts MATCH ? AND b.tenant = ? AND b.deleted_at IS NULL ORDER BY rank LIMIT 20)",
  "SELECT * FROM (SELECT 'erasure_policy' AS entity, b.id AS id, snippet(erasure_policys_fts, -1, '[', ']', '...', 12) AS snippet FROM erasure_policys_fts JOIN erasure_policys b ON b.id = erasure_policys_fts.rowid WHERE erasure_policys_fts MATCH ? AND b.tenant = ? AND b.deleted_at IS NULL ORDER BY rank LIMIT 20)",
  "SELECT * FROM (SELECT 'anomaly' AS entity, b.id AS id, snippet(anomalys_fts, -1, '[', ']', '...', 12) AS snippet FROM anomalys_fts JOIN anomalys b ON b.id = anomalys_fts.rowid WHERE anomalys_fts MATCH ? AND b.tenant = ? AND b.deleted_at IS NULL ORDER BY rank LIMIT 20)",
  "SELECT * FROM (SELECT 'grid_cell' AS entity, b.id AS id, snippet(grid_cells_fts, -1, '[', ']', '...', 12) AS snippet FROM grid_cells_fts JOIN grid_cells b ON b.id = grid_cells_fts.rowid WHERE grid_cells_fts MATCH ? AND b.tenant = ? AND b.deleted_at IS NULL ORDER BY rank LIMIT 20)",
  "SELECT * FROM (SELECT 'technician' AS entity, b.id AS id, snippet(technicians_fts, -1, '[', ']', '...', 12) AS snippet FROM technicians_fts JOIN technicians b ON b.id = technicians_fts.rowid WHERE technicians_fts MATCH ? AND b.tenant = ? AND b.deleted_at IS NULL ORDER BY rank LIMIT 20)",
  "SELECT * FROM (SELECT 'site' AS entity, b.id AS id, snippet(sites_fts, -1, '[', ']', '...', 12) AS snippet FROM sites_fts JOIN sites b ON b.id = sites_fts.rowid WHERE sites_fts MATCH ? AND b.tenant = ? AND b.deleted_at IS NULL ORDER BY rank LIMIT 20)",
  "SELECT * FROM (SELECT 'reading_type' AS entity, b.id AS id, snippet(reading_types_fts, -1, '[', ']', '...', 12) AS snippet FROM reading_types_fts JOIN reading_types b ON b.id = reading_types_fts.rowid WHERE reading_types_fts MATCH ? AND b.tenant = ? AND b.deleted_at IS NULL ORDER BY rank LIMIT 20)",
  "SELECT * FROM (SELECT 'sync_policy' AS entity, b.id AS id, snippet(sync_policys_fts, -1, '[', ']', '...', 12) AS snippet FROM sync_policys_fts JOIN sync_policys b ON b.id = sync_policys_fts.rowid WHERE sync_policys_fts MATCH ? AND b.tenant = ? AND b.deleted_at IS NULL ORDER BY rank LIMIT 20)",
  "SELECT * FROM (SELECT 'device' AS entity, b.id AS id, snippet(devices_fts, -1, '[', ']', '...', 12) AS snippet FROM devices_fts JOIN devices b ON b.id = devices_fts.rowid WHERE devices_fts MATCH ? AND b.tenant = ? AND b.deleted_at IS NULL ORDER BY rank LIMIT 20)",
  "SELECT * FROM (SELECT 'permission' AS entity, b.id AS id, snippet(permissions_fts, -1, '[', ']', '...', 12) AS snippet FROM permissions_fts JOIN permissions b ON b.id = permissions_fts.rowid WHERE permissions_fts MATCH ? AND b.tenant = ? AND b.deleted_at IS NULL ORDER BY rank LIMIT 20)",
  "SELECT * FROM (SELECT 'audit_log' AS entity, b.id AS id, snippet(audit_logs_fts, -1, '[', ']', '...', 12) AS snippet FROM audit_logs_fts JOIN audit_logs b ON b.id = audit_logs_fts.rowid WHERE audit_logs_fts MATCH ? AND b.tenant = ? AND b.deleted_at IS NULL ORDER BY rank LIMIT 20)",
  "SELECT * FROM (SELECT 'region' AS entity, b.id AS id, snippet(regions_fts, -1, '[', ']', '...', 12) AS snippet FROM regions_fts JOIN regions b ON b.id = regions_fts.rowid WHERE regions_fts MATCH ? AND b.tenant = ? AND b.deleted_at IS NULL ORDER BY rank LIMIT 20)",
  "SELECT * FROM (SELECT 'maintenance_schedule' AS entity, b.id AS id, snippet(maintenance_schedules_fts, -1, '[', ']', '...', 12) AS snippet FROM maintenance_schedules_fts JOIN maintenance_schedules b ON b.id = maintenance_schedules_fts.rowid WHERE maintenance_schedules_fts MATCH ? AND b.tenant = ? AND b.deleted_at IS NULL ORDER BY rank LIMIT 20)",
  "SELECT * FROM (SELECT 'photo_blob' AS entity, b.id AS id, snippet(photo_blobs_fts, -1, '[', ']', '...', 12) AS snippet FROM photo_blobs_fts JOIN photo_blobs b ON b.id = photo_blobs_fts.rowid WHERE photo_blobs_fts MATCH ? AND b.tenant = ? AND b.deleted_at IS NULL ORDER BY rank LIMIT 20)",
  "SELECT * FROM (SELECT 'sync_session' AS entity, b.id AS id, snippet(sync_sessions_fts, -1, '[', ']', '...', 12) AS snippet FROM sync_sessions_fts JOIN sync_sessions b ON b.id = sync_sessions_fts.rowid WHERE sync_sessions_fts MATCH ? AND b.tenant = ? AND b.deleted_at IS NULL ORDER BY rank LIMIT 20)",
];

const MAX_HITS = 60;
const MAX_TERMS = 12;
const MAX_QUERY_CHARS = 200;

/** Turn arbitrary user text into a legal FTS5 MATCH expression.
 *
 * MATCH takes a query LANGUAGE, not a string: a lone `"`, a trailing `AND`, a
 * bare `(` or `NEAR` are syntax errors, and a syntax error inside a prepared
 * statement surfaces as a 500 on a search box. So no user character is ever
 * allowed to reach the parser AS syntax — every whitespace-separated run becomes
 * one double-quoted phrase (the only escape inside a phrase is "" for a literal
 * quote), which makes every operator, quote and bracket literal text. Phrases
 * juxtapose, which FTS5 reads as AND. The last term gets a trailing * so typing
 * "mass" still finds "massage" before the word is finished.
 *
 * A phrase that tokenises to nothing ("---") matches nothing — it does not throw,
 * which is why sanitising is enough and a try/catch is not needed. */
function ftsQuery(raw: string): string {
  const terms = raw.slice(0, MAX_QUERY_CHARS).split(/\s+/).filter(Boolean).slice(0, MAX_TERMS);
  const phrases = terms.map((t) => '"' + t.replace(/"/g, '""') + '"');
  if (!phrases.length) return "";
  return phrases.slice(0, -1).concat(phrases[phrases.length - 1] + "*").join(" ");
}

/**
 * GET /api/search?q= — every entity at once, this tenant only.
 *
 * The tenant comes from the verified session and is bound into every branch, so
 * a hit from another workspace is not filtered out at the end: it is never
 * selected. Any of THIS app's roles may read (a read-only role's whole job is
 * looking) — ROLES is the contract's own vocabulary, stamped once in auth.ts, so
 * the guard is still exact membership: a session carrying a role this app never
 * declared is refused rather than waved through by an unchecked read.
 *
 * ponytail: top 20 per entity, 60 overall, no cursor and no cross-entity
 * relevance ordering (bm25 scores are not comparable between tables). Add paging
 * when a search box actually needs a second page.
 */
export const search: Handler<SearchHit[] | { error: string }> = async (req, env) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  const forbidden = requireRole(user, ROLES);
  if (forbidden) return forbidden;

  const q = ftsQuery(new URL(req.url).searchParams.get("q") ?? "");
  if (!q || BRANCHES.length === 0) return json([]);

  const sql = BRANCHES.join(" UNION ALL ") + " LIMIT " + MAX_HITS;
  const binds = BRANCHES.flatMap(() => [q, user.tenant]);
  const { results } = await env.DB.prepare(sql).bind(...binds).all<SearchHit>();
  return json(results);
};
