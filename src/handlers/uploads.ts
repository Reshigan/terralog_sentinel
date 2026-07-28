// GENERATED uploads handlers. Do not edit. Bytes in R2 (binding: UPLOADS),
// one row per object in D1 (migrations/0007_uploads.sql).
import { json, noteTenant } from "../lib/http";
import type { Env, Handler } from "../lib/http";
import { ROLES, WRITE_ROLES, audit, requireRole, requireSession } from "./auth";

// src/lib/http.ts is FROZEN template code and cannot know about a bucket that
// only exists once uploads are generated — so the binding is declared here, by
// augmentation. wrangler.jsonc stamps the matching r2_buckets entry.
declare module "../lib/http" {
  interface Env {
    UPLOADS: R2Bucket;
  }
}

/** Ceiling for one object. */
const MAX_BYTES = 10485760;

/** ALLOWLIST — an unrecognised type is rejected, never stored. text/html and
 * image/svg+xml are absent on purpose: both execute script on this origin. */
const ALLOWED = new Set<string>(["application/json","application/pdf","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/vnd.openxmlformats-officedocument.wordprocessingml.document","image/gif","image/jpeg","image/png","image/webp","text/csv","text/plain"]);

/** A stored object, as the API reports it. The R2 key is deliberately NOT in the
 * response: it is an internal address, and an id is all a client needs. */
export interface Upload {
  id: number;
  filename: string;
  content_type: string;
  size: number;
  created_at: string;
  uploaded_by: number;
}

/** The D1 row, key included — server-side only. */
interface UploadRow extends Upload {
  tenant: string;
  key: string;
}

const COLUMNS = "id, tenant, key, filename, content_type, size, created_at, uploaded_by";
const PUBLIC_COLUMNS = "id, filename, content_type, size, created_at, uploaded_by";

/** Everything this tenant may ever touch sits under this prefix. */
function prefixOf(tenant: string): string {
  return encodeURIComponent(tenant) + "/";
}

/** "text/csv; charset=utf-8" -> "text/csv". Parameters and case are noise; the
 * allowlist check must see exactly one canonical string or it fails open. */
function normalizeType(raw: string): string {
  return (raw.split(";")[0] ?? "").trim().toLowerCase();
}

/** A filename is display text that comes straight from a hostile client, and it
 * is echoed back in Content-Disposition. Keep a conservative set, drop any path
 * component, and fall back to "file" rather than storing an empty name. */
function safeName(raw: string): string {
  const base = (raw.split(/[\\/]/).pop() ?? "").replace(/[^A-Za-z0-9._ -]/g, "_").replace(/^\.+/, "").trim();
  return base.slice(0, 120) || "file";
}

/**
 * POST /api/uploads — multipart/form-data with one "file" part.
 *
 * Fails closed at every step: no session is 401, a viewer is 403, an unbound
 * bucket is 503, a non-multipart body is 415, an oversize body is 413 (on the
 * declared length BEFORE buffering, and again on the real byte count after —
 * Content-Length is a claim, not a fact), and a type outside the allowlist is
 * 415. The tenant is stamped from the VERIFIED session onto both the object key
 * and the row; no request field can influence who owns the result.
 */
export const uploadCreate: Handler<Upload | { error: string }> = async (req, env) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  const denied = requireRole(user, WRITE_ROLES); // the read-only role reads attachments, never adds them
  if (denied) return denied;
  if (!env.UPLOADS) return json({ error: "file storage is not configured" }, 503);

  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BYTES)
    return json({ error: "file too large: max " + MAX_BYTES + " bytes" }, 413);
  if (!normalizeType(req.headers.get("content-type") ?? "").startsWith("multipart/form-data"))
    return json({ error: 'expected multipart/form-data with a "file" part' }, 415);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "malformed multipart body" }, 400);
  }
  const part = form.get("file");
  if (!(part instanceof File)) return json({ error: 'missing "file" part' }, 400);

  const contentType = normalizeType(part.type);
  if (!ALLOWED.has(contentType))
    return json({ error: "unsupported content type: " + (contentType || "unknown") }, 415);

  const bytes = new Uint8Array(await part.arrayBuffer());
  if (bytes.byteLength === 0) return json({ error: "empty file" }, 400);
  if (bytes.byteLength > MAX_BYTES) return json({ error: "file too large: max " + MAX_BYTES + " bytes" }, 413);

  const filename = safeName(part.name || "file");
  const key = prefixOf(user.tenant) + crypto.randomUUID();
  const now = new Date().toISOString();

  // R2 first: a failure here leaves nothing behind. The reverse order leaves a
  // row pointing at bytes that were never written, which 404s for ever.
  // The tenant is stamped on the object too, so the bucket alone is enough to
  // answer "whose is this" during an incident.
  await env.UPLOADS.put(key, bytes, {
    httpMetadata: { contentType },
    customMetadata: { tenant: user.tenant, uploadedBy: String(user.id) },
  });

  const res = await env.DB.prepare(
    "INSERT INTO uploads (tenant, key, filename, content_type, size, created_at, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(user.tenant, key, filename, contentType, bytes.byteLength, now, user.id)
    .run();

  const row = await env.DB.prepare("SELECT " + PUBLIC_COLUMNS + " FROM uploads WHERE id = ?")
    .bind(res.meta.last_row_id)
    .first<Upload>();
  if (!row) return json({ error: "upload failed" }, 500);
  await audit(env, user, "create", "upload", row.id, { filename, content_type: contentType, size: row.size });
  return json(row, 201);
};

