// GENERATED from the manifest. Do not edit.
import { expect, test } from "bun:test";
import { makeEnv, request, signUp } from "./harness";
import type { Technician } from "../src/types";

test("technician: anonymous callers are refused", async () => {
  const env = makeEnv();
  const anon = await request(env, "GET", "/api/technicians");
  expect(anon.status).toBe(401);
});

test("technician: one workspace never sees another's rows", async () => {
  const env = makeEnv();
  const a = await signUp(env, "a@test.local");
  const b = await signUp(env, "b@test.local");
  const made = await request(env, "POST", "/api/technicians", { name: "sample", email: "sample", device_id: "sample", last_active: "2026-01-15", is_active: 1, status: "active", hire_date: "2026-01-15", supervisor_id: 1, certification_level: "trainee", phone_number: "sample", emergency_contact: "sample" }, a);
  expect(made.status).toBe(200);
  const mine = await request(env, "GET", "/api/technicians", undefined, a);
  expect(((await mine.json()) as Technician[]).length).toBe(1);
  const theirs = await request(env, "GET", "/api/technicians", undefined, b);
  expect(((await theirs.json()) as Technician[]).length).toBe(0);
});

test("technician: empty, create, then list reflects it", async () => {
  const env = makeEnv();
  const cookie = await signUp(env);
  const req = (method: string, path: string, body?: unknown) => request(env, method, path, body, cookie);
  const empty = await req("GET", "/api/technicians");
  expect(empty.status).toBe(200);
  expect((await empty.json()) as Technician[]).toEqual([]);

  const res = await req("POST", "/api/technicians", { name: "sample", email: "sample", device_id: "sample", last_active: "2026-01-15", is_active: 1, status: "active", hire_date: "2026-01-15", supervisor_id: 1, certification_level: "trainee", phone_number: "sample", emergency_contact: "sample" });
  expect(res.status).toBe(200);
  const created = (await res.json()) as Technician;
  expect(created.name).toBe("sample");

  const list = await req("GET", "/api/technicians");
  expect(((await list.json()) as Technician[]).length).toBe(1);

  const missing = await req("POST", "/api/technicians", { email: "sample", device_id: "sample", last_active: "2026-01-15", is_active: 1, status: "active", hire_date: "2026-01-15", supervisor_id: 1, certification_level: "trainee", phone_number: "sample", emergency_contact: "sample" });
  expect(missing.status).toBe(400);

  const badEnum = await req("POST", "/api/technicians", { ...{ name: "sample", email: "sample", device_id: "sample", last_active: "2026-01-15", is_active: 1, status: "active", hire_date: "2026-01-15", supervisor_id: 1, certification_level: "trainee", phone_number: "sample", emergency_contact: "sample" }, status: "__not_a_state__" });
  expect(badEnum.status).toBe(400);

  const patched = await req("PATCH", `/api/technicians/${created.id}`, { name: "patched" });
  expect(patched.status).toBe(200);
  const after = (await patched.json()) as Technician;
  expect(after.name).toBe("patched");
  expect(after.email).toBe("sample");

  const wfOk = await req("PATCH", `/api/technicians/${created.id}`, { status: "on_leave" });
  expect(wfOk.status).toBe(200);
  expect(((await wfOk.json()) as Technician).status).toBe("on_leave");

  const idem1 = await req("POST", "/api/technicians?idempotency_key=retry-1", { name: "sample", email: "sample", device_id: "sample", last_active: "2026-01-15", is_active: 1, status: "active", hire_date: "2026-01-15", supervisor_id: 1, certification_level: "trainee", phone_number: "sample", emergency_contact: "sample" });
  const idem2 = await req("POST", "/api/technicians?idempotency_key=retry-1", { name: "sample", email: "sample", device_id: "sample", last_active: "2026-01-15", is_active: 1, status: "active", hire_date: "2026-01-15", supervisor_id: 1, certification_level: "trainee", phone_number: "sample", emergency_contact: "sample" });
  expect(idem2.status).toBe(200);
  expect(((await idem2.json()) as Technician).id).toBe(((await idem1.json()) as Technician).id);

  const bulk = await req("POST", "/api/technicians/bulk", { rows: [{ name: "sample", email: "sample", device_id: "sample", last_active: "2026-01-15", is_active: 1, status: "active", hire_date: "2026-01-15", supervisor_id: 1, certification_level: "trainee", phone_number: "sample", emergency_contact: "sample" }, { name: "sample", email: "sample", device_id: "sample", last_active: "2026-01-15", is_active: 1, status: "active", hire_date: "2026-01-15", supervisor_id: 1, certification_level: "trainee", phone_number: "sample", emergency_contact: "sample" }] });
  expect(bulk.status).toBe(200);
  expect(((await bulk.json()) as { created: number }).created).toBe(2);
  const bulkBad = await req("POST", "/api/technicians/bulk", { rows: [{ email: "sample", device_id: "sample", last_active: "2026-01-15", is_active: 1, status: "active", hire_date: "2026-01-15", supervisor_id: 1, certification_level: "trainee", phone_number: "sample", emergency_contact: "sample" }] });
  expect(bulkBad.status).toBe(400);

  const stats = await req("GET", "/api/technicians/stats");
  expect(stats.status).toBe(200);
  const buckets = (await stats.json()) as { key: unknown; count: number }[];
  expect(buckets.reduce((n, b) => n + b.count, 0)).toBe(4);
  const badBy = await req("GET", "/api/technicians/stats?by=__nope__");
  expect(badBy.status).toBe(400);

  const stale = await req("PATCH", `/api/technicians/${created.id}?if_match=9999`, { name: "sample" });
  expect(stale.status).toBe(409);
  const fresh = await req("GET", `/api/technicians/${created.id}`);
  const version = Number((fresh.headers.get("etag") ?? "").replace(/[^0-9]/g, ""));
  expect(version).toBeGreaterThan(0);
  const won = await req("PATCH", `/api/technicians/${created.id}?if_match=${version}`, { name: "sample" });
  expect(won.status).toBe(200);

  const del = await req("DELETE", `/api/technicians/${created.id}`);
  expect(del.status).toBe(200);
  const delMissing = await req("DELETE", `/api/technicians/${created.id}`);
  expect(delMissing.status).toBe(404);
});
