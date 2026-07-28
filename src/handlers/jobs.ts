// GENERATED jobs reader. Do not edit. The queue ENGINE is frozen template code
// (src/lib/jobs.ts — enqueue + drainJobs, drained by scheduled() in src/index.ts);
// this module is the operator's window onto it.
import { json, noteTenant } from "../lib/http";
import type { Env, Handler } from "../lib/http";
import { ADMIN_ROLES, audit, requireRole, requireSession } from "./auth";
import { jobRunners, type JobStatus } from "../lib/jobs";

// Re-exported so a handler queues work with one import from its own neighbour:
//   import { enqueue } from "./jobs";
//   await enqueue(env, user.tenant, "invoice.email", { id: row.id });
export { enqueue } from "../lib/jobs";

const STATUSES: readonly JobStatus[] = ["pending", "running", "done", "dead"];

/** payload is deliberately absent: an operator needs to see WHAT is stuck and
 * WHY, and a queued payload can hold customer data that a queue view has no
 * reason to re-expose. */
interface JobsListRow {
  id: number;
  kind: string;
  status: string;
  attempts: number;
  max_attempts: number;
  run_at: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

const COLUMNS = "id, kind, status, attempts, max_attempts, run_at, last_error, created_at, updated_at";
const PAGE = 200;
const ORDER = " ORDER BY created_at DESC, id DESC LIMIT " + PAGE;
// Keyset paging, not OFFSET: the client sends the LAST row it got back as
// ?cursor=<id> and the next page is strictly older rows. The tuple is the same
// (created_at, id) the ORDER and the tenant index lead with, so a page boundary
// can neither skip nor repeat a row when two jobs share a timestamp. The cursor
// row is re-checked against the session tenant, so a guessed id from another
// workspace resolves to nothing rather than paging their queue.
const CURSOR = " AND (created_at, id) < (SELECT created_at, id FROM jobs WHERE id = ? AND tenant = ?)";

// ---- digest runners --------------------------------------------------------------
// One kind per mutable entity, matching the triggers in migrations/0006_jobs_enqueue.sql.
jobRunners["reading.digest"] = async (env, _payload, job) => {
  // The tenant comes off the QUEUED ROW, which the trigger stamped from the tenant
  // of the row that was written — never from the payload, which nothing verifies.
  const counted = await env.DB.prepare("SELECT COUNT(*) AS n FROM readings WHERE tenant = ? AND deleted_at IS NULL")
    .bind(job.tenant)
    .first<{ n: number }>();
  await env.DB.prepare(
    "INSERT INTO job_digests (tenant, entity, row_count, computed_at) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT (tenant, entity) DO UPDATE SET row_count = excluded.row_count, computed_at = excluded.computed_at",
  )
    .bind(job.tenant, "reading", counted?.n ?? 0, new Date().toISOString())
    .run();
};

jobRunners["sync_log.digest"] = async (env, _payload, job) => {
  // The tenant comes off the QUEUED ROW, which the trigger stamped from the tenant
  // of the row that was written — never from the payload, which nothing verifies.
  const counted = await env.DB.prepare("SELECT COUNT(*) AS n FROM sync_logs WHERE tenant = ? AND deleted_at IS NULL")
    .bind(job.tenant)
    .first<{ n: number }>();
  await env.DB.prepare(
    "INSERT INTO job_digests (tenant, entity, row_count, computed_at) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT (tenant, entity) DO UPDATE SET row_count = excluded.row_count, computed_at = excluded.computed_at",
  )
    .bind(job.tenant, "sync_log", counted?.n ?? 0, new Date().toISOString())
    .run();
};

jobRunners["encryption_key.digest"] = async (env, _payload, job) => {
  // The tenant comes off the QUEUED ROW, which the trigger stamped from the tenant
  // of the row that was written — never from the payload, which nothing verifies.
  const counted = await env.DB.prepare("SELECT COUNT(*) AS n FROM encryption_keys WHERE tenant = ? AND deleted_at IS NULL")
    .bind(job.tenant)
    .first<{ n: number }>();
  await env.DB.prepare(
    "INSERT INTO job_digests (tenant, entity, row_count, computed_at) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT (tenant, entity) DO UPDATE SET row_count = excluded.row_count, computed_at = excluded.computed_at",
  )
    .bind(job.tenant, "encryption_key", counted?.n ?? 0, new Date().toISOString())
    .run();
};

jobRunners["erasure_policy.digest"] = async (env, _payload, job) => {
  // The tenant comes off the QUEUED ROW, which the trigger stamped from the tenant
  // of the row that was written — never from the payload, which nothing verifies.
  const counted = await env.DB.prepare("SELECT COUNT(*) AS n FROM erasure_policys WHERE tenant = ? AND deleted_at IS NULL")
    .bind(job.tenant)
    .first<{ n: number }>();
  await env.DB.prepare(
    "INSERT INTO job_digests (tenant, entity, row_count, computed_at) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT (tenant, entity) DO UPDATE SET row_count = excluded.row_count, computed_at = excluded.computed_at",
  )
    .bind(job.tenant, "erasure_policy", counted?.n ?? 0, new Date().toISOString())
    .run();
};

jobRunners["anomaly.digest"] = async (env, _payload, job) => {
  // The tenant comes off the QUEUED ROW, which the trigger stamped from the tenant
  // of the row that was written — never from the payload, which nothing verifies.
  const counted = await env.DB.prepare("SELECT COUNT(*) AS n FROM anomalys WHERE tenant = ? AND deleted_at IS NULL")
    .bind(job.tenant)
    .first<{ n: number }>();
  await env.DB.prepare(
    "INSERT INTO job_digests (tenant, entity, row_count, computed_at) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT (tenant, entity) DO UPDATE SET row_count = excluded.row_count, computed_at = excluded.computed_at",
  )
    .bind(job.tenant, "anomaly", counted?.n ?? 0, new Date().toISOString())
    .run();
};

jobRunners["grid_cell.digest"] = async (env, _payload, job) => {
  // The tenant comes off the QUEUED ROW, which the trigger stamped from the tenant
  // of the row that was written — never from the payload, which nothing verifies.
  const counted = await env.DB.prepare("SELECT COUNT(*) AS n FROM grid_cells WHERE tenant = ? AND deleted_at IS NULL")
    .bind(job.tenant)
    .first<{ n: number }>();
  await env.DB.prepare(
    "INSERT INTO job_digests (tenant, entity, row_count, computed_at) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT (tenant, entity) DO UPDATE SET row_count = excluded.row_count, computed_at = excluded.computed_at",
  )
    .bind(job.tenant, "grid_cell", counted?.n ?? 0, new Date().toISOString())
    .run();
};

jobRunners["technician.digest"] = async (env, _payload, job) => {
  // The tenant comes off the QUEUED ROW, which the trigger stamped from the tenant
  // of the row that was written — never from the payload, which nothing verifies.
  const counted = await env.DB.prepare("SELECT COUNT(*) AS n FROM technicians WHERE tenant = ? AND deleted_at IS NULL")
    .bind(job.tenant)
    .first<{ n: number }>();
  await env.DB.prepare(
    "INSERT INTO job_digests (tenant, entity, row_count, computed_at) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT (tenant, entity) DO UPDATE SET row_count = excluded.row_count, computed_at = excluded.computed_at",
  )
    .bind(job.tenant, "technician", counted?.n ?? 0, new Date().toISOString())
    .run();
};

jobRunners["site.digest"] = async (env, _payload, job) => {
  // The tenant comes off the QUEUED ROW, which the trigger stamped from the tenant
  // of the row that was written — never from the payload, which nothing verifies.
  const counted = await env.DB.prepare("SELECT COUNT(*) AS n FROM sites WHERE tenant = ? AND deleted_at IS NULL")
    .bind(job.tenant)
    .first<{ n: number }>();
  await env.DB.prepare(
    "INSERT INTO job_digests (tenant, entity, row_count, computed_at) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT (tenant, entity) DO UPDATE SET row_count = excluded.row_count, computed_at = excluded.computed_at",
  )
    .bind(job.tenant, "site", counted?.n ?? 0, new Date().toISOString())
    .run();
};

jobRunners["reading_type.digest"] = async (env, _payload, job) => {
  // The tenant comes off the QUEUED ROW, which the trigger stamped from the tenant
  // of the row that was written — never from the payload, which nothing verifies.
  const counted = await env.DB.prepare("SELECT COUNT(*) AS n FROM reading_types WHERE tenant = ? AND deleted_at IS NULL")
    .bind(job.tenant)
    .first<{ n: number }>();
  await env.DB.prepare(
    "INSERT INTO job_digests (tenant, entity, row_count, computed_at) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT (tenant, entity) DO UPDATE SET row_count = excluded.row_count, computed_at = excluded.computed_at",
  )
    .bind(job.tenant, "reading_type", counted?.n ?? 0, new Date().toISOString())
    .run();
};

jobRunners["sync_policy.digest"] = async (env, _payload, job) => {
  // The tenant comes off the QUEUED ROW, which the trigger stamped from the tenant
  // of the row that was written — never from the payload, which nothing verifies.
  const counted = await env.DB.prepare("SELECT COUNT(*) AS n FROM sync_policys WHERE tenant = ? AND deleted_at IS NULL")
    .bind(job.tenant)
    .first<{ n: number }>();
  await env.DB.prepare(
    "INSERT INTO job_digests (tenant, entity, row_count, computed_at) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT (tenant, entity) DO UPDATE SET row_count = excluded.row_count, computed_at = excluded.computed_at",
  )
    .bind(job.tenant, "sync_policy", counted?.n ?? 0, new Date().toISOString())
    .run();
};

jobRunners["device.digest"] = async (env, _payload, job) => {
  // The tenant comes off the QUEUED ROW, which the trigger stamped from the tenant
  // of the row that was written — never from the payload, which nothing verifies.
  const counted = await env.DB.prepare("SELECT COUNT(*) AS n FROM devices WHERE tenant = ? AND deleted_at IS NULL")
    .bind(job.tenant)
    .first<{ n: number }>();
  await env.DB.prepare(
    "INSERT INTO job_digests (tenant, entity, row_count, computed_at) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT (tenant, entity) DO UPDATE SET row_count = excluded.row_count, computed_at = excluded.computed_at",
  )
    .bind(job.tenant, "device", counted?.n ?? 0, new Date().toISOString())
    .run();
};

jobRunners["permission.digest"] = async (env, _payload, job) => {
  // The tenant comes off the QUEUED ROW, which the trigger stamped from the tenant
  // of the row that was written — never from the payload, which nothing verifies.
  const counted = await env.DB.prepare("SELECT COUNT(*) AS n FROM permissions WHERE tenant = ? AND deleted_at IS NULL")
    .bind(job.tenant)
    .first<{ n: number }>();
  await env.DB.prepare(
    "INSERT INTO job_digests (tenant, entity, row_count, computed_at) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT (tenant, entity) DO UPDATE SET row_count = excluded.row_count, computed_at = excluded.computed_at",
  )
    .bind(job.tenant, "permission", counted?.n ?? 0, new Date().toISOString())
    .run();
};

jobRunners["audit_log.digest"] = async (env, _payload, job) => {
  // The tenant comes off the QUEUED ROW, which the trigger stamped from the tenant
  // of the row that was written — never from the payload, which nothing verifies.
  const counted = await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE tenant = ? AND deleted_at IS NULL")
    .bind(job.tenant)
    .first<{ n: number }>();
  await env.DB.prepare(
    "INSERT INTO job_digests (tenant, entity, row_count, computed_at) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT (tenant, entity) DO UPDATE SET row_count = excluded.row_count, computed_at = excluded.computed_at",
  )
    .bind(job.tenant, "audit_log", counted?.n ?? 0, new Date().toISOString())
    .run();
};

jobRunners["region.digest"] = async (env, _payload, job) => {
  // The tenant comes off the QUEUED ROW, which the trigger stamped from the tenant
  // of the row that was written — never from the payload, which nothing verifies.
  const counted = await env.DB.prepare("SELECT COUNT(*) AS n FROM regions WHERE tenant = ? AND deleted_at IS NULL")
    .bind(job.tenant)
    .first<{ n: number }>();
  await env.DB.prepare(
    "INSERT INTO job_digests (tenant, entity, row_count, computed_at) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT (tenant, entity) DO UPDATE SET row_count = excluded.row_count, computed_at = excluded.computed_at",
  )
    .bind(job.tenant, "region", counted?.n ?? 0, new Date().toISOString())
    .run();
};

jobRunners["maintenance_schedule.digest"] = async (env, _payload, job) => {
  // The tenant comes off the QUEUED ROW, which the trigger stamped from the tenant
  // of the row that was written — never from the payload, which nothing verifies.
  const counted = await env.DB.prepare("SELECT COUNT(*) AS n FROM maintenance_schedules WHERE tenant = ? AND deleted_at IS NULL")
    .bind(job.tenant)
    .first<{ n: number }>();
  await env.DB.prepare(
    "INSERT INTO job_digests (tenant, entity, row_count, computed_at) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT (tenant, entity) DO UPDATE SET row_count = excluded.row_count, computed_at = excluded.computed_at",
  )
    .bind(job.tenant, "maintenance_schedule", counted?.n ?? 0, new Date().toISOString())
    .run();
};

jobRunners["photo_blob.digest"] = async (env, _payload, job) => {
  // The tenant comes off the QUEUED ROW, which the trigger stamped from the tenant
  // of the row that was written — never from the payload, which nothing verifies.
  const counted = await env.DB.prepare("SELECT COUNT(*) AS n FROM photo_blobs WHERE tenant = ? AND deleted_at IS NULL")
    .bind(job.tenant)
    .first<{ n: number }>();
  await env.DB.prepare(
    "INSERT INTO job_digests (tenant, entity, row_count, computed_at) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT (tenant, entity) DO UPDATE SET row_count = excluded.row_count, computed_at = excluded.computed_at",
  )
    .bind(job.tenant, "photo_blob", counted?.n ?? 0, new Date().toISOString())
    .run();
};

jobRunners["sync_session.digest"] = async (env, _payload, job) => {
  // The tenant comes off the QUEUED ROW, which the trigger stamped from the tenant
  // of the row that was written — never from the payload, which nothing verifies.
  const counted = await env.DB.prepare("SELECT COUNT(*) AS n FROM sync_sessions WHERE tenant = ? AND deleted_at IS NULL")
    .bind(job.tenant)
    .first<{ n: number }>();
  await env.DB.prepare(
    "INSERT INTO job_digests (tenant, entity, row_count, computed_at) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT (tenant, entity) DO UPDATE SET row_count = excluded.row_count, computed_at = excluded.computed_at",
  )
    .bind(job.tenant, "sync_session", counted?.n ?? 0, new Date().toISOString())
    .run();
};

/** What the queue PRODUCED: one row per entity, for this workspace only. */
interface JobDigestRow {
  entity: string;
  row_count: number;
  computed_at: string;
}

/** GET /api/jobs[?status=dead][?view=digest] — one workspace's queue.
 *
 * Admin-only (ADMIN_ROLES — the app's OWN top role, not a hardcoded "owner"):
 * this is every job's error text, which a lesser role has no business
 * enumerating (401 with no session at all, 403 for the wrong role). The
 * tenant filter comes from the verified SESSION, never from a query/body field,
 * so one workspace can never page through another's queue.
 *
 * ?cursor=<id of the last row you got> walks the next 200 (see CURSOR). The body
 * stays a BARE ARRAY — the next cursor is the last row's id, so paging costs the
 * caller no envelope and every existing consumer keeps working. */
export const jobsList: Handler<JobsListRow[] | JobDigestRow[] | { error: string }> = async (req, env) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  const forbidden = requireRole(user, ADMIN_ROLES);
  if (forbidden) return forbidden;
  const url = new URL(req.url);
  if (url.searchParams.get("view") === "digest") {
    const { results } = await env.DB.prepare(
      "SELECT entity, row_count, computed_at FROM job_digests WHERE tenant = ? ORDER BY entity",
    )
      .bind(user.tenant)
      .all<JobDigestRow>();
    return json(results);
  }
  const status = url.searchParams.get("status");
  if (status !== null && !STATUSES.includes(status as JobStatus)) return json({ error: "unknown status" }, 400);
  const cursor = url.searchParams.get("cursor");
  if (cursor !== null && !/^[0-9]+$/.test(cursor)) return json({ error: "bad cursor" }, 400);
  let sql = "SELECT " + COLUMNS + " FROM jobs WHERE tenant = ?";
  const binds: string[] = [user.tenant];
  if (status !== null) {
    sql += " AND status = ?";
    binds.push(status);
  }
  if (cursor !== null) {
    sql += CURSOR;
    binds.push(cursor, user.tenant);
  }
  const { results } = await env.DB.prepare(sql + ORDER)
    .bind(...binds)
    .all<JobsListRow>();
  return json(results);
};

