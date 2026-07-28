// FROZEN — Sentinel golden template. Durable background jobs: a Cron Trigger
// drains the D1 `jobs` table (migrations/0004_jobs.sql). Deliberately not
// Cloudflare Queues — a queue needs `wrangler queues create` and a paid plan
// before the app can deploy at all, and this is the same durable-queue pattern.
import type { Env } from "./http";

export type JobStatus = "pending" | "running" | "done" | "dead";

export interface JobRow {
  id: number;
  tenant: string;
  kind: string;
  payload: string;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  run_at: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

/** What one KIND of job does. Throw to fail the attempt: the drain records the
 * message, backs off, and retries until max_attempts, then dead-letters the row.
 * A runner MUST be idempotent — delivery is at-least-once (see the reclaim step). */
export type JobRunner = (env: Env, payload: unknown, job: JobRow) => Promise<void>;

/** kind -> runner. A handler module registers its kinds at import time:
 *   jobRunners["invoice.email"] = async (env, payload) => { ... };
 * An unregistered kind fails like any other error and ends in the dead-letter, so
 * a typo'd kind is visible to an operator instead of silently vanishing. */
export const jobRunners: Record<string, JobRunner> = {};

/** Per-tick ceiling. A Worker invocation has a wall-clock and CPU budget, so a
 * 50k-row backlog must drain across many ticks instead of killing one. */
const BATCH = 25;
/** Exponential backoff: attempt 1 waits 10s, then 20s, 40s… capped at an hour. */
const BACKOFF_MS = 10_000;
const BACKOFF_MAX_MS = 60 * 60 * 1000;
/** A job claimed but never finished (isolate evicted mid-run) is reclaimed after
 * this. Its attempt was already burned at claim time, so a job that kills the
 * isolate every time still walks to the dead-letter instead of retrying forever. */
const STALE_MS = 5 * 60 * 1000;
/** last_error is a log line, not a payload dump. */
const ERROR_MAX = 1000;
/** Finished rows are evidence for a week, then they are just table growth. */
const DONE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/** Parse a queued payload without trusting it. A row can be written by a SQL
 * trigger, a migration or a hand-typed `wrangler d1 execute` — anything that is
 * not JSON is a permanent defect in the ROW, not a transient failure, so the
 * drain must be able to tell the two apart. */
function parsePayload(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

/** Queue durable work. The tenant comes from the caller's VERIFIED session (the
 * same rule as every other write in a generated app), never from a request field. */
export async function enqueue(env: Env, tenant: string, kind: string, payload: unknown): Promise<number> {
  const now = iso(Date.now());
  const res = await env.DB.prepare(
    "INSERT INTO jobs (tenant, kind, payload, status, attempts, max_attempts, run_at, created_at, updated_at) " +
      "VALUES (?, ?, ?, 'pending', 0, 5, ?, ?, ?)",
  )
    .bind(tenant, kind, JSON.stringify(payload ?? null), now, now, now)
    .run();
  return res.meta.last_row_id;
}

export interface DrainResult {
  claimed: number;
  done: number;
  failed: number;
  dead: number;
}

/** One cron tick: reclaim what died mid-run, then claim and run a bounded batch
 * of due work. Called by scheduled() in src/index.ts — never from a request. */
export async function drainJobs(env: Env): Promise<DrainResult> {
  const started = Date.now();
  const out: DrainResult = { claimed: 0, done: 0, failed: 0, dead: 0 };

  // (1) Jobs stranded in 'running' by an evicted isolate go back in the queue —
  // or straight to the dead-letter if their attempts are already spent. Without
  // this a single eviction loses the job forever, which is the whole point of
  // having a table instead of waitUntil().
  await env.DB.prepare(
    "UPDATE jobs SET status = CASE WHEN attempts >= max_attempts THEN 'dead' ELSE 'pending' END, " +
      "last_error = COALESCE(last_error, 'abandoned mid-run - reclaimed'), updated_at = ? " +
      "WHERE status = 'running' AND updated_at < ?",
  )
    .bind(iso(started), iso(started - STALE_MS))
    .run();

  // (2) Due pending work, oldest first, bounded by BATCH.
  const { results } = await env.DB.prepare(
    "SELECT id, tenant, kind, payload, status, attempts, max_attempts, run_at, last_error, created_at, updated_at " +
      "FROM jobs WHERE status = 'pending' AND run_at <= ? ORDER BY run_at, id LIMIT ?",
  )
    .bind(iso(started), BATCH)
    .all<JobRow>();

  for (const job of results) {
    // (3) FAIL CLOSED on a row the drain cannot even interpret: no tenant (it
    // could only run untenanted, i.e. across workspaces), no kind, or a payload
    // that is not JSON. None of that can heal on a retry, so the row is dead on
    // arrival — the tick never throws, and the rest of the batch still drains.
    const payload = parsePayload(job.payload);
    if (typeof job.tenant !== "string" || !job.tenant || typeof job.kind !== "string" || !job.kind || !payload.ok) {
      await env.DB.prepare(
        "UPDATE jobs SET status = 'dead', last_error = ?, updated_at = ? WHERE id = ? AND status = 'pending'",
      )
        .bind("malformed job row - not runnable", iso(Date.now()), job.id)
        .run();
      out.dead++;
      continue;
    }

    // (4) CLAIM: a conditional UPDATE plus the affected-row count, never a
    // read-then-write. Two overlapping cron invocations both SELECT this row;
    // only one of them gets changes === 1, and the loser skips it — so a job is
    // never run twice concurrently. The attempt is burned HERE, before the work,
    // so a job that crashes the isolate cannot retry for ever.
    const claim = await env.DB.prepare(
      "UPDATE jobs SET status = 'running', attempts = attempts + 1, updated_at = ? WHERE id = ? AND status = 'pending'",
    )
      .bind(iso(Date.now()), job.id)
      .run();
    if (!claim.meta.changes) continue;
    out.claimed++;
    const attempts = job.attempts + 1;
    try {
      const runner = jobRunners[job.kind];
      if (!runner) throw new Error("no runner registered for kind " + job.kind);
      await runner(env, payload.value, { ...job, attempts, status: "running" });
      // AND status = 'running': an operator who cancelled this job mid-flight
      // (POST /api/jobs/:id/cancel moved it to 'dead') must not have it written
      // back to 'done' — the claim is only valid while the row is still ours.
      await env.DB.prepare(
        "UPDATE jobs SET status = 'done', last_error = NULL, updated_at = ? WHERE id = ? AND status = 'running'",
      )
        .bind(iso(Date.now()), job.id)
        .run();
      out.done++;
    } catch (err) {
      // Caught INSIDE the loop: one poisoned job must never abort the drain for
      // the rest of the batch (and must never surface as a failed cron either).
      const dead = attempts >= job.max_attempts;
      const wait = Math.min(BACKOFF_MAX_MS, BACKOFF_MS * 2 ** (attempts - 1));
      const message = (err instanceof Error ? err.message : String(err)).slice(0, ERROR_MAX);
      await env.DB.prepare(
        "UPDATE jobs SET status = ?, last_error = ?, run_at = ?, updated_at = ? WHERE id = ? AND status = 'running'",
      )
        .bind(dead ? "dead" : "pending", message, iso(Date.now() + wait), iso(Date.now()), job.id)
        .run();
      if (dead) out.dead++;
      else out.failed++;
    }
  }

  // (5) Retention. 'dead' rows are kept for ever on purpose — a dead-letter an
  // operator never sees is a lost job.
  await env.DB.prepare("DELETE FROM jobs WHERE status = 'done' AND updated_at < ?")
    .bind(iso(started - DONE_RETENTION_MS))
    .run();
  return out;
}
