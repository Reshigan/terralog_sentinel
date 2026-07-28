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
  "SELECT * FROM (SELECT 'site' AS entity, b.id AS id, snippet(sites_fts, -1, '[', ']', '...', 12) AS snippet FROM sites_fts JOIN sites b ON b.id = sites_fts.rowid WHERE sites_fts MATCH ? AND b.tenant = ? AND b.deleted_at IS NULL ORDER BY rank LIMIT 20)",
  "SELECT * FROM (SELECT 'sync_log' AS entity, b.id AS id, snippet(sync_logs_fts, -1, '[', ']', '...', 12) AS snippet FROM sync_logs_fts JOIN sync_logs b ON b.id = sync_logs_fts.rowid WHERE sync_logs_fts MATCH ? AND b.tenant = ? AND b.deleted_at IS NULL ORDER BY rank LIMIT 20)",
  "SELECT * FROM (SELECT 'encryption_key' AS entity, b.id AS id, snippet(encryption_keys_fts, -1, '[', ']', '...', 12) AS snippet FROM encryption_keys_fts JOIN encryption_keys b ON b.id = encryption_keys_fts.rowid WHERE encryption_keys_fts MATCH ? AND b.tenant = ? AND b.deleted_at IS NULL ORDER BY rank LIMIT 20)",
  "SELECT * FROM (SELECT 'device' AS entity, b.id AS id, snippet(devices_fts, -1, '[', ']', '...', 12) AS snippet FROM devices_fts JOIN devices b ON b.id = devices_fts.rowid WHERE devices_fts MATCH ? AND b.tenant = ? AND b.deleted_at IS NULL ORDER BY rank LIMIT 20)",
  "SELECT * FROM (SELECT 'outlier' AS entity, b.id AS id, snippet(outliers_fts, -1, '[', ']', '...', 12) AS snippet FROM outliers_fts JOIN outliers b ON b.id = outliers_fts.rowid WHERE outliers_fts MATCH ? AND b.tenant = ? AND b.deleted_at IS NULL ORDER BY rank LIMIT 20)",
  "SELECT * FROM (SELECT 'sync_threshold' AS entity, b.id AS id, snippet(sync_thresholds_fts, -1, '[', ']', '...', 12) AS snippet FROM sync_thresholds_fts JOIN sync_thresholds b ON b.id = sync_thresholds_fts.rowid WHERE sync_thresholds_fts MATCH ? AND b.tenant = ? AND b.deleted_at IS NULL ORDER BY rank LIMIT 20)",
  "SELECT * FROM (SELECT 'passphrase' AS entity, b.id AS id, snippet(passphrases_fts, -1, '[', ']', '...', 12) AS snippet FROM passphrases_fts JOIN passphrases b ON b.id = passphrases_fts.rowid WHERE passphrases_fts MATCH ? AND b.tenant = ? AND b.deleted_at IS NULL ORDER BY rank LIMIT 20)",
  "SELECT * FROM (SELECT 'connectivity_zone' AS entity, b.id AS id, snippet(connectivity_zones_fts, -1, '[', ']', '...', 12) AS snippet FROM connectivity_zones_fts JOIN connectivity_zones b ON b.id = connectivity_zones_fts.rowid WHERE connectivity_zones_fts MATCH ? AND b.tenant = ? AND b.deleted_at IS NULL ORDER BY rank LIMIT 20)",
  "SELECT * FROM (SELECT 'reading_history' AS entity, b.id AS id, snippet(reading_historys_fts, -1, '[', ']', '...', 12) AS snippet FROM reading_historys_fts JOIN reading_historys b ON b.id = reading_historys_fts.rowid WHERE reading_historys_fts MATCH ? AND b.tenant = ? AND b.deleted_at IS NULL ORDER BY rank LIMIT 20)",
  "SELECT * FROM (SELECT 'site_visit' AS entity, b.id AS id, snippet(site_visits_fts, -1, '[', ']', '...', 12) AS snippet FROM site_visits_fts JOIN site_visits b ON b.id = site_visits_fts.rowid WHERE site_visits_fts MATCH ? AND b.tenant = ? AND b.deleted_at IS NULL ORDER BY rank LIMIT 20)",
  "SELECT * FROM (SELECT 'equipment' AS entity, b.id AS id, snippet(equipments_fts, -1, '[', ']', '...', 12) AS snippet FROM equipments_fts JOIN equipments b ON b.id = equipments_fts.rowid WHERE equipments_fts MATCH ? AND b.tenant = ? AND b.deleted_at IS NULL ORDER BY rank LIMIT 20)",
  "SELECT * FROM (SELECT 'calibration_log' AS entity, b.id AS id, snippet(calibration_logs_fts, -1, '[', ']', '...', 12) AS snippet FROM calibration_logs_fts JOIN calibration_logs b ON b.id = calibration_logs_fts.rowid WHERE calibration_logs_fts MATCH ? AND b.tenant = ? AND b.deleted_at IS NULL ORDER BY rank LIMIT 20)",
  "SELECT * FROM (SELECT 'notification' AS entity, b.id AS id, snippet(notifications_fts, -1, '[', ']', '...', 12) AS snippet FROM notifications_fts JOIN notifications b ON b.id = notifications_fts.rowid WHERE notifications_fts MATCH ? AND b.tenant = ? AND b.deleted_at IS NULL ORDER BY rank LIMIT 20)",
  "SELECT * FROM (SELECT 'sync_policy' AS entity, b.id AS id, snippet(sync_policys_fts, -1, '[', ']', '...', 12) AS snippet FROM sync_policys_fts JOIN sync_policys b ON b.id = sync_policys_fts.rowid WHERE sync_policys_fts MATCH ? AND b.tenant = ? AND b.deleted_at IS NULL ORDER BY rank LIMIT 20)",
  "SELECT * FROM (SELECT 'audit_trail' AS entity, b.id AS id, snippet(audit_trails_fts, -1, '[', ']', '...', 12) AS snippet FROM audit_trails_fts JOIN audit_trails b ON b.id = audit_trails_fts.rowid WHERE audit_trails_fts MATCH ? AND b.tenant = ? AND b.deleted_at IS NULL ORDER BY rank LIMIT 20)",
  "SELECT * FROM (SELECT 'maintenance_schedule' AS entity, b.id AS id, snippet(maintenance_schedules_fts, -1, '[', ']', '...', 12) AS snippet FROM maintenance_schedules_fts JOIN maintenance_schedules b ON b.id = maintenance_schedules_fts.rowid WHERE maintenance_schedules_fts MATCH ? AND b.tenant = ? AND b.deleted_at IS NULL ORDER BY rank LIMIT 20)",
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
