// GENERATED from the manifest. Do not edit.
import { expect, test } from "bun:test";
import { makeEnv, request, signUp } from "./harness";
import type { Reading } from "../src/types";

test("reading: anonymous callers are refused", async () => {
  const env = makeEnv();
  const anon = await request(env, "GET", "/api/readings");
  expect(anon.status).toBe(401);
});

test("reading: one workspace never sees another's rows", async () => {
  const env = makeEnv();
  const a = await signUp(env, "a@test.local");
  const b = await signUp(env, "b@test.local");
  const made = await request(env, "POST", "/api/readings", { photo: "sample", latitude: 1.5, longitude: 1.5, numeric_value: 1.5, timestamp: "2026-01-15", encrypted_blob: "sample", sync_status: "pending", sync_attempts: 1, dedupe_id: "sample", site_id: 1, device_id: 1, equipment_id: 1, calibration_id: 1 }, a);
  expect(made.status).toBe(200);
  const mine = await request(env, "GET", "/api/readings", undefined, a);
  expect(((await mine.json()) as Reading[]).length).toBe(1);
  const theirs = await request(env, "GET", "/api/readings", undefined, b);
  expect(((await theirs.json()) as Reading[]).length).toBe(0);
});

test("reading: empty, create, then list reflects it", async () => {
  const env = makeEnv();
  const cookie = await signUp(env);
  const req = (method: string, path: string, body?: unknown) => request(env, method, path, body, cookie);
  const empty = await req("GET", "/api/readings");
  expect(empty.status).toBe(200);
  expect((await empty.json()) as Reading[]).toEqual([]);

  const res = await req("POST", "/api/readings", { photo: "sample", latitude: 1.5, longitude: 1.5, numeric_value: 1.5, timestamp: "2026-01-15", encrypted_blob: "sample", sync_status: "pending", sync_attempts: 1, dedupe_id: "sample", site_id: 1, device_id: 1, equipment_id: 1, calibration_id: 1 });
  expect(res.status).toBe(200);
  const created = (await res.json()) as Reading;
  expect(created.photo).toBe("sample");

  const list = await req("GET", "/api/readings");
  expect(((await list.json()) as Reading[]).length).toBe(1);

  const missing = await req("POST", "/api/readings", { latitude: 1.5, longitude: 1.5, numeric_value: 1.5, timestamp: "2026-01-15", encrypted_blob: "sample", sync_status: "pending", sync_attempts: 1, dedupe_id: "sample", site_id: 1, device_id: 1, equipment_id: 1, calibration_id: 1 });
  expect(missing.status).toBe(400);

  const badEnum = await req("POST", "/api/readings", { ...{ photo: "sample", latitude: 1.5, longitude: 1.5, numeric_value: 1.5, timestamp: "2026-01-15", encrypted_blob: "sample", sync_status: "pending", sync_attempts: 1, dedupe_id: "sample", site_id: 1, device_id: 1, equipment_id: 1, calibration_id: 1 }, sync_status: "__not_a_state__" });
  expect(badEnum.status).toBe(400);

  const patched = await req("PATCH", `/api/readings/${created.id}`, { photo: "patched" });
  expect(patched.status).toBe(200);
  const after = (await patched.json()) as Reading;
  expect(after.photo).toBe("patched");
  expect(after.latitude).toBe(1.5);

  const idem1 = await req("POST", "/api/readings?idempotency_key=retry-1", { photo: "sample", latitude: 1.5, longitude: 1.5, numeric_value: 1.5, timestamp: "2026-01-15", encrypted_blob: "sample", sync_status: "pending", sync_attempts: 1, dedupe_id: "sample", site_id: 1, device_id: 1, equipment_id: 1, calibration_id: 1 });
  const idem2 = await req("POST", "/api/readings?idempotency_key=retry-1", { photo: "sample", latitude: 1.5, longitude: 1.5, numeric_value: 1.5, timestamp: "2026-01-15", encrypted_blob: "sample", sync_status: "pending", sync_attempts: 1, dedupe_id: "sample", site_id: 1, device_id: 1, equipment_id: 1, calibration_id: 1 });
  expect(idem2.status).toBe(200);
  expect(((await idem2.json()) as Reading).id).toBe(((await idem1.json()) as Reading).id);

  const bulk = await req("POST", "/api/readings/bulk", { rows: [{ photo: "sample", latitude: 1.5, longitude: 1.5, numeric_value: 1.5, timestamp: "2026-01-15", encrypted_blob: "sample", sync_status: "pending", sync_attempts: 1, dedupe_id: "sample", site_id: 1, device_id: 1, equipment_id: 1, calibration_id: 1 }, { photo: "sample", latitude: 1.5, longitude: 1.5, numeric_value: 1.5, timestamp: "2026-01-15", encrypted_blob: "sample", sync_status: "pending", sync_attempts: 1, dedupe_id: "sample", site_id: 1, device_id: 1, equipment_id: 1, calibration_id: 1 }] });
  expect(bulk.status).toBe(200);
  expect(((await bulk.json()) as { created: number }).created).toBe(2);
  const bulkBad = await req("POST", "/api/readings/bulk", { rows: [{ latitude: 1.5, longitude: 1.5, numeric_value: 1.5, timestamp: "2026-01-15", encrypted_blob: "sample", sync_status: "pending", sync_attempts: 1, dedupe_id: "sample", site_id: 1, device_id: 1, equipment_id: 1, calibration_id: 1 }] });
  expect(bulkBad.status).toBe(400);

  const stats = await req("GET", "/api/readings/stats");
  expect(stats.status).toBe(200);
  const buckets = (await stats.json()) as { key: unknown; count: number }[];
  expect(buckets.reduce((n, b) => n + b.count, 0)).toBe(4);
  const badBy = await req("GET", "/api/readings/stats?by=__nope__");
  expect(badBy.status).toBe(400);

  const stale = await req("PATCH", `/api/readings/${created.id}?if_match=9999`, { photo: "sample" });
  expect(stale.status).toBe(409);
  const fresh = await req("GET", `/api/readings/${created.id}`);
  const version = Number((fresh.headers.get("etag") ?? "").replace(/[^0-9]/g, ""));
  expect(version).toBeGreaterThan(0);
  const won = await req("PATCH", `/api/readings/${created.id}?if_match=${version}`, { photo: "sample" });
  expect(won.status).toBe(200);

  const del = await req("DELETE", `/api/readings/${created.id}`);
  expect(del.status).toBe(200);
  const delMissing = await req("DELETE", `/api/readings/${created.id}`);
  expect(delMissing.status).toBe(404);
});
