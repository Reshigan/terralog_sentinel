// GENERATED from the manifest. Do not edit.
import { expect, test } from "bun:test";
import { makeEnv, request, signUp } from "./harness";
import type { Permission } from "../src/types";

test("permission: anonymous callers are refused", async () => {
  const env = makeEnv();
  const anon = await request(env, "GET", "/api/permissions");
  expect(anon.status).toBe(401);
});

test("permission: one workspace never sees another's rows", async () => {
  const env = makeEnv();
  const a = await signUp(env, "a@test.local");
  const b = await signUp(env, "b@test.local");
  const made = await request(env, "POST", "/api/permissions", { technician_id: 1, site_id: 1, can_read: 1, can_write: 1, can_erase: 1, is_active: 1, granted_by: "sample", granted_at: "2026-01-15", expires_at: "2026-01-15", notes: "sample" }, a);
  expect(made.status).toBe(200);
  const mine = await request(env, "GET", "/api/permissions", undefined, a);
  expect(((await mine.json()) as Permission[]).length).toBe(1);
  const theirs = await request(env, "GET", "/api/permissions", undefined, b);
  expect(((await theirs.json()) as Permission[]).length).toBe(0);
});

test("permission: empty, create, then list reflects it", async () => {
  const env = makeEnv();
  const cookie = await signUp(env);
  const req = (method: string, path: string, body?: unknown) => request(env, method, path, body, cookie);
  const empty = await req("GET", "/api/permissions");
  expect(empty.status).toBe(200);
  expect((await empty.json()) as Permission[]).toEqual([]);

  const res = await req("POST", "/api/permissions", { technician_id: 1, site_id: 1, can_read: 1, can_write: 1, can_erase: 1, is_active: 1, granted_by: "sample", granted_at: "2026-01-15", expires_at: "2026-01-15", notes: "sample" });
  expect(res.status).toBe(200);
  const created = (await res.json()) as Permission;
  expect(created.granted_by).toBe("sample");

  const list = await req("GET", "/api/permissions");
  expect(((await list.json()) as Permission[]).length).toBe(1);

  const missing = await req("POST", "/api/permissions", { site_id: 1, can_read: 1, can_write: 1, can_erase: 1, is_active: 1, granted_by: "sample", granted_at: "2026-01-15", expires_at: "2026-01-15", notes: "sample" });
  expect(missing.status).toBe(400);

  const patched = await req("PATCH", `/api/permissions/${created.id}`, { granted_by: "patched" });
  expect(patched.status).toBe(200);
  const after = (await patched.json()) as Permission;
  expect(after.granted_by).toBe("patched");
  expect(after.technician_id).toBe(1);

  const idem1 = await req("POST", "/api/permissions?idempotency_key=retry-1", { technician_id: 1, site_id: 1, can_read: 1, can_write: 1, can_erase: 1, is_active: 1, granted_by: "sample", granted_at: "2026-01-15", expires_at: "2026-01-15", notes: "sample" });
  const idem2 = await req("POST", "/api/permissions?idempotency_key=retry-1", { technician_id: 1, site_id: 1, can_read: 1, can_write: 1, can_erase: 1, is_active: 1, granted_by: "sample", granted_at: "2026-01-15", expires_at: "2026-01-15", notes: "sample" });
  expect(idem2.status).toBe(200);
  expect(((await idem2.json()) as Permission).id).toBe(((await idem1.json()) as Permission).id);

  const bulk = await req("POST", "/api/permissions/bulk", { rows: [{ technician_id: 1, site_id: 1, can_read: 1, can_write: 1, can_erase: 1, is_active: 1, granted_by: "sample", granted_at: "2026-01-15", expires_at: "2026-01-15", notes: "sample" }, { technician_id: 1, site_id: 1, can_read: 1, can_write: 1, can_erase: 1, is_active: 1, granted_by: "sample", granted_at: "2026-01-15", expires_at: "2026-01-15", notes: "sample" }] });
  expect(bulk.status).toBe(200);
  expect(((await bulk.json()) as { created: number }).created).toBe(2);
  const bulkBad = await req("POST", "/api/permissions/bulk", { rows: [{ site_id: 1, can_read: 1, can_write: 1, can_erase: 1, is_active: 1, granted_by: "sample", granted_at: "2026-01-15", expires_at: "2026-01-15", notes: "sample" }] });
  expect(bulkBad.status).toBe(400);

  const stats = await req("GET", "/api/permissions/stats");
  expect(stats.status).toBe(200);
  const buckets = (await stats.json()) as { key: unknown; count: number }[];
  expect(buckets.reduce((n, b) => n + b.count, 0)).toBe(4);
  const badBy = await req("GET", "/api/permissions/stats?by=__nope__");
  expect(badBy.status).toBe(400);

  const stale = await req("PATCH", `/api/permissions/${created.id}?if_match=9999`, { technician_id: 1 });
  expect(stale.status).toBe(409);
  const fresh = await req("GET", `/api/permissions/${created.id}`);
  const version = Number((fresh.headers.get("etag") ?? "").replace(/[^0-9]/g, ""));
  expect(version).toBeGreaterThan(0);
  const won = await req("PATCH", `/api/permissions/${created.id}?if_match=${version}`, { technician_id: 1 });
  expect(won.status).toBe(200);

  const del = await req("DELETE", `/api/permissions/${created.id}`);
  expect(del.status).toBe(200);
  const delMissing = await req("DELETE", `/api/permissions/${created.id}`);
  expect(delMissing.status).toBe(404);
});
