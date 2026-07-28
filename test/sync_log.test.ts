// GENERATED from the manifest. Do not edit.
import { expect, test } from "bun:test";
import { makeEnv, request, signUp } from "./harness";
import type { Sync_log } from "../src/types";

test("sync_log: anonymous callers are refused", async () => {
  const env = makeEnv();
  const anon = await request(env, "GET", "/api/sync_logs");
  expect(anon.status).toBe(401);
});

test("sync_log: one workspace never sees another's rows", async () => {
  const env = makeEnv();
  const a = await signUp(env, "a@test.local");
  const b = await signUp(env, "b@test.local");
  const made = await request(env, "POST", "/api/sync_logs", { reading_id: 1, attempt_timestamp: "2026-01-15", status: "success", http_status: 1, error_message: "sample", retry_count: 1, sync_session_id: 1, bytes_transferred: 1, duration_ms: 1, endpoint_url: "sample" }, a);
  expect(made.status).toBe(200);
  const mine = await request(env, "GET", "/api/sync_logs", undefined, a);
  expect(((await mine.json()) as Sync_log[]).length).toBe(1);
  const theirs = await request(env, "GET", "/api/sync_logs", undefined, b);
  expect(((await theirs.json()) as Sync_log[]).length).toBe(0);
});

test("sync_log: empty, create, then list reflects it", async () => {
  const env = makeEnv();
  const cookie = await signUp(env);
  const req = (method: string, path: string, body?: unknown) => request(env, method, path, body, cookie);
  const empty = await req("GET", "/api/sync_logs");
  expect(empty.status).toBe(200);
  expect((await empty.json()) as Sync_log[]).toEqual([]);

  const res = await req("POST", "/api/sync_logs", { reading_id: 1, attempt_timestamp: "2026-01-15", status: "success", http_status: 1, error_message: "sample", retry_count: 1, sync_session_id: 1, bytes_transferred: 1, duration_ms: 1, endpoint_url: "sample" });
  expect(res.status).toBe(200);
  const created = (await res.json()) as Sync_log;
  expect(created.error_message).toBe("sample");

  const list = await req("GET", "/api/sync_logs");
  expect(((await list.json()) as Sync_log[]).length).toBe(1);

  const missing = await req("POST", "/api/sync_logs", { attempt_timestamp: "2026-01-15", status: "success", http_status: 1, error_message: "sample", retry_count: 1, sync_session_id: 1, bytes_transferred: 1, duration_ms: 1, endpoint_url: "sample" });
  expect(missing.status).toBe(400);

  const badEnum = await req("POST", "/api/sync_logs", { ...{ reading_id: 1, attempt_timestamp: "2026-01-15", status: "success", http_status: 1, error_message: "sample", retry_count: 1, sync_session_id: 1, bytes_transferred: 1, duration_ms: 1, endpoint_url: "sample" }, status: "__not_a_state__" });
  expect(badEnum.status).toBe(400);

  const patched = await req("PATCH", `/api/sync_logs/${created.id}`, { error_message: "patched" });
  expect(patched.status).toBe(200);
  const after = (await patched.json()) as Sync_log;
  expect(after.error_message).toBe("patched");
  expect(after.reading_id).toBe(1);

  const idem1 = await req("POST", "/api/sync_logs?idempotency_key=retry-1", { reading_id: 1, attempt_timestamp: "2026-01-15", status: "success", http_status: 1, error_message: "sample", retry_count: 1, sync_session_id: 1, bytes_transferred: 1, duration_ms: 1, endpoint_url: "sample" });
  const idem2 = await req("POST", "/api/sync_logs?idempotency_key=retry-1", { reading_id: 1, attempt_timestamp: "2026-01-15", status: "success", http_status: 1, error_message: "sample", retry_count: 1, sync_session_id: 1, bytes_transferred: 1, duration_ms: 1, endpoint_url: "sample" });
  expect(idem2.status).toBe(200);
  expect(((await idem2.json()) as Sync_log).id).toBe(((await idem1.json()) as Sync_log).id);

  const bulk = await req("POST", "/api/sync_logs/bulk", { rows: [{ reading_id: 1, attempt_timestamp: "2026-01-15", status: "success", http_status: 1, error_message: "sample", retry_count: 1, sync_session_id: 1, bytes_transferred: 1, duration_ms: 1, endpoint_url: "sample" }, { reading_id: 1, attempt_timestamp: "2026-01-15", status: "success", http_status: 1, error_message: "sample", retry_count: 1, sync_session_id: 1, bytes_transferred: 1, duration_ms: 1, endpoint_url: "sample" }] });
  expect(bulk.status).toBe(200);
  expect(((await bulk.json()) as { created: number }).created).toBe(2);
  const bulkBad = await req("POST", "/api/sync_logs/bulk", { rows: [{ attempt_timestamp: "2026-01-15", status: "success", http_status: 1, error_message: "sample", retry_count: 1, sync_session_id: 1, bytes_transferred: 1, duration_ms: 1, endpoint_url: "sample" }] });
  expect(bulkBad.status).toBe(400);

  const stats = await req("GET", "/api/sync_logs/stats");
  expect(stats.status).toBe(200);
  const buckets = (await stats.json()) as { key: unknown; count: number }[];
  expect(buckets.reduce((n, b) => n + b.count, 0)).toBe(4);
  const badBy = await req("GET", "/api/sync_logs/stats?by=__nope__");
  expect(badBy.status).toBe(400);

  const stale = await req("PATCH", `/api/sync_logs/${created.id}?if_match=9999`, { reading_id: 1 });
  expect(stale.status).toBe(409);
  const fresh = await req("GET", `/api/sync_logs/${created.id}`);
  const version = Number((fresh.headers.get("etag") ?? "").replace(/[^0-9]/g, ""));
  expect(version).toBeGreaterThan(0);
  const won = await req("PATCH", `/api/sync_logs/${created.id}?if_match=${version}`, { reading_id: 1 });
  expect(won.status).toBe(200);
});
