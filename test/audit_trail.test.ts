// GENERATED from the manifest. Do not edit.
import { expect, test } from "bun:test";
import { makeEnv, request, signUp } from "./harness";
import type { Audit_trail } from "../src/types";

test("audit_trail: anonymous callers are refused", async () => {
  const env = makeEnv();
  const anon = await request(env, "GET", "/api/audit_trails");
  expect(anon.status).toBe(401);
});

test("audit_trail: one workspace never sees another's rows", async () => {
  const env = makeEnv();
  const a = await signUp(env, "a@test.local");
  const b = await signUp(env, "b@test.local");
  const made = await request(env, "POST", "/api/audit_trails", { entity_type: "sample", entity_id: 1, action: "create", performed_at: "2026-01-15", performed_by: "sample", metadata: "sample", device_id: 1 }, a);
  expect(made.status).toBe(200);
  const mine = await request(env, "GET", "/api/audit_trails", undefined, a);
  expect(((await mine.json()) as Audit_trail[]).length).toBe(1);
  const theirs = await request(env, "GET", "/api/audit_trails", undefined, b);
  expect(((await theirs.json()) as Audit_trail[]).length).toBe(0);
});

test("audit_trail: empty, create, then list reflects it", async () => {
  const env = makeEnv();
  const cookie = await signUp(env);
  const req = (method: string, path: string, body?: unknown) => request(env, method, path, body, cookie);
  const empty = await req("GET", "/api/audit_trails");
  expect(empty.status).toBe(200);
  expect((await empty.json()) as Audit_trail[]).toEqual([]);

  const res = await req("POST", "/api/audit_trails", { entity_type: "sample", entity_id: 1, action: "create", performed_at: "2026-01-15", performed_by: "sample", metadata: "sample", device_id: 1 });
  expect(res.status).toBe(200);
  const created = (await res.json()) as Audit_trail;
  expect(created.entity_type).toBe("sample");

  const list = await req("GET", "/api/audit_trails");
  expect(((await list.json()) as Audit_trail[]).length).toBe(1);

  const missing = await req("POST", "/api/audit_trails", { entity_id: 1, action: "create", performed_at: "2026-01-15", performed_by: "sample", metadata: "sample", device_id: 1 });
  expect(missing.status).toBe(400);

  const badEnum = await req("POST", "/api/audit_trails", { ...{ entity_type: "sample", entity_id: 1, action: "create", performed_at: "2026-01-15", performed_by: "sample", metadata: "sample", device_id: 1 }, action: "__not_a_state__" });
  expect(badEnum.status).toBe(400);

  const patched = await req("PATCH", `/api/audit_trails/${created.id}`, { entity_type: "patched" });
  expect(patched.status).toBe(200);
  const after = (await patched.json()) as Audit_trail;
  expect(after.entity_type).toBe("patched");
  expect(after.entity_id).toBe(1);

  const idem1 = await req("POST", "/api/audit_trails?idempotency_key=retry-1", { entity_type: "sample", entity_id: 1, action: "create", performed_at: "2026-01-15", performed_by: "sample", metadata: "sample", device_id: 1 });
  const idem2 = await req("POST", "/api/audit_trails?idempotency_key=retry-1", { entity_type: "sample", entity_id: 1, action: "create", performed_at: "2026-01-15", performed_by: "sample", metadata: "sample", device_id: 1 });
  expect(idem2.status).toBe(200);
  expect(((await idem2.json()) as Audit_trail).id).toBe(((await idem1.json()) as Audit_trail).id);

  const bulk = await req("POST", "/api/audit_trails/bulk", { rows: [{ entity_type: "sample", entity_id: 1, action: "create", performed_at: "2026-01-15", performed_by: "sample", metadata: "sample", device_id: 1 }, { entity_type: "sample", entity_id: 1, action: "create", performed_at: "2026-01-15", performed_by: "sample", metadata: "sample", device_id: 1 }] });
  expect(bulk.status).toBe(200);
  expect(((await bulk.json()) as { created: number }).created).toBe(2);
  const bulkBad = await req("POST", "/api/audit_trails/bulk", { rows: [{ entity_id: 1, action: "create", performed_at: "2026-01-15", performed_by: "sample", metadata: "sample", device_id: 1 }] });
  expect(bulkBad.status).toBe(400);

  const stats = await req("GET", "/api/audit_trails/stats");
  expect(stats.status).toBe(200);
  const buckets = (await stats.json()) as { key: unknown; count: number }[];
  expect(buckets.reduce((n, b) => n + b.count, 0)).toBe(4);
  const badBy = await req("GET", "/api/audit_trails/stats?by=__nope__");
  expect(badBy.status).toBe(400);

  const stale = await req("PATCH", `/api/audit_trails/${created.id}?if_match=9999`, { entity_type: "sample" });
  expect(stale.status).toBe(409);
  const fresh = await req("GET", `/api/audit_trails/${created.id}`);
  const version = Number((fresh.headers.get("etag") ?? "").replace(/[^0-9]/g, ""));
  expect(version).toBeGreaterThan(0);
  const won = await req("PATCH", `/api/audit_trails/${created.id}?if_match=${version}`, { entity_type: "sample" });
  expect(won.status).toBe(200);
});
