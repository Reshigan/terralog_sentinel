// GENERATED from the manifest. Do not edit.
import { expect, test } from "bun:test";
import { makeEnv, request, signUp } from "./harness";
import type { Sync_session } from "../src/types";

test("sync_session: anonymous callers are refused", async () => {
  const env = makeEnv();
  const anon = await request(env, "GET", "/api/sync_sessions");
  expect(anon.status).toBe(401);
});

test("sync_session: one workspace never sees another's rows", async () => {
  const env = makeEnv();
  const a = await signUp(env, "a@test.local");
  const b = await signUp(env, "b@test.local");
  const made = await request(env, "POST", "/api/sync_sessions", { started_at: "2026-01-15", ended_at: "2026-01-15", status: "started", readings_count: 1, bytes_transferred: 1, technician_id: 1, device_id: 1, sync_policy_id: 1, network_type: "wifi", duration_seconds: 1 }, a);
  expect(made.status).toBe(200);
  const mine = await request(env, "GET", "/api/sync_sessions", undefined, a);
  expect(((await mine.json()) as Sync_session[]).length).toBe(1);
  const theirs = await request(env, "GET", "/api/sync_sessions", undefined, b);
  expect(((await theirs.json()) as Sync_session[]).length).toBe(0);
});

test("sync_session: empty, create, then list reflects it", async () => {
  const env = makeEnv();
  const cookie = await signUp(env);
  const req = (method: string, path: string, body?: unknown) => request(env, method, path, body, cookie);
  const empty = await req("GET", "/api/sync_sessions");
  expect(empty.status).toBe(200);
  expect((await empty.json()) as Sync_session[]).toEqual([]);

  const res = await req("POST", "/api/sync_sessions", { started_at: "2026-01-15", ended_at: "2026-01-15", status: "started", readings_count: 1, bytes_transferred: 1, technician_id: 1, device_id: 1, sync_policy_id: 1, network_type: "wifi", duration_seconds: 1 });
  expect(res.status).toBe(200);
  const created = (await res.json()) as Sync_session;
  expect(typeof created.id).toBe("number");

  const list = await req("GET", "/api/sync_sessions");
  expect(((await list.json()) as Sync_session[]).length).toBe(1);

  const missing = await req("POST", "/api/sync_sessions", { ended_at: "2026-01-15", status: "started", readings_count: 1, bytes_transferred: 1, technician_id: 1, device_id: 1, sync_policy_id: 1, network_type: "wifi", duration_seconds: 1 });
  expect(missing.status).toBe(400);

  const badEnum = await req("POST", "/api/sync_sessions", { ...{ started_at: "2026-01-15", ended_at: "2026-01-15", status: "started", readings_count: 1, bytes_transferred: 1, technician_id: 1, device_id: 1, sync_policy_id: 1, network_type: "wifi", duration_seconds: 1 }, status: "__not_a_state__" });
  expect(badEnum.status).toBe(400);

  const wfOk = await req("PATCH", `/api/sync_sessions/${created.id}`, { status: "completed" });
  expect(wfOk.status).toBe(200);
  expect(((await wfOk.json()) as Sync_session).status).toBe("completed");

  const idem1 = await req("POST", "/api/sync_sessions?idempotency_key=retry-1", { started_at: "2026-01-15", ended_at: "2026-01-15", status: "started", readings_count: 1, bytes_transferred: 1, technician_id: 1, device_id: 1, sync_policy_id: 1, network_type: "wifi", duration_seconds: 1 });
  const idem2 = await req("POST", "/api/sync_sessions?idempotency_key=retry-1", { started_at: "2026-01-15", ended_at: "2026-01-15", status: "started", readings_count: 1, bytes_transferred: 1, technician_id: 1, device_id: 1, sync_policy_id: 1, network_type: "wifi", duration_seconds: 1 });
  expect(idem2.status).toBe(200);
  expect(((await idem2.json()) as Sync_session).id).toBe(((await idem1.json()) as Sync_session).id);

  const bulk = await req("POST", "/api/sync_sessions/bulk", { rows: [{ started_at: "2026-01-15", ended_at: "2026-01-15", status: "started", readings_count: 1, bytes_transferred: 1, technician_id: 1, device_id: 1, sync_policy_id: 1, network_type: "wifi", duration_seconds: 1 }, { started_at: "2026-01-15", ended_at: "2026-01-15", status: "started", readings_count: 1, bytes_transferred: 1, technician_id: 1, device_id: 1, sync_policy_id: 1, network_type: "wifi", duration_seconds: 1 }] });
  expect(bulk.status).toBe(200);
  expect(((await bulk.json()) as { created: number }).created).toBe(2);
  const bulkBad = await req("POST", "/api/sync_sessions/bulk", { rows: [{ ended_at: "2026-01-15", status: "started", readings_count: 1, bytes_transferred: 1, technician_id: 1, device_id: 1, sync_policy_id: 1, network_type: "wifi", duration_seconds: 1 }] });
  expect(bulkBad.status).toBe(400);

  const stats = await req("GET", "/api/sync_sessions/stats");
  expect(stats.status).toBe(200);
  const buckets = (await stats.json()) as { key: unknown; count: number }[];
  expect(buckets.reduce((n, b) => n + b.count, 0)).toBe(4);
  const badBy = await req("GET", "/api/sync_sessions/stats?by=__nope__");
  expect(badBy.status).toBe(400);

  const stale = await req("PATCH", `/api/sync_sessions/${created.id}?if_match=9999`, { readings_count: 1 });
  expect(stale.status).toBe(409);
  const fresh = await req("GET", `/api/sync_sessions/${created.id}`);
  const version = Number((fresh.headers.get("etag") ?? "").replace(/[^0-9]/g, ""));
  expect(version).toBeGreaterThan(0);
  const won = await req("PATCH", `/api/sync_sessions/${created.id}?if_match=${version}`, { readings_count: 1 });
  expect(won.status).toBe(200);

  const del = await req("DELETE", `/api/sync_sessions/${created.id}`);
  expect(del.status).toBe(200);
  const delMissing = await req("DELETE", `/api/sync_sessions/${created.id}`);
  expect(delMissing.status).toBe(404);
});
