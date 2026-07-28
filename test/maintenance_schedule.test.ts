// GENERATED from the manifest. Do not edit.
import { expect, test } from "bun:test";
import { makeEnv, request, signUp } from "./harness";
import type { Maintenance_schedule } from "../src/types";

test("maintenance_schedule: anonymous callers are refused", async () => {
  const env = makeEnv();
  const anon = await request(env, "GET", "/api/maintenance_schedules");
  expect(anon.status).toBe(401);
});

test("maintenance_schedule: one workspace never sees another's rows", async () => {
  const env = makeEnv();
  const a = await signUp(env, "a@test.local");
  const b = await signUp(env, "b@test.local");
  const made = await request(env, "POST", "/api/maintenance_schedules", { site_id: 1, scheduled_date: "2026-01-15", description: "sample", status: "planned", technician_id: 1, completed_at: "2026-01-15", priority: "low", estimated_duration_hours: 1, actual_duration_hours: 1, notes: "sample" }, a);
  expect(made.status).toBe(200);
  const mine = await request(env, "GET", "/api/maintenance_schedules", undefined, a);
  expect(((await mine.json()) as Maintenance_schedule[]).length).toBe(1);
  const theirs = await request(env, "GET", "/api/maintenance_schedules", undefined, b);
  expect(((await theirs.json()) as Maintenance_schedule[]).length).toBe(0);
});

test("maintenance_schedule: empty, create, then list reflects it", async () => {
  const env = makeEnv();
  const cookie = await signUp(env);
  const req = (method: string, path: string, body?: unknown) => request(env, method, path, body, cookie);
  const empty = await req("GET", "/api/maintenance_schedules");
  expect(empty.status).toBe(200);
  expect((await empty.json()) as Maintenance_schedule[]).toEqual([]);

  const res = await req("POST", "/api/maintenance_schedules", { site_id: 1, scheduled_date: "2026-01-15", description: "sample", status: "planned", technician_id: 1, completed_at: "2026-01-15", priority: "low", estimated_duration_hours: 1, actual_duration_hours: 1, notes: "sample" });
  expect(res.status).toBe(200);
  const created = (await res.json()) as Maintenance_schedule;
  expect(created.description).toBe("sample");

  const list = await req("GET", "/api/maintenance_schedules");
  expect(((await list.json()) as Maintenance_schedule[]).length).toBe(1);

  const missing = await req("POST", "/api/maintenance_schedules", { scheduled_date: "2026-01-15", description: "sample", status: "planned", technician_id: 1, completed_at: "2026-01-15", priority: "low", estimated_duration_hours: 1, actual_duration_hours: 1, notes: "sample" });
  expect(missing.status).toBe(400);

  const badEnum = await req("POST", "/api/maintenance_schedules", { ...{ site_id: 1, scheduled_date: "2026-01-15", description: "sample", status: "planned", technician_id: 1, completed_at: "2026-01-15", priority: "low", estimated_duration_hours: 1, actual_duration_hours: 1, notes: "sample" }, status: "__not_a_state__" });
  expect(badEnum.status).toBe(400);

  const patched = await req("PATCH", `/api/maintenance_schedules/${created.id}`, { description: "patched" });
  expect(patched.status).toBe(200);
  const after = (await patched.json()) as Maintenance_schedule;
  expect(after.description).toBe("patched");
  expect(after.site_id).toBe(1);

  const wfBad = await req("PATCH", `/api/maintenance_schedules/${created.id}`, { status: "completed" });
  expect(wfBad.status).toBe(409);

  const wfOk = await req("PATCH", `/api/maintenance_schedules/${created.id}`, { status: "in_progress" });
  expect(wfOk.status).toBe(200);
  expect(((await wfOk.json()) as Maintenance_schedule).status).toBe("in_progress");

  const idem1 = await req("POST", "/api/maintenance_schedules?idempotency_key=retry-1", { site_id: 1, scheduled_date: "2026-01-15", description: "sample", status: "planned", technician_id: 1, completed_at: "2026-01-15", priority: "low", estimated_duration_hours: 1, actual_duration_hours: 1, notes: "sample" });
  const idem2 = await req("POST", "/api/maintenance_schedules?idempotency_key=retry-1", { site_id: 1, scheduled_date: "2026-01-15", description: "sample", status: "planned", technician_id: 1, completed_at: "2026-01-15", priority: "low", estimated_duration_hours: 1, actual_duration_hours: 1, notes: "sample" });
  expect(idem2.status).toBe(200);
  expect(((await idem2.json()) as Maintenance_schedule).id).toBe(((await idem1.json()) as Maintenance_schedule).id);

  const bulk = await req("POST", "/api/maintenance_schedules/bulk", { rows: [{ site_id: 1, scheduled_date: "2026-01-15", description: "sample", status: "planned", technician_id: 1, completed_at: "2026-01-15", priority: "low", estimated_duration_hours: 1, actual_duration_hours: 1, notes: "sample" }, { site_id: 1, scheduled_date: "2026-01-15", description: "sample", status: "planned", technician_id: 1, completed_at: "2026-01-15", priority: "low", estimated_duration_hours: 1, actual_duration_hours: 1, notes: "sample" }] });
  expect(bulk.status).toBe(200);
  expect(((await bulk.json()) as { created: number }).created).toBe(2);
  const bulkBad = await req("POST", "/api/maintenance_schedules/bulk", { rows: [{ scheduled_date: "2026-01-15", description: "sample", status: "planned", technician_id: 1, completed_at: "2026-01-15", priority: "low", estimated_duration_hours: 1, actual_duration_hours: 1, notes: "sample" }] });
  expect(bulkBad.status).toBe(400);

  const stats = await req("GET", "/api/maintenance_schedules/stats");
  expect(stats.status).toBe(200);
  const buckets = (await stats.json()) as { key: unknown; count: number }[];
  expect(buckets.reduce((n, b) => n + b.count, 0)).toBe(4);
  const badBy = await req("GET", "/api/maintenance_schedules/stats?by=__nope__");
  expect(badBy.status).toBe(400);

  const stale = await req("PATCH", `/api/maintenance_schedules/${created.id}?if_match=9999`, { site_id: 1 });
  expect(stale.status).toBe(409);
  const fresh = await req("GET", `/api/maintenance_schedules/${created.id}`);
  const version = Number((fresh.headers.get("etag") ?? "").replace(/[^0-9]/g, ""));
  expect(version).toBeGreaterThan(0);
  const won = await req("PATCH", `/api/maintenance_schedules/${created.id}?if_match=${version}`, { site_id: 1 });
  expect(won.status).toBe(200);

  const del = await req("DELETE", `/api/maintenance_schedules/${created.id}`);
  expect(del.status).toBe(200);
  const delMissing = await req("DELETE", `/api/maintenance_schedules/${created.id}`);
  expect(delMissing.status).toBe(404);
});
