// GENERATED from the manifest. Do not edit.
import { expect, test } from "bun:test";
import { makeEnv, request, signUp } from "./harness";
import type { Site } from "../src/types";

test("site: anonymous callers are refused", async () => {
  const env = makeEnv();
  const anon = await request(env, "GET", "/api/sites");
  expect(anon.status).toBe(401);
});

test("site: one workspace never sees another's rows", async () => {
  const env = makeEnv();
  const a = await signUp(env, "a@test.local");
  const b = await signUp(env, "b@test.local");
  const made = await request(env, "POST", "/api/sites", { name: "sample", latitude: 1.5, longitude: 1.5, mean_value: 1.5, std_dev: 1.5, last_sync: "2026-01-15", sync_success_rate: 1.5, technician_email: "sample", status: "active", zone_id: 1 }, a);
  expect(made.status).toBe(200);
  const mine = await request(env, "GET", "/api/sites", undefined, a);
  expect(((await mine.json()) as Site[]).length).toBe(1);
  const theirs = await request(env, "GET", "/api/sites", undefined, b);
  expect(((await theirs.json()) as Site[]).length).toBe(0);
});

test("site: empty, create, then list reflects it", async () => {
  const env = makeEnv();
  const cookie = await signUp(env);
  const req = (method: string, path: string, body?: unknown) => request(env, method, path, body, cookie);
  const empty = await req("GET", "/api/sites");
  expect(empty.status).toBe(200);
  expect((await empty.json()) as Site[]).toEqual([]);

  const res = await req("POST", "/api/sites", { name: "sample", latitude: 1.5, longitude: 1.5, mean_value: 1.5, std_dev: 1.5, last_sync: "2026-01-15", sync_success_rate: 1.5, technician_email: "sample", status: "active", zone_id: 1 });
  expect(res.status).toBe(200);
  const created = (await res.json()) as Site;
  expect(created.name).toBe("sample");

  const list = await req("GET", "/api/sites");
  expect(((await list.json()) as Site[]).length).toBe(1);

  const missing = await req("POST", "/api/sites", { latitude: 1.5, longitude: 1.5, mean_value: 1.5, std_dev: 1.5, last_sync: "2026-01-15", sync_success_rate: 1.5, technician_email: "sample", status: "active", zone_id: 1 });
  expect(missing.status).toBe(400);

  const badEnum = await req("POST", "/api/sites", { ...{ name: "sample", latitude: 1.5, longitude: 1.5, mean_value: 1.5, std_dev: 1.5, last_sync: "2026-01-15", sync_success_rate: 1.5, technician_email: "sample", status: "active", zone_id: 1 }, status: "__not_a_state__" });
  expect(badEnum.status).toBe(400);

  const patched = await req("PATCH", `/api/sites/${created.id}`, { name: "patched" });
  expect(patched.status).toBe(200);
  const after = (await patched.json()) as Site;
  expect(after.name).toBe("patched");
  expect(after.latitude).toBe(1.5);

  const wfOk = await req("PATCH", `/api/sites/${created.id}`, { status: "maintenance" });
  expect(wfOk.status).toBe(200);
  expect(((await wfOk.json()) as Site).status).toBe("maintenance");

  const idem1 = await req("POST", "/api/sites?idempotency_key=retry-1", { name: "sample", latitude: 1.5, longitude: 1.5, mean_value: 1.5, std_dev: 1.5, last_sync: "2026-01-15", sync_success_rate: 1.5, technician_email: "sample", status: "active", zone_id: 1 });
  const idem2 = await req("POST", "/api/sites?idempotency_key=retry-1", { name: "sample", latitude: 1.5, longitude: 1.5, mean_value: 1.5, std_dev: 1.5, last_sync: "2026-01-15", sync_success_rate: 1.5, technician_email: "sample", status: "active", zone_id: 1 });
  expect(idem2.status).toBe(200);
  expect(((await idem2.json()) as Site).id).toBe(((await idem1.json()) as Site).id);

  const bulk = await req("POST", "/api/sites/bulk", { rows: [{ name: "sample", latitude: 1.5, longitude: 1.5, mean_value: 1.5, std_dev: 1.5, last_sync: "2026-01-15", sync_success_rate: 1.5, technician_email: "sample", status: "active", zone_id: 1 }, { name: "sample", latitude: 1.5, longitude: 1.5, mean_value: 1.5, std_dev: 1.5, last_sync: "2026-01-15", sync_success_rate: 1.5, technician_email: "sample", status: "active", zone_id: 1 }] });
  expect(bulk.status).toBe(200);
  expect(((await bulk.json()) as { created: number }).created).toBe(2);
  const bulkBad = await req("POST", "/api/sites/bulk", { rows: [{ latitude: 1.5, longitude: 1.5, mean_value: 1.5, std_dev: 1.5, last_sync: "2026-01-15", sync_success_rate: 1.5, technician_email: "sample", status: "active", zone_id: 1 }] });
  expect(bulkBad.status).toBe(400);

  const stats = await req("GET", "/api/sites/stats");
  expect(stats.status).toBe(200);
  const buckets = (await stats.json()) as { key: unknown; count: number }[];
  expect(buckets.reduce((n, b) => n + b.count, 0)).toBe(4);
  const badBy = await req("GET", "/api/sites/stats?by=__nope__");
  expect(badBy.status).toBe(400);

  const stale = await req("PATCH", `/api/sites/${created.id}?if_match=9999`, { name: "sample" });
  expect(stale.status).toBe(409);
  const fresh = await req("GET", `/api/sites/${created.id}`);
  const version = Number((fresh.headers.get("etag") ?? "").replace(/[^0-9]/g, ""));
  expect(version).toBeGreaterThan(0);
  const won = await req("PATCH", `/api/sites/${created.id}?if_match=${version}`, { name: "sample" });
  expect(won.status).toBe(200);

  const del = await req("DELETE", `/api/sites/${created.id}`);
  expect(del.status).toBe(200);
  const delMissing = await req("DELETE", `/api/sites/${created.id}`);
  expect(delMissing.status).toBe(404);
});
