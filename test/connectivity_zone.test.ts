// GENERATED from the manifest. Do not edit.
import { expect, test } from "bun:test";
import { makeEnv, request, signUp } from "./harness";
import type { Connectivity_zone } from "../src/types";

test("connectivity_zone: anonymous callers are refused", async () => {
  const env = makeEnv();
  const anon = await request(env, "GET", "/api/connectivity_zones");
  expect(anon.status).toBe(401);
});

test("connectivity_zone: one workspace never sees another's rows", async () => {
  const env = makeEnv();
  const a = await signUp(env, "a@test.local");
  const b = await signUp(env, "b@test.local");
  const made = await request(env, "POST", "/api/connectivity_zones", { name: "sample", polygon_geojson: "sample", sync_success_rate: 1.5, last_updated: "2026-01-15", technician_email: "sample", status: "active" }, a);
  expect(made.status).toBe(200);
  const mine = await request(env, "GET", "/api/connectivity_zones", undefined, a);
  expect(((await mine.json()) as Connectivity_zone[]).length).toBe(1);
  const theirs = await request(env, "GET", "/api/connectivity_zones", undefined, b);
  expect(((await theirs.json()) as Connectivity_zone[]).length).toBe(0);
});

test("connectivity_zone: empty, create, then list reflects it", async () => {
  const env = makeEnv();
  const cookie = await signUp(env);
  const req = (method: string, path: string, body?: unknown) => request(env, method, path, body, cookie);
  const empty = await req("GET", "/api/connectivity_zones");
  expect(empty.status).toBe(200);
  expect((await empty.json()) as Connectivity_zone[]).toEqual([]);

  const res = await req("POST", "/api/connectivity_zones", { name: "sample", polygon_geojson: "sample", sync_success_rate: 1.5, last_updated: "2026-01-15", technician_email: "sample", status: "active" });
  expect(res.status).toBe(200);
  const created = (await res.json()) as Connectivity_zone;
  expect(created.name).toBe("sample");

  const list = await req("GET", "/api/connectivity_zones");
  expect(((await list.json()) as Connectivity_zone[]).length).toBe(1);

  const missing = await req("POST", "/api/connectivity_zones", { polygon_geojson: "sample", sync_success_rate: 1.5, last_updated: "2026-01-15", technician_email: "sample", status: "active" });
  expect(missing.status).toBe(400);

  const badEnum = await req("POST", "/api/connectivity_zones", { ...{ name: "sample", polygon_geojson: "sample", sync_success_rate: 1.5, last_updated: "2026-01-15", technician_email: "sample", status: "active" }, status: "__not_a_state__" });
  expect(badEnum.status).toBe(400);

  const patched = await req("PATCH", `/api/connectivity_zones/${created.id}`, { name: "patched" });
  expect(patched.status).toBe(200);
  const after = (await patched.json()) as Connectivity_zone;
  expect(after.name).toBe("patched");
  expect(after.polygon_geojson).toBe("sample");

  const wfOk = await req("PATCH", `/api/connectivity_zones/${created.id}`, { status: "monitoring" });
  expect(wfOk.status).toBe(200);
  expect(((await wfOk.json()) as Connectivity_zone).status).toBe("monitoring");

  const idem1 = await req("POST", "/api/connectivity_zones?idempotency_key=retry-1", { name: "sample", polygon_geojson: "sample", sync_success_rate: 1.5, last_updated: "2026-01-15", technician_email: "sample", status: "active" });
  const idem2 = await req("POST", "/api/connectivity_zones?idempotency_key=retry-1", { name: "sample", polygon_geojson: "sample", sync_success_rate: 1.5, last_updated: "2026-01-15", technician_email: "sample", status: "active" });
  expect(idem2.status).toBe(200);
  expect(((await idem2.json()) as Connectivity_zone).id).toBe(((await idem1.json()) as Connectivity_zone).id);

  const bulk = await req("POST", "/api/connectivity_zones/bulk", { rows: [{ name: "sample", polygon_geojson: "sample", sync_success_rate: 1.5, last_updated: "2026-01-15", technician_email: "sample", status: "active" }, { name: "sample", polygon_geojson: "sample", sync_success_rate: 1.5, last_updated: "2026-01-15", technician_email: "sample", status: "active" }] });
  expect(bulk.status).toBe(200);
  expect(((await bulk.json()) as { created: number }).created).toBe(2);
  const bulkBad = await req("POST", "/api/connectivity_zones/bulk", { rows: [{ polygon_geojson: "sample", sync_success_rate: 1.5, last_updated: "2026-01-15", technician_email: "sample", status: "active" }] });
  expect(bulkBad.status).toBe(400);

  const stats = await req("GET", "/api/connectivity_zones/stats");
  expect(stats.status).toBe(200);
  const buckets = (await stats.json()) as { key: unknown; count: number }[];
  expect(buckets.reduce((n, b) => n + b.count, 0)).toBe(4);
  const badBy = await req("GET", "/api/connectivity_zones/stats?by=__nope__");
  expect(badBy.status).toBe(400);

  const stale = await req("PATCH", `/api/connectivity_zones/${created.id}?if_match=9999`, { name: "sample" });
  expect(stale.status).toBe(409);
  const fresh = await req("GET", `/api/connectivity_zones/${created.id}`);
  const version = Number((fresh.headers.get("etag") ?? "").replace(/[^0-9]/g, ""));
  expect(version).toBeGreaterThan(0);
  const won = await req("PATCH", `/api/connectivity_zones/${created.id}?if_match=${version}`, { name: "sample" });
  expect(won.status).toBe(200);

  const del = await req("DELETE", `/api/connectivity_zones/${created.id}`);
  expect(del.status).toBe(200);
  const delMissing = await req("DELETE", `/api/connectivity_zones/${created.id}`);
  expect(delMissing.status).toBe(404);
});
