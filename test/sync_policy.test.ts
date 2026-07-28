// GENERATED from the manifest. Do not edit.
import { expect, test } from "bun:test";
import { makeEnv, request, signUp } from "./harness";
import type { Sync_policy } from "../src/types";

test("sync_policy: anonymous callers are refused", async () => {
  const env = makeEnv();
  const anon = await request(env, "GET", "/api/sync_policys");
  expect(anon.status).toBe(401);
});

test("sync_policy: one workspace never sees another's rows", async () => {
  const env = makeEnv();
  const a = await signUp(env, "a@test.local");
  const b = await signUp(env, "b@test.local");
  const made = await request(env, "POST", "/api/sync_policys", { name: "sample", min_battery_level: 1, min_network_strength: 1, retry_interval: 1, is_active: 1, created_at: "2026-01-15", updated_at: "2026-01-15", zone_id: 1 }, a);
  expect(made.status).toBe(200);
  const mine = await request(env, "GET", "/api/sync_policys", undefined, a);
  expect(((await mine.json()) as Sync_policy[]).length).toBe(1);
  const theirs = await request(env, "GET", "/api/sync_policys", undefined, b);
  expect(((await theirs.json()) as Sync_policy[]).length).toBe(0);
});

test("sync_policy: empty, create, then list reflects it", async () => {
  const env = makeEnv();
  const cookie = await signUp(env);
  const req = (method: string, path: string, body?: unknown) => request(env, method, path, body, cookie);
  const empty = await req("GET", "/api/sync_policys");
  expect(empty.status).toBe(200);
  expect((await empty.json()) as Sync_policy[]).toEqual([]);

  const res = await req("POST", "/api/sync_policys", { name: "sample", min_battery_level: 1, min_network_strength: 1, retry_interval: 1, is_active: 1, created_at: "2026-01-15", updated_at: "2026-01-15", zone_id: 1 });
  expect(res.status).toBe(200);
  const created = (await res.json()) as Sync_policy;
  expect(created.name).toBe("sample");

  const list = await req("GET", "/api/sync_policys");
  expect(((await list.json()) as Sync_policy[]).length).toBe(1);

  const missing = await req("POST", "/api/sync_policys", { min_battery_level: 1, min_network_strength: 1, retry_interval: 1, is_active: 1, created_at: "2026-01-15", updated_at: "2026-01-15", zone_id: 1 });
  expect(missing.status).toBe(400);

  const patched = await req("PATCH", `/api/sync_policys/${created.id}`, { name: "patched" });
  expect(patched.status).toBe(200);
  const after = (await patched.json()) as Sync_policy;
  expect(after.name).toBe("patched");
  expect(after.min_battery_level).toBe(1);

  const idem1 = await req("POST", "/api/sync_policys?idempotency_key=retry-1", { name: "sample", min_battery_level: 1, min_network_strength: 1, retry_interval: 1, is_active: 1, created_at: "2026-01-15", updated_at: "2026-01-15", zone_id: 1 });
  const idem2 = await req("POST", "/api/sync_policys?idempotency_key=retry-1", { name: "sample", min_battery_level: 1, min_network_strength: 1, retry_interval: 1, is_active: 1, created_at: "2026-01-15", updated_at: "2026-01-15", zone_id: 1 });
  expect(idem2.status).toBe(200);
  expect(((await idem2.json()) as Sync_policy).id).toBe(((await idem1.json()) as Sync_policy).id);

  const bulk = await req("POST", "/api/sync_policys/bulk", { rows: [{ name: "sample", min_battery_level: 1, min_network_strength: 1, retry_interval: 1, is_active: 1, created_at: "2026-01-15", updated_at: "2026-01-15", zone_id: 1 }, { name: "sample", min_battery_level: 1, min_network_strength: 1, retry_interval: 1, is_active: 1, created_at: "2026-01-15", updated_at: "2026-01-15", zone_id: 1 }] });
  expect(bulk.status).toBe(200);
  expect(((await bulk.json()) as { created: number }).created).toBe(2);
  const bulkBad = await req("POST", "/api/sync_policys/bulk", { rows: [{ min_battery_level: 1, min_network_strength: 1, retry_interval: 1, is_active: 1, created_at: "2026-01-15", updated_at: "2026-01-15", zone_id: 1 }] });
  expect(bulkBad.status).toBe(400);

  const stats = await req("GET", "/api/sync_policys/stats");
  expect(stats.status).toBe(200);
  const buckets = (await stats.json()) as { key: unknown; count: number }[];
  expect(buckets.reduce((n, b) => n + b.count, 0)).toBe(4);
  const badBy = await req("GET", "/api/sync_policys/stats?by=__nope__");
  expect(badBy.status).toBe(400);

  const stale = await req("PATCH", `/api/sync_policys/${created.id}?if_match=9999`, { name: "sample" });
  expect(stale.status).toBe(409);
  const fresh = await req("GET", `/api/sync_policys/${created.id}`);
  const version = Number((fresh.headers.get("etag") ?? "").replace(/[^0-9]/g, ""));
  expect(version).toBeGreaterThan(0);
  const won = await req("PATCH", `/api/sync_policys/${created.id}?if_match=${version}`, { name: "sample" });
  expect(won.status).toBe(200);

  const del = await req("DELETE", `/api/sync_policys/${created.id}`);
  expect(del.status).toBe(200);
  const delMissing = await req("DELETE", `/api/sync_policys/${created.id}`);
  expect(delMissing.status).toBe(404);
});
