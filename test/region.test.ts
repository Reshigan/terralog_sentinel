// GENERATED from the manifest. Do not edit.
import { expect, test } from "bun:test";
import { makeEnv, request, signUp } from "./harness";
import type { Region } from "../src/types";

test("region: anonymous callers are refused", async () => {
  const env = makeEnv();
  const anon = await request(env, "GET", "/api/regions");
  expect(anon.status).toBe(401);
});

test("region: one workspace never sees another's rows", async () => {
  const env = makeEnv();
  const a = await signUp(env, "a@test.local");
  const b = await signUp(env, "b@test.local");
  const made = await request(env, "POST", "/api/regions", { name: "sample", description: "sample", is_active: 1, manager_id: 1, latitude: 1.5, longitude: 1.5, geofence_radius_meters: 1, timezone: "sample", operational_hours: "sample" }, a);
  expect(made.status).toBe(200);
  const mine = await request(env, "GET", "/api/regions", undefined, a);
  expect(((await mine.json()) as Region[]).length).toBe(1);
  const theirs = await request(env, "GET", "/api/regions", undefined, b);
  expect(((await theirs.json()) as Region[]).length).toBe(0);
});

test("region: empty, create, then list reflects it", async () => {
  const env = makeEnv();
  const cookie = await signUp(env);
  const req = (method: string, path: string, body?: unknown) => request(env, method, path, body, cookie);
  const empty = await req("GET", "/api/regions");
  expect(empty.status).toBe(200);
  expect((await empty.json()) as Region[]).toEqual([]);

  const res = await req("POST", "/api/regions", { name: "sample", description: "sample", is_active: 1, manager_id: 1, latitude: 1.5, longitude: 1.5, geofence_radius_meters: 1, timezone: "sample", operational_hours: "sample" });
  expect(res.status).toBe(200);
  const created = (await res.json()) as Region;
  expect(created.name).toBe("sample");

  const list = await req("GET", "/api/regions");
  expect(((await list.json()) as Region[]).length).toBe(1);

  const missing = await req("POST", "/api/regions", { description: "sample", is_active: 1, manager_id: 1, latitude: 1.5, longitude: 1.5, geofence_radius_meters: 1, timezone: "sample", operational_hours: "sample" });
  expect(missing.status).toBe(400);

  const patched = await req("PATCH", `/api/regions/${created.id}`, { name: "patched" });
  expect(patched.status).toBe(200);
  const after = (await patched.json()) as Region;
  expect(after.name).toBe("patched");
  expect(after.description).toBe("sample");

  const idem1 = await req("POST", "/api/regions?idempotency_key=retry-1", { name: "sample", description: "sample", is_active: 1, manager_id: 1, latitude: 1.5, longitude: 1.5, geofence_radius_meters: 1, timezone: "sample", operational_hours: "sample" });
  const idem2 = await req("POST", "/api/regions?idempotency_key=retry-1", { name: "sample", description: "sample", is_active: 1, manager_id: 1, latitude: 1.5, longitude: 1.5, geofence_radius_meters: 1, timezone: "sample", operational_hours: "sample" });
  expect(idem2.status).toBe(200);
  expect(((await idem2.json()) as Region).id).toBe(((await idem1.json()) as Region).id);

  const bulk = await req("POST", "/api/regions/bulk", { rows: [{ name: "sample", description: "sample", is_active: 1, manager_id: 1, latitude: 1.5, longitude: 1.5, geofence_radius_meters: 1, timezone: "sample", operational_hours: "sample" }, { name: "sample", description: "sample", is_active: 1, manager_id: 1, latitude: 1.5, longitude: 1.5, geofence_radius_meters: 1, timezone: "sample", operational_hours: "sample" }] });
  expect(bulk.status).toBe(200);
  expect(((await bulk.json()) as { created: number }).created).toBe(2);
  const bulkBad = await req("POST", "/api/regions/bulk", { rows: [{ description: "sample", is_active: 1, manager_id: 1, latitude: 1.5, longitude: 1.5, geofence_radius_meters: 1, timezone: "sample", operational_hours: "sample" }] });
  expect(bulkBad.status).toBe(400);

  const stats = await req("GET", "/api/regions/stats");
  expect(stats.status).toBe(200);
  const buckets = (await stats.json()) as { key: unknown; count: number }[];
  expect(buckets.reduce((n, b) => n + b.count, 0)).toBe(4);
  const badBy = await req("GET", "/api/regions/stats?by=__nope__");
  expect(badBy.status).toBe(400);

  const stale = await req("PATCH", `/api/regions/${created.id}?if_match=9999`, { name: "sample" });
  expect(stale.status).toBe(409);
  const fresh = await req("GET", `/api/regions/${created.id}`);
  const version = Number((fresh.headers.get("etag") ?? "").replace(/[^0-9]/g, ""));
  expect(version).toBeGreaterThan(0);
  const won = await req("PATCH", `/api/regions/${created.id}?if_match=${version}`, { name: "sample" });
  expect(won.status).toBe(200);

  const del = await req("DELETE", `/api/regions/${created.id}`);
  expect(del.status).toBe(200);
  const delMissing = await req("DELETE", `/api/regions/${created.id}`);
  expect(delMissing.status).toBe(404);
});
