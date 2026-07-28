// GENERATED from the manifest. Do not edit.
import { expect, test } from "bun:test";
import { makeEnv, request, signUp } from "./harness";
import type { Device } from "../src/types";

test("device: anonymous callers are refused", async () => {
  const env = makeEnv();
  const anon = await request(env, "GET", "/api/devices");
  expect(anon.status).toBe(401);
});

test("device: one workspace never sees another's rows", async () => {
  const env = makeEnv();
  const a = await signUp(env, "a@test.local");
  const b = await signUp(env, "b@test.local");
  const made = await request(env, "POST", "/api/devices", { fingerprint: "sample", user_agent: "sample", screen_width: 1, screen_height: 1, hardware_concurrency: 1, last_seen: "2026-01-15", status: "active", technician_id: 1, os_version: "sample", battery_level: 1, storage_available_mb: 1 }, a);
  expect(made.status).toBe(200);
  const mine = await request(env, "GET", "/api/devices", undefined, a);
  expect(((await mine.json()) as Device[]).length).toBe(1);
  const theirs = await request(env, "GET", "/api/devices", undefined, b);
  expect(((await theirs.json()) as Device[]).length).toBe(0);
});

test("device: empty, create, then list reflects it", async () => {
  const env = makeEnv();
  const cookie = await signUp(env);
  const req = (method: string, path: string, body?: unknown) => request(env, method, path, body, cookie);
  const empty = await req("GET", "/api/devices");
  expect(empty.status).toBe(200);
  expect((await empty.json()) as Device[]).toEqual([]);

  const res = await req("POST", "/api/devices", { fingerprint: "sample", user_agent: "sample", screen_width: 1, screen_height: 1, hardware_concurrency: 1, last_seen: "2026-01-15", status: "active", technician_id: 1, os_version: "sample", battery_level: 1, storage_available_mb: 1 });
  expect(res.status).toBe(200);
  const created = (await res.json()) as Device;
  expect(created.fingerprint).toBe("sample");

  const list = await req("GET", "/api/devices");
  expect(((await list.json()) as Device[]).length).toBe(1);

  const missing = await req("POST", "/api/devices", { user_agent: "sample", screen_width: 1, screen_height: 1, hardware_concurrency: 1, last_seen: "2026-01-15", status: "active", technician_id: 1, os_version: "sample", battery_level: 1, storage_available_mb: 1 });
  expect(missing.status).toBe(400);

  const badEnum = await req("POST", "/api/devices", { ...{ fingerprint: "sample", user_agent: "sample", screen_width: 1, screen_height: 1, hardware_concurrency: 1, last_seen: "2026-01-15", status: "active", technician_id: 1, os_version: "sample", battery_level: 1, storage_available_mb: 1 }, status: "__not_a_state__" });
  expect(badEnum.status).toBe(400);

  const patched = await req("PATCH", `/api/devices/${created.id}`, { fingerprint: "patched" });
  expect(patched.status).toBe(200);
  const after = (await patched.json()) as Device;
  expect(after.fingerprint).toBe("patched");
  expect(after.user_agent).toBe("sample");

  const wfOk = await req("PATCH", `/api/devices/${created.id}`, { status: "inactive" });
  expect(wfOk.status).toBe(200);
  expect(((await wfOk.json()) as Device).status).toBe("inactive");

  const idem1 = await req("POST", "/api/devices?idempotency_key=retry-1", { fingerprint: "sample", user_agent: "sample", screen_width: 1, screen_height: 1, hardware_concurrency: 1, last_seen: "2026-01-15", status: "active", technician_id: 1, os_version: "sample", battery_level: 1, storage_available_mb: 1 });
  const idem2 = await req("POST", "/api/devices?idempotency_key=retry-1", { fingerprint: "sample", user_agent: "sample", screen_width: 1, screen_height: 1, hardware_concurrency: 1, last_seen: "2026-01-15", status: "active", technician_id: 1, os_version: "sample", battery_level: 1, storage_available_mb: 1 });
  expect(idem2.status).toBe(200);
  expect(((await idem2.json()) as Device).id).toBe(((await idem1.json()) as Device).id);

  const bulk = await req("POST", "/api/devices/bulk", { rows: [{ fingerprint: "sample", user_agent: "sample", screen_width: 1, screen_height: 1, hardware_concurrency: 1, last_seen: "2026-01-15", status: "active", technician_id: 1, os_version: "sample", battery_level: 1, storage_available_mb: 1 }, { fingerprint: "sample", user_agent: "sample", screen_width: 1, screen_height: 1, hardware_concurrency: 1, last_seen: "2026-01-15", status: "active", technician_id: 1, os_version: "sample", battery_level: 1, storage_available_mb: 1 }] });
  expect(bulk.status).toBe(200);
  expect(((await bulk.json()) as { created: number }).created).toBe(2);
  const bulkBad = await req("POST", "/api/devices/bulk", { rows: [{ user_agent: "sample", screen_width: 1, screen_height: 1, hardware_concurrency: 1, last_seen: "2026-01-15", status: "active", technician_id: 1, os_version: "sample", battery_level: 1, storage_available_mb: 1 }] });
  expect(bulkBad.status).toBe(400);

  const stats = await req("GET", "/api/devices/stats");
  expect(stats.status).toBe(200);
  const buckets = (await stats.json()) as { key: unknown; count: number }[];
  expect(buckets.reduce((n, b) => n + b.count, 0)).toBe(4);
  const badBy = await req("GET", "/api/devices/stats?by=__nope__");
  expect(badBy.status).toBe(400);

  const stale = await req("PATCH", `/api/devices/${created.id}?if_match=9999`, { fingerprint: "sample" });
  expect(stale.status).toBe(409);
  const fresh = await req("GET", `/api/devices/${created.id}`);
  const version = Number((fresh.headers.get("etag") ?? "").replace(/[^0-9]/g, ""));
  expect(version).toBeGreaterThan(0);
  const won = await req("PATCH", `/api/devices/${created.id}?if_match=${version}`, { fingerprint: "sample" });
  expect(won.status).toBe(200);

  const del = await req("DELETE", `/api/devices/${created.id}`);
  expect(del.status).toBe(200);
  const delMissing = await req("DELETE", `/api/devices/${created.id}`);
  expect(delMissing.status).toBe(404);
});