/** GET /api/uploads — this workspace's attachments, newest first. Any
 * authenticated role may look; the filter comes off the verified session.
 * ponytail: newest 200, no cursor — same ceiling as the audit trail. */
export const uploadList: Handler<Upload[] | { error: string }> = async (req, env) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  const forbidden = requireRole(user, ROLES);
  if (forbidden) return forbidden;
  const { results } = await env.DB.prepare(
    "SELECT " + PUBLIC_COLUMNS + " FROM uploads WHERE tenant = ? ORDER BY created_at DESC, id DESC LIMIT 200",
  )
    .bind(user.tenant)
    .all<Upload>();
  return json(results);
};

/**
 * GET /api/uploads/:id — the bytes.
 *
 * Two independent ownership checks, because one leak here is another
 * workspace's document: the D1 row's tenant must be the session's tenant, and
 * the key must sit under that tenant's prefix. A row belonging to someone else
 * is 403 — never the object, and never a redirect to it.
 *
 * Served as an attachment with nosniff so a stored file can never be re-read as
 * markup on this origin, and no-store because the response is tenant-private
 * and must not land in a shared cache.
 */
export const uploadGet: Handler<{ error: string }> = async (req, env, params) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  const forbidden = requireRole(user, ROLES);
  if (forbidden) return forbidden;
  if (!env.UPLOADS) return json({ error: "file storage is not configured" }, 503);

  const row = await env.DB.prepare("SELECT " + COLUMNS + " FROM uploads WHERE id = ?")
    .bind(params.id)
    .first<UploadRow>();
  if (!row) return json({ error: "not found" }, 404);
  // ponytail: 403 (not 404) on another tenant's id, so the answer is unambiguous
  // in an audit — it does confirm the id exists. Return 404 here instead if
  // enumeration ever matters more than the clearer signal.
  if (row.tenant !== user.tenant || !row.key.startsWith(prefixOf(user.tenant)))
    return json({ error: "forbidden" }, 403);

  const obj = await env.UPLOADS.get(row.key);
  if (!obj) return json({ error: "not found" }, 404);
  return new Response(obj.body, {
    headers: {
      "content-type": row.content_type,
      "content-length": String(row.size),
      "content-disposition": 'attachment; filename="' + row.filename + '"',
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    },
  });
};

/** DELETE /api/uploads/:id — remove the row and the bytes, this tenant only.
 * D1 first here, deliberately: the row is what the app can see, so dropping it
 * first means a mid-flight failure leaves unreferenced bytes rather than a live
 * attachment whose object has already gone. */
export const uploadDelete: Handler<{ ok: true } | { error: string }> = async (req, env, params) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  const denied = requireRole(user, WRITE_ROLES);
  if (denied) return denied;
  if (!env.UPLOADS) return json({ error: "file storage is not configured" }, 503);

  const row = await env.DB.prepare("SELECT " + COLUMNS + " FROM uploads WHERE id = ?")
    .bind(params.id)
    .first<UploadRow>();
  if (!row) return json({ error: "not found" }, 404);
  if (row.tenant !== user.tenant || !row.key.startsWith(prefixOf(user.tenant)))
    return json({ error: "forbidden" }, 403);

  await env.DB.prepare("DELETE FROM uploads WHERE id = ? AND tenant = ?").bind(row.id, user.tenant).run();
  await env.UPLOADS.delete(row.key);
  await audit(env, user, "delete", "upload", row.id, null);
  return json({ ok: true } as const);
};
