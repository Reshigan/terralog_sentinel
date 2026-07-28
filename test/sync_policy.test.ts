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
  const made = await request(env, "POST", "/api/sync_policys", { name: "sample", max_attempts: 1, retry_interval_seconds: 1, description: "sample", is_active: 1, backoff_strategy: "linear", min_backoff_seconds: 1, max_backoff_seconds: 1, created_by: "sample", created_at: "2026-01-15" }, a);
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

  const res = await req("POST", "/api/sync_policys", { name: "sample", max_attempts: 1, retry_interval_seconds: 1, description: "sample", is_active: 1, backoff_strategy: "linear", min_backoff_seconds: 1, max_backoff_seconds: 1, created_by: "sample", created_at: "2026-01-15" });
  expect(res.status).toBe(200);
  const created = (await res.json()) as Sync_policy;
  expect(created.name).toBe("sample");

  const list = await req("GET", "/api/sync_policys");
  expect(((await list.json()) as Sync_policy[]).length).toBe(1);

  const missing = await req("POST", "/api/sync_policys", { max_attempts: 1, retry_interval_seconds: 1, description: "sample", is_active: 1, backoff_strategy: "linear", min_backoff_seconds: 1, max_backoff_seconds: 1, created_by: "sample", created_at: "2026-01-15" });
  expect(missing.status).toBe(400);

  const badEnum = await req("POST", "/api/sync_policys", { ...{ name: "sample", max_attempts: 1, retry_interval_seconds: 1, description: "sample", is_active: 1, backoff_strategy: "linear", min_backoff_seconds: 1, max_backoff_seconds: 1, created_by: "sample", created_at: "2026-01-15" }, backoff_strategy: "__not_a_state__" });
  expect(badEnum.status).toBe(400);

  const patched = await req("PATCH", `/api/sync_policys/${created.id}`, { name: "patched" });
  expect(patched.status).toBe(200);
  const after = (await patched.json()) as Sync_policy;
  expect(after.name).toBe("patched");
  expect(after.max_attempts).toBe(1);

  const idem1 = await req("POST", "/api/sync_policys?idempotency_key=retry-1", { name: "sample", max_attempts: 1, retry_interval_seconds: 1, description: "sample", is_active: 1, backoff_strategy: "linear", min_backoff_seconds: 1, max_backoff_seconds: 1, created_by: "sample", created_at: "2026-01-15" });
  const idem2 = await req("POST", "/api/sync_policys?idempotency_key=retry-1", { name: "sample", max_attempts: 1, retry_interval_seconds: 1, description: "sample", is_active: 1, backoff_strategy: "linear", min_backoff_seconds: 1, max_backoff_seconds: 1, created_by: "sample", created_at: "2026-01-15" });
  expect(idem2.status).toBe(200);
  expect(((await idem2.json()) as Sync_policy).id).toBe(((await idem1.json()) as Sync_policy).id);

  const bulk = await req("POST", "/api/sync_policys/bulk", { rows: [{ name: "sample", max_attempts: 1, retry_interval_seconds: 1, description: "sample", is_active: 1, backoff_strategy: "linear", min_backoff_seconds: 1, max_backoff_seconds: 1, created_by: "sample", created_at: "2026-01-15" }, { name: "sample", max_attempts: 1, retry_interval_seconds: 1, description: "sample", is_active: 1, backoff_strategy: "linear", min_backoff_seconds: 1, max_backoff_seconds: 1, created_by: "sample", created_at: "2026-01-15" }] });
  expect(bulk.status).toBe(200);
  expect(((await bulk.json()) as { created: number }).created).toBe(2);
  const bulkBad = await req("POST", "/api/sync_policys/bulk", { rows: [{ max_attempts: 1, retry_interval_seconds: 1, description: "sample", is_active: 1, backoff_strategy: "linear", min_backoff_seconds: 1, max_backoff_seconds: 1, created_by: "sample", created_at: "2026-01-15" }] });
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
