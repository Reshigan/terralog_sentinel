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
  const made = await request(env, "POST", "/api/readings", { capture_timestamp: "2026-01-15", latitude: 1.5, longitude: 1.5, numeric_value: 1.5, photo_blob_id: "sample", encrypted_blob: "sample", sync_status: "pending", sync_attempts: 1, device_fingerprint: "sample", dedupe_id: "sample", erasure_policy_id: 1, reading_type_id: 1, site_id: 1, technician_id: 1, weather_conditions: "sample", equipment_used: "sample", notes: "sample" }, a);
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

  const res = await req("POST", "/api/readings", { capture_timestamp: "2026-01-15", latitude: 1.5, longitude: 1.5, numeric_value: 1.5, photo_blob_id: "sample", encrypted_blob: "sample", sync_status: "pending", sync_attempts: 1, device_fingerprint: "sample", dedupe_id: "sample", erasure_policy_id: 1, reading_type_id: 1, site_id: 1, technician_id: 1, weather_conditions: "sample", equipment_used: "sample", notes: "sample" });
  expect(res.status).toBe(200);
  const created = (await res.json()) as Reading;
  expect(created.photo_blob_id).toBe("sample");

  const list = await req("GET", "/api/readings");
  expect(((await list.json()) as Reading[]).length).toBe(1);

  const missing = await req("POST", "/api/readings", { latitude: 1.5, longitude: 1.5, numeric_value: 1.5, photo_blob_id: "sample", encrypted_blob: "sample", sync_status: "pending", sync_attempts: 1, device_fingerprint: "sample", dedupe_id: "sample", erasure_policy_id: 1, reading_type_id: 1, site_id: 1, technician_id: 1, weather_conditions: "sample", equipment_used: "sample", notes: "sample" });
  expect(missing.status).toBe(400);

  const badEnum = await req("POST", "/api/readings", { ...{ capture_timestamp: "2026-01-15", latitude: 1.5, longitude: 1.5, numeric_value: 1.5, photo_blob_id: "sample", encrypted_blob: "sample", sync_status: "pending", sync_attempts: 1, device_fingerprint: "sample", dedupe_id: "sample", erasure_policy_id: 1, reading_type_id: 1, site_id: 1, technician_id: 1, weather_conditions: "sample", equipment_used: "sample", notes: "sample" }, sync_status: "__not_a_state__" });
  expect(badEnum.status).toBe(400);

  const patched = await req("PATCH", `/api/readings/${created.id}`, { photo_blob_id: "patched" });
  expect(patched.status).toBe(200);
  const after = (await patched.json()) as Reading;
  expect(after.photo_blob_id).toBe("patched");
  expect(after.capture_timestamp).toBe("2026-01-15");

  const wfBad = await req("PATCH", `/api/readings/${created.id}`, { sync_status: "erased" });
  expect(wfBad.status).toBe(409);

  const wfOk = await req("PATCH", `/api/readings/${created.id}`, { sync_status: "synced" });
  expect(wfOk.status).toBe(200);
  expect(((await wfOk.json()) as Reading).sync_status).toBe("synced");

  const idem1 = await req("POST", "/api/readings?idempotency_key=retry-1", { capture_timestamp: "2026-01-15", latitude: 1.5, longitude: 1.5, numeric_value: 1.5, photo_blob_id: "sample", encrypted_blob: "sample", sync_status: "pending", sync_attempts: 1, device_fingerprint: "sample", dedupe_id: "sample", erasure_policy_id: 1, reading_type_id: 1, site_id: 1, technician_id: 1, weather_conditions: "sample", equipment_used: "sample", notes: "sample" });
  const idem2 = await req("POST", "/api/readings?idempotency_key=retry-1", { capture_timestamp: "2026-01-15", latitude: 1.5, longitude: 1.5, numeric_value: 1.5, photo_blob_id: "sample", encrypted_blob: "sample", sync_status: "pending", sync_attempts: 1, device_fingerprint: "sample", dedupe_id: "sample", erasure_policy_id: 1, reading_type_id: 1, site_id: 1, technician_id: 1, weather_conditions: "sample", equipment_used: "sample", notes: "sample" });
  expect(idem2.status).toBe(200);
  expect(((await idem2.json()) as Reading).id).toBe(((await idem1.json()) as Reading).id);

  const bulk = await req("POST", "/api/readings/bulk", { rows: [{ capture_timestamp: "2026-01-15", latitude: 1.5, longitude: 1.5, numeric_value: 1.5, photo_blob_id: "sample", encrypted_blob: "sample", sync_status: "pending", sync_attempts: 1, device_fingerprint: "sample", dedupe_id: "sample", erasure_policy_id: 1, reading_type_id: 1, site_id: 1, technician_id: 1, weather_conditions: "sample", equipment_used: "sample", notes: "sample" }, { capture_timestamp: "2026-01-15", latitude: 1.5, longitude: 1.5, numeric_value: 1.5, photo_blob_id: "sample", encrypted_blob: "sample", sync_status: "pending", sync_attempts: 1, device_fingerprint: "sample", dedupe_id: "sample", erasure_policy_id: 1, reading_type_id: 1, site_id: 1, technician_id: 1, weather_conditions: "sample", equipment_used: "sample", notes: "sample" }] });
  expect(bulk.status).toBe(200);
  expect(((await bulk.json()) as { created: number }).created).toBe(2);
  const bulkBad = await req("POST", "/api/readings/bulk", { rows: [{ latitude: 1.5, longitude: 1.5, numeric_value: 1.5, photo_blob_id: "sample", encrypted_blob: "sample", sync_status: "pending", sync_attempts: 1, device_fingerprint: "sample", dedupe_id: "sample", erasure_policy_id: 1, reading_type_id: 1, site_id: 1, technician_id: 1, weather_conditions: "sample", equipment_used: "sample", notes: "sample" }] });
  expect(bulkBad.status).toBe(400);

  const stats = await req("GET", "/api/readings/stats");
  expect(stats.status).toBe(200);
  const buckets = (await stats.json()) as { key: unknown; count: number }[];
  expect(buckets.reduce((n, b) => n + b.count, 0)).toBe(4);
  const badBy = await req("GET", "/api/readings/stats?by=__nope__");
  expect(badBy.status).toBe(400);

  const stale = await req("PATCH", `/api/readings/${created.id}?if_match=9999`, { latitude: 1.5 });
  expect(stale.status).toBe(409);
  const fresh = await req("GET", `/api/readings/${created.id}`);
  const version = Number((fresh.headers.get("etag") ?? "").replace(/[^0-9]/g, ""));
  expect(version).toBeGreaterThan(0);
  const won = await req("PATCH", `/api/readings/${created.id}?if_match=${version}`, { latitude: 1.5 });
  expect(won.status).toBe(200);

  const del = await req("DELETE", `/api/readings/${created.id}`);
  expect(del.status).toBe(200);
  const delMissing = await req("DELETE", `/api/readings/${created.id}`);
  expect(delMissing.status).toBe(404);
});