/** POST /api/jobs/:id/cancel — stop a job that has not finished.
 *
 * A stuck job an operator can only WATCH is the defect this closes. There is no
 * 'cancelled' status on purpose: status is a CHECK constraint on a table that
 * already shipped (migrations/0004_jobs.sql), so a cancel lands in the SAME
 * dead-letter a spent job does, with the reason in last_error — never retried,
 * never deleted, still visible. Same admin tier as the read that reveals the job.
 * The tenant in the WHERE comes from the session: another workspace's job id is
 * indistinguishable from one that does not exist (404), and a job that already
 * finished is a 404 too — this only acts on work that is still live.
 * The drain's own writes are conditional on status = 'running', so a job
 * cancelled mid-flight cannot be written back to 'done' by the attempt in
 * progress; that attempt is not interrupted, it is just no longer authoritative. */
export const jobCancel: Handler<{ ok: boolean } | { error: string }> = async (req, env, params) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  const forbidden = requireRole(user, ADMIN_ROLES);
  if (forbidden) return forbidden;
  const res = await env.DB.prepare(
    "UPDATE jobs SET status = 'dead', last_error = 'cancelled by operator', updated_at = ? " +
      "WHERE id = ? AND tenant = ? AND status IN ('pending', 'running')",
  )
    .bind(new Date().toISOString(), params.id, user.tenant)
    .run();
  if (!res.meta.changes) return json({ error: "not found" }, 404);
  await audit(env, user, "cancel", "jobs", Number(params.id));
  return json({ ok: true });
};

/** POST /api/jobs/:id/requeue — put a dead job back in the queue.
 *
 * The other half of the same problem: the dead-letter is where jobs go when the
 * outage that killed them is over, and until now nothing could bring one back.
 * attempts resets to 0 so the retry ladder starts fresh, run_at is now so the
 * next cron tick claims it, and last_error is cleared because the row is no
 * longer a failure. 'dead' only — requeueing a pending/running job would double
 * -run it, and requeueing a done one would re-run work that succeeded (404). */
export const jobRequeue: Handler<{ ok: boolean } | { error: string }> = async (req, env, params) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  const forbidden = requireRole(user, ADMIN_ROLES);
  if (forbidden) return forbidden;
  const now = new Date().toISOString();
  const res = await env.DB.prepare(
    "UPDATE jobs SET status = 'pending', attempts = 0, last_error = NULL, run_at = ?, updated_at = ? " +
      "WHERE id = ? AND tenant = ? AND status = 'dead'",
  )
    .bind(now, now, params.id, user.tenant)
    .run();
  if (!res.meta.changes) return json({ error: "not found" }, 404);
  await audit(env, user, "requeue", "jobs", Number(params.id));
  return json({ ok: true });
};
