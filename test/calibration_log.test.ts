// GENERATED from the manifest. Do not edit.
import { expect, test } from "bun:test";
import { makeEnv, request, signUp } from "./harness";
import type { Calibration_log } from "../src/types";

test("calibration_log: anonymous callers are refused", async () => {
  const env = makeEnv();
  const anon = await request(env, "GET", "/api/calibration_logs");
  expect(anon.status).toBe(401);
});

test("calibration_log: one workspace never sees another's rows", async () => {
  const env = makeEnv();
  const a = await signUp(env, "a@test.local");
  const b = await signUp(env, "b@test.local");
  const made = await request(env, "POST", "/api/calibration_logs", { equipment_id: 1, calibrated_at: "2026-01-15", calibrated_by: "sample", next_calibration: "2026-01-15", notes: "sample", status: "passed", reading_id: 1 }, a);
  expect(made.status).toBe(200);
  const mine = await request(env, "GET", "/api/calibration_logs", undefined, a);
  expect(((await mine.json()) as Calibration_log[]).length).toBe(1);
  const theirs = await request(env, "GET", "/api/calibration_logs", undefined, b);
  expect(((await theirs.json()) as Calibration_log[]).length).toBe(0);
});

test("calibration_log: empty, create, then list reflects it", async () => {
  const env = makeEnv();
  const cookie = await signUp(env);
  const req = (method: string, path: string, body?: unknown) => request(env, method, path, body, cookie);
  const empty = await req("GET", "/api/calibration_logs");
  expect(empty.status).toBe(200);
  expect((await empty.json()) as Calibration_log[]).toEqual([]);

  const res = await req("POST", "/api/calibration_logs", { equipment_id: 1, calibrated_at: "2026-01-15", calibrated_by: "sample", next_calibration: "2026-01-15", notes: "sample", status: "passed", reading_id: 1 });
  expect(res.status).toBe(200);
  const created = (await res.json()) as Calibration_log;
  expect(created.calibrated_by).toBe("sample");

  const list = await req("GET", "/api/calibration_logs");
  expect(((await list.json()) as Calibration_log[]).length).toBe(1);

  const missing = await req("POST", "/api/calibration_logs", { calibrated_at: "2026-01-15", calibrated_by: "sample", next_calibration: "2026-01-15", notes: "sample", status: "passed", reading_id: 1 });
  expect(missing.status).toBe(400);

  const badEnum = await req("POST", "/api/calibration_logs", { ...{ equipment_id: 1, calibrated_at: "2026-01-15", calibrated_by: "sample", next_calibration: "2026-01-15", notes: "sample", status: "passed", reading_id: 1 }, status: "__not_a_state__" });
  expect(badEnum.status).toBe(400);

  const patched = await req("PATCH", `/api/calibration_logs/${created.id}`, { calibrated_by: "patched" });
  expect(patched.status).toBe(200);
  const after = (await patched.json()) as Calibration_log;
  expect(after.calibrated_by).toBe("patched");
  expect(after.equipment_id).toBe(1);

  const wfBad = await req("PATCH", `/api/calibration_logs/${created.id}`, { status: "failed" });
  expect(wfBad.status).toBe(409);

  const idem1 = await req("POST", "/api/calibration_logs?idempotency_key=retry-1", { equipment_id: 1, calibrated_at: "2026-01-15", calibrated_by: "sample", next_calibration: "2026-01-15", notes: "sample", status: "passed", reading_id: 1 });
  const idem2 = await req("POST", "/api/calibration_logs?idempotency_key=retry-1", { equipment_id: 1, calibrated_at: "2026-01-15", calibrated_by: "sample", next_calibration: "2026-01-15", notes: "sample", status: "passed", reading_id: 1 });
  expect(idem2.status).toBe(200);
  expect(((await idem2.json()) as Calibration_log).id).toBe(((await idem1.json()) as Calibration_log).id);

  const bulk = await req("POST", "/api/calibration_logs/bulk", { rows: [{ equipment_id: 1, calibrated_at: "2026-01-15", calibrated_by: "sample", next_calibration: "2026-01-15", notes: "sample", status: "passed", reading_id: 1 }, { equipment_id: 1, calibrated_at: "2026-01-15", calibrated_by: "sample", next_calibration: "2026-01-15", notes: "sample", status: "passed", reading_id: 1 }] });
  expect(bulk.status).toBe(200);
  expect(((await bulk.json()) as { created: number }).created).toBe(2);
  const bulkBad = await req("POST", "/api/calibration_logs/bulk", { rows: [{ calibrated_at: "2026-01-15", calibrated_by: "sample", next_calibration: "2026-01-15", notes: "sample", status: "passed", reading_id: 1 }] });
  expect(bulkBad.status).toBe(400);

  const stats = await req("GET", "/api/calibration_logs/stats");
  expect(stats.status).toBe(200);
  const buckets = (await stats.json()) as { key: unknown; count: number }[];
  expect(buckets.reduce((n, b) => n + b.count, 0)).toBe(4);
  const badBy = await req("GET", "/api/calibration_logs/stats?by=__nope__");
  expect(badBy.status).toBe(400);

  const stale = await req("PATCH", `/api/calibration_logs/${created.id}?if_match=9999`, { equipment_id: 1 });
  expect(stale.status).toBe(409);
  const fresh = await req("GET", `/api/calibration_logs/${created.id}`);
  const version = Number((fresh.headers.get("etag") ?? "").replace(/[^0-9]/g, ""));
  expect(version).toBeGreaterThan(0);
  const won = await req("PATCH", `/api/calibration_logs/${created.id}?if_match=${version}`, { equipment_id: 1 });
  expect(won.status).toBe(200);
});
