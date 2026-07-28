// GENERATED from the manifest. Do not edit.
import { expect, test } from "bun:test";
import { makeEnv, request, signUp } from "./harness";
import type { Anomaly } from "../src/types";

test("anomaly: anonymous callers are refused", async () => {
  const env = makeEnv();
  const anon = await request(env, "GET", "/api/anomalys");
  expect(anon.status).toBe(401);
});

test("anomaly: one workspace never sees another's rows", async () => {
  const env = makeEnv();
  const a = await signUp(env, "a@test.local");
  const b = await signUp(env, "b@test.local");
  const made = await request(env, "POST", "/api/anomalys", { reading_id: 1, grid_cell_id: 1, cell_mean: 1.5, cell_stddev: 1.5, z_score: 1.5, detected_at: "2026-01-15", resolved_at: "2026-01-15", resolution_notes: "sample", status: "open", assigned_to: 1, severity: "low", follow_up_required: 1 }, a);
  expect(made.status).toBe(200);
  const mine = await request(env, "GET", "/api/anomalys", undefined, a);
  expect(((await mine.json()) as Anomaly[]).length).toBe(1);
  const theirs = await request(env, "GET", "/api/anomalys", undefined, b);
  expect(((await theirs.json()) as Anomaly[]).length).toBe(0);
});

test("anomaly: empty, create, then list reflects it", async () => {
  const env = makeEnv();
  const cookie = await signUp(env);
  const req = (method: string, path: string, body?: unknown) => request(env, method, path, body, cookie);
  const empty = await req("GET", "/api/anomalys");
  expect(empty.status).toBe(200);
  expect((await empty.json()) as Anomaly[]).toEqual([]);

  const res = await req("POST", "/api/anomalys", { reading_id: 1, grid_cell_id: 1, cell_mean: 1.5, cell_stddev: 1.5, z_score: 1.5, detected_at: "2026-01-15", resolved_at: "2026-01-15", resolution_notes: "sample", status: "open", assigned_to: 1, severity: "low", follow_up_required: 1 });
  expect(res.status).toBe(200);
  const created = (await res.json()) as Anomaly;
  expect(created.resolution_notes).toBe("sample");

  const list = await req("GET", "/api/anomalys");
  expect(((await list.json()) as Anomaly[]).length).toBe(1);

  const missing = await req("POST", "/api/anomalys", { grid_cell_id: 1, cell_mean: 1.5, cell_stddev: 1.5, z_score: 1.5, detected_at: "2026-01-15", resolved_at: "2026-01-15", resolution_notes: "sample", status: "open", assigned_to: 1, severity: "low", follow_up_required: 1 });
  expect(missing.status).toBe(400);

  const badEnum = await req("POST", "/api/anomalys", { ...{ reading_id: 1, grid_cell_id: 1, cell_mean: 1.5, cell_stddev: 1.5, z_score: 1.5, detected_at: "2026-01-15", resolved_at: "2026-01-15", resolution_notes: "sample", status: "open", assigned_to: 1, severity: "low", follow_up_required: 1 }, status: "__not_a_state__" });
  expect(badEnum.status).toBe(400);

  const patched = await req("PATCH", `/api/anomalys/${created.id}`, { resolution_notes: "patched" });
  expect(patched.status).toBe(200);
  const after = (await patched.json()) as Anomaly;
  expect(after.resolution_notes).toBe("patched");
  expect(after.reading_id).toBe(1);

  const wfOk = await req("PATCH", `/api/anomalys/${created.id}`, { status: "investigating" });
  expect(wfOk.status).toBe(200);
  expect(((await wfOk.json()) as Anomaly).status).toBe("investigating");

  const idem1 = await req("POST", "/api/anomalys?idempotency_key=retry-1", { reading_id: 1, grid_cell_id: 1, cell_mean: 1.5, cell_stddev: 1.5, z_score: 1.5, detected_at: "2026-01-15", resolved_at: "2026-01-15", resolution_notes: "sample", status: "open", assigned_to: 1, severity: "low", follow_up_required: 1 });
  const idem2 = await req("POST", "/api/anomalys?idempotency_key=retry-1", { reading_id: 1, grid_cell_id: 1, cell_mean: 1.5, cell_stddev: 1.5, z_score: 1.5, detected_at: "2026-01-15", resolved_at: "2026-01-15", resolution_notes: "sample", status: "open", assigned_to: 1, severity: "low", follow_up_required: 1 });
  expect(idem2.status).toBe(200);
  expect(((await idem2.json()) as Anomaly).id).toBe(((await idem1.json()) as Anomaly).id);

  const bulk = await req("POST", "/api/anomalys/bulk", { rows: [{ reading_id: 1, grid_cell_id: 1, cell_mean: 1.5, cell_stddev: 1.5, z_score: 1.5, detected_at: "2026-01-15", resolved_at: "2026-01-15", resolution_notes: "sample", status: "open", assigned_to: 1, severity: "low", follow_up_required: 1 }, { reading_id: 1, grid_cell_id: 1, cell_mean: 1.5, cell_stddev: 1.5, z_score: 1.5, detected_at: "2026-01-15", resolved_at: "2026-01-15", resolution_notes: "sample", status: "open", assigned_to: 1, severity: "low", follow_up_required: 1 }] });
  expect(bulk.status).toBe(200);
  expect(((await bulk.json()) as { created: number }).created).toBe(2);
  const bulkBad = await req("POST", "/api/anomalys/bulk", { rows: [{ grid_cell_id: 1, cell_mean: 1.5, cell_stddev: 1.5, z_score: 1.5, detected_at: "2026-01-15", resolved_at: "2026-01-15", resolution_notes: "sample", status: "open", assigned_to: 1, severity: "low", follow_up_required: 1 }] });
  expect(bulkBad.status).toBe(400);

  const stats = await req("GET", "/api/anomalys/stats");
  expect(stats.status).toBe(200);
  const buckets = (await stats.json()) as { key: unknown; count: number }[];
  expect(buckets.reduce((n, b) => n + b.count, 0)).toBe(4);
  const badBy = await req("GET", "/api/anomalys/stats?by=__nope__");
  expect(badBy.status).toBe(400);

  const stale = await req("PATCH", `/api/anomalys/${created.id}?if_match=9999`, { reading_id: 1 });
  expect(stale.status).toBe(409);
  const fresh = await req("GET", `/api/anomalys/${created.id}`);
  const version = Number((fresh.headers.get("etag") ?? "").replace(/[^0-9]/g, ""));
  expect(version).toBeGreaterThan(0);
  const won = await req("PATCH", `/api/anomalys/${created.id}?if_match=${version}`, { reading_id: 1 });
  expect(won.status).toBe(200);

  const del = await req("DELETE", `/api/anomalys/${created.id}`);
  expect(del.status).toBe(200);
  const delMissing = await req("DELETE", `/api/anomalys/${created.id}`);
  expect(delMissing.status).toBe(404);
});
