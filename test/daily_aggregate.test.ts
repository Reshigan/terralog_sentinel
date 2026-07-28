// GENERATED from the manifest. Do not edit.
import { expect, test } from "bun:test";
import { makeEnv, request, signUp } from "./harness";
import type { Daily_aggregate } from "../src/types";

test("daily_aggregate: anonymous callers are refused", async () => {
  const env = makeEnv();
  const anon = await request(env, "GET", "/api/daily_aggregates");
  expect(anon.status).toBe(401);
});

test("daily_aggregate: one workspace never sees another's rows", async () => {
  const env = makeEnv();
  const a = await signUp(env, "a@test.local");
  const b = await signUp(env, "b@test.local");
  const made = await request(env, "POST", "/api/daily_aggregates", { date: "2026-01-15", total_readings: 1, synced_readings: 1, failed_readings: 1, avg_numeric_value: 1.5, site_id: 1, zone_id: 1 }, a);
  expect(made.status).toBe(200);
  const mine = await request(env, "GET", "/api/daily_aggregates", undefined, a);
  expect(((await mine.json()) as Daily_aggregate[]).length).toBe(1);
  const theirs = await request(env, "GET", "/api/daily_aggregates", undefined, b);
  expect(((await theirs.json()) as Daily_aggregate[]).length).toBe(0);
});

test("daily_aggregate: empty, create, then list reflects it", async () => {
  const env = makeEnv();
  const cookie = await signUp(env);
  const req = (method: string, path: string, body?: unknown) => request(env, method, path, body, cookie);
  const empty = await req("GET", "/api/daily_aggregates");
  expect(empty.status).toBe(200);
  expect((await empty.json()) as Daily_aggregate[]).toEqual([]);

  const res = await req("POST", "/api/daily_aggregates", { date: "2026-01-15", total_readings: 1, synced_readings: 1, failed_readings: 1, avg_numeric_value: 1.5, site_id: 1, zone_id: 1 });
  expect(res.status).toBe(200);
  const created = (await res.json()) as Daily_aggregate;
  expect(typeof created.id).toBe("number");

  const list = await req("GET", "/api/daily_aggregates");
  expect(((await list.json()) as Daily_aggregate[]).length).toBe(1);

  const missing = await req("POST", "/api/daily_aggregates", { total_readings: 1, synced_readings: 1, failed_readings: 1, avg_numeric_value: 1.5, site_id: 1, zone_id: 1 });
  expect(missing.status).toBe(400);

  const idem1 = await req("POST", "/api/daily_aggregates?idempotency_key=retry-1", { date: "2026-01-15", total_readings: 1, synced_readings: 1, failed_readings: 1, avg_numeric_value: 1.5, site_id: 1, zone_id: 1 });
  const idem2 = await req("POST", "/api/daily_aggregates?idempotency_key=retry-1", { date: "2026-01-15", total_readings: 1, synced_readings: 1, failed_readings: 1, avg_numeric_value: 1.5, site_id: 1, zone_id: 1 });
  expect(idem2.status).toBe(200);
  expect(((await idem2.json()) as Daily_aggregate).id).toBe(((await idem1.json()) as Daily_aggregate).id);

  const bulk = await req("POST", "/api/daily_aggregates/bulk", { rows: [{ date: "2026-01-15", total_readings: 1, synced_readings: 1, failed_readings: 1, avg_numeric_value: 1.5, site_id: 1, zone_id: 1 }, { date: "2026-01-15", total_readings: 1, synced_readings: 1, failed_readings: 1, avg_numeric_value: 1.5, site_id: 1, zone_id: 1 }] });
  expect(bulk.status).toBe(200);
  expect(((await bulk.json()) as { created: number }).created).toBe(2);
  const bulkBad = await req("POST", "/api/daily_aggregates/bulk", { rows: [{ total_readings: 1, synced_readings: 1, failed_readings: 1, avg_numeric_value: 1.5, site_id: 1, zone_id: 1 }] });
  expect(bulkBad.status).toBe(400);

  const stats = await req("GET", "/api/daily_aggregates/stats");
  expect(stats.status).toBe(200);
  const buckets = (await stats.json()) as { key: unknown; count: number }[];
  expect(buckets.reduce((n, b) => n + b.count, 0)).toBe(4);
  const badBy = await req("GET", "/api/daily_aggregates/stats?by=__nope__");
  expect(badBy.status).toBe(400);

  const stale = await req("PATCH", `/api/daily_aggregates/${created.id}?if_match=9999`, { total_readings: 1 });
  expect(stale.status).toBe(409);
  const fresh = await req("GET", `/api/daily_aggregates/${created.id}`);
  const version = Number((fresh.headers.get("etag") ?? "").replace(/[^0-9]/g, ""));
  expect(version).toBeGreaterThan(0);
  const won = await req("PATCH", `/api/daily_aggregates/${created.id}?if_match=${version}`, { total_readings: 1 });
  expect(won.status).toBe(200);

  const del = await req("DELETE", `/api/daily_aggregates/${created.id}`);
  expect(del.status).toBe(200);
  const delMissing = await req("DELETE", `/api/daily_aggregates/${created.id}`);
  expect(delMissing.status).toBe(404);
});
