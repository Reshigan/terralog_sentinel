// GENERATED from the manifest. Do not edit.
import { expect, test } from "bun:test";
import { makeEnv, request, signUp } from "./harness";
import type { Outlier } from "../src/types";

test("outlier: anonymous callers are refused", async () => {
  const env = makeEnv();
  const anon = await request(env, "GET", "/api/outliers");
  expect(anon.status).toBe(401);
});

test("outlier: one workspace never sees another's rows", async () => {
  const env = makeEnv();
  const a = await signUp(env, "a@test.local");
  const b = await signUp(env, "b@test.local");
  const made = await request(env, "POST", "/api/outliers", { reading_id: 1, detected_at: "2026-01-15", z_score: 1.5, is_resolved: 1, resolved_at: "2026-01-15", resolved_by: "sample", site_id: 1, notification_id: 1 }, a);
  expect(made.status).toBe(200);
  const mine = await request(env, "GET", "/api/outliers", undefined, a);
  expect(((await mine.json()) as Outlier[]).length).toBe(1);
  const theirs = await request(env, "GET", "/api/outliers", undefined, b);
  expect(((await theirs.json()) as Outlier[]).length).toBe(0);
});

test("outlier: empty, create, then list reflects it", async () => {
  const env = makeEnv();
  const cookie = await signUp(env);
  const req = (method: string, path: string, body?: unknown) => request(env, method, path, body, cookie);
  const empty = await req("GET", "/api/outliers");
  expect(empty.status).toBe(200);
  expect((await empty.json()) as Outlier[]).toEqual([]);

  const res = await req("POST", "/api/outliers", { reading_id: 1, detected_at: "2026-01-15", z_score: 1.5, is_resolved: 1, resolved_at: "2026-01-15", resolved_by: "sample", site_id: 1, notification_id: 1 });
  expect(res.status).toBe(200);
  const created = (await res.json()) as Outlier;
  expect(created.resolved_by).toBe("sample");

  const list = await req("GET", "/api/outliers");
  expect(((await list.json()) as Outlier[]).length).toBe(1);

  const missing = await req("POST", "/api/outliers", { detected_at: "2026-01-15", z_score: 1.5, is_resolved: 1, resolved_at: "2026-01-15", resolved_by: "sample", site_id: 1, notification_id: 1 });
  expect(missing.status).toBe(400);

  const patched = await req("PATCH", `/api/outliers/${created.id}`, { resolved_by: "patched" });
  expect(patched.status).toBe(200);
  const after = (await patched.json()) as Outlier;
  expect(after.resolved_by).toBe("patched");
  expect(after.reading_id).toBe(1);

  const idem1 = await req("POST", "/api/outliers?idempotency_key=retry-1", { reading_id: 1, detected_at: "2026-01-15", z_score: 1.5, is_resolved: 1, resolved_at: "2026-01-15", resolved_by: "sample", site_id: 1, notification_id: 1 });
  const idem2 = await req("POST", "/api/outliers?idempotency_key=retry-1", { reading_id: 1, detected_at: "2026-01-15", z_score: 1.5, is_resolved: 1, resolved_at: "2026-01-15", resolved_by: "sample", site_id: 1, notification_id: 1 });
  expect(idem2.status).toBe(200);
  expect(((await idem2.json()) as Outlier).id).toBe(((await idem1.json()) as Outlier).id);

  const bulk = await req("POST", "/api/outliers/bulk", { rows: [{ reading_id: 1, detected_at: "2026-01-15", z_score: 1.5, is_resolved: 1, resolved_at: "2026-01-15", resolved_by: "sample", site_id: 1, notification_id: 1 }, { reading_id: 1, detected_at: "2026-01-15", z_score: 1.5, is_resolved: 1, resolved_at: "2026-01-15", resolved_by: "sample", site_id: 1, notification_id: 1 }] });
  expect(bulk.status).toBe(200);
  expect(((await bulk.json()) as { created: number }).created).toBe(2);
  const bulkBad = await req("POST", "/api/outliers/bulk", { rows: [{ detected_at: "2026-01-15", z_score: 1.5, is_resolved: 1, resolved_at: "2026-01-15", resolved_by: "sample", site_id: 1, notification_id: 1 }] });
  expect(bulkBad.status).toBe(400);

  const stats = await req("GET", "/api/outliers/stats");
  expect(stats.status).toBe(200);
  const buckets = (await stats.json()) as { key: unknown; count: number }[];
  expect(buckets.reduce((n, b) => n + b.count, 0)).toBe(4);
  const badBy = await req("GET", "/api/outliers/stats?by=__nope__");
  expect(badBy.status).toBe(400);

  const stale = await req("PATCH", `/api/outliers/${created.id}?if_match=9999`, { reading_id: 1 });
  expect(stale.status).toBe(409);
  const fresh = await req("GET", `/api/outliers/${created.id}`);
  const version = Number((fresh.headers.get("etag") ?? "").replace(/[^0-9]/g, ""));
  expect(version).toBeGreaterThan(0);
  const won = await req("PATCH", `/api/outliers/${created.id}?if_match=${version}`, { reading_id: 1 });
  expect(won.status).toBe(200);

  const del = await req("DELETE", `/api/outliers/${created.id}`);
  expect(del.status).toBe(200);
  const delMissing = await req("DELETE", `/api/outliers/${created.id}`);
  expect(delMissing.status).toBe(404);
});
