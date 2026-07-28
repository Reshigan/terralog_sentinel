// GENERATED from the manifest. Do not edit.
import { expect, test } from "bun:test";
import { makeEnv, request, signUp } from "./harness";
import type { Audit_log } from "../src/types";

test("audit_log: anonymous callers are refused", async () => {
  const env = makeEnv();
  const anon = await request(env, "GET", "/api/audit_logs");
  expect(anon.status).toBe(401);
});

test("audit_log: one workspace never sees another's rows", async () => {
  const env = makeEnv();
  const a = await signUp(env, "a@test.local");
  const b = await signUp(env, "b@test.local");
  const made = await request(env, "POST", "/api/audit_logs", { entity_type: "sample", entity_id: 1, action: "create", performed_by: "sample", performed_at: "2026-01-15", metadata: "sample", ip_address: "sample", user_agent: "sample", changes: "sample", session_id: "sample" }, a);
  expect(made.status).toBe(200);
  const mine = await request(env, "GET", "/api/audit_logs", undefined, a);
  expect(((await mine.json()) as Audit_log[]).length).toBe(1);
  const theirs = await request(env, "GET", "/api/audit_logs", undefined, b);
  expect(((await theirs.json()) as Audit_log[]).length).toBe(0);
});

test("audit_log: empty, create, then list reflects it", async () => {
  const env = makeEnv();
  const cookie = await signUp(env);
  const req = (method: string, path: string, body?: unknown) => request(env, method, path, body, cookie);
  const empty = await req("GET", "/api/audit_logs");
  expect(empty.status).toBe(200);
  expect((await empty.json()) as Audit_log[]).toEqual([]);

  const res = await req("POST", "/api/audit_logs", { entity_type: "sample", entity_id: 1, action: "create", performed_by: "sample", performed_at: "2026-01-15", metadata: "sample", ip_address: "sample", user_agent: "sample", changes: "sample", session_id: "sample" });
  expect(res.status).toBe(200);
  const created = (await res.json()) as Audit_log;
  expect(created.entity_type).toBe("sample");

  const list = await req("GET", "/api/audit_logs");
  expect(((await list.json()) as Audit_log[]).length).toBe(1);

  const missing = await req("POST", "/api/audit_logs", { entity_id: 1, action: "create", performed_by: "sample", performed_at: "2026-01-15", metadata: "sample", ip_address: "sample", user_agent: "sample", changes: "sample", session_id: "sample" });
  expect(missing.status).toBe(400);

  const badEnum = await req("POST", "/api/audit_logs", { ...{ entity_type: "sample", entity_id: 1, action: "create", performed_by: "sample", performed_at: "2026-01-15", metadata: "sample", ip_address: "sample", user_agent: "sample", changes: "sample", session_id: "sample" }, action: "__not_a_state__" });
  expect(badEnum.status).toBe(400);

  const patched = await req("PATCH", `/api/audit_logs/${created.id}`, { entity_type: "patched" });
  expect(patched.status).toBe(200);
  const after = (await patched.json()) as Audit_log;
  expect(after.entity_type).toBe("patched");
  expect(after.entity_id).toBe(1);

  const idem1 = await req("POST", "/api/audit_logs?idempotency_key=retry-1", { entity_type: "sample", entity_id: 1, action: "create", performed_by: "sample", performed_at: "2026-01-15", metadata: "sample", ip_address: "sample", user_agent: "sample", changes: "sample", session_id: "sample" });
  const idem2 = await req("POST", "/api/audit_logs?idempotency_key=retry-1", { entity_type: "sample", entity_id: 1, action: "create", performed_by: "sample", performed_at: "2026-01-15", metadata: "sample", ip_address: "sample", user_agent: "sample", changes: "sample", session_id: "sample" });
  expect(idem2.status).toBe(200);
  expect(((await idem2.json()) as Audit_log).id).toBe(((await idem1.json()) as Audit_log).id);

  const bulk = await req("POST", "/api/audit_logs/bulk", { rows: [{ entity_type: "sample", entity_id: 1, action: "create", performed_by: "sample", performed_at: "2026-01-15", metadata: "sample", ip_address: "sample", user_agent: "sample", changes: "sample", session_id: "sample" }, { entity_type: "sample", entity_id: 1, action: "create", performed_by: "sample", performed_at: "2026-01-15", metadata: "sample", ip_address: "sample", user_agent: "sample", changes: "sample", session_id: "sample" }] });
  expect(bulk.status).toBe(200);
  expect(((await bulk.json()) as { created: number }).created).toBe(2);
  const bulkBad = await req("POST", "/api/audit_logs/bulk", { rows: [{ entity_id: 1, action: "create", performed_by: "sample", performed_at: "2026-01-15", metadata: "sample", ip_address: "sample", user_agent: "sample", changes: "sample", session_id: "sample" }] });
  expect(bulkBad.status).toBe(400);

  const stats = await req("GET", "/api/audit_logs/stats");
  expect(stats.status).toBe(200);
  const buckets = (await stats.json()) as { key: unknown; count: number }[];
  expect(buckets.reduce((n, b) => n + b.count, 0)).toBe(4);
  const badBy = await req("GET", "/api/audit_logs/stats?by=__nope__");
  expect(badBy.status).toBe(400);

  const stale = await req("PATCH", `/api/audit_logs/${created.id}?if_match=9999`, { entity_type: "sample" });
  expect(stale.status).toBe(409);
  const fresh = await req("GET", `/api/audit_logs/${created.id}`);
  const version = Number((fresh.headers.get("etag") ?? "").replace(/[^0-9]/g, ""));
  expect(version).toBeGreaterThan(0);
  const won = await req("PATCH", `/api/audit_logs/${created.id}?if_match=${version}`, { entity_type: "sample" });
  expect(won.status).toBe(200);
});
