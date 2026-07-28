// GENERATED from the manifest. Do not edit.
import { expect, test } from "bun:test";
import { makeEnv, request, signUp } from "./harness";
import type { Site_visit } from "../src/types";

test("site_visit: anonymous callers are refused", async () => {
  const env = makeEnv();
  const anon = await request(env, "GET", "/api/site_visits");
  expect(anon.status).toBe(401);
});

test("site_visit: one workspace never sees another's rows", async () => {
  const env = makeEnv();
  const a = await signUp(env, "a@test.local");
  const b = await signUp(env, "b@test.local");
  const made = await request(env, "POST", "/api/site_visits", { site_id: 1, visit_date: "2026-01-15", purpose: "inspection", notes: "sample", technician_email: "sample", status: "planned", equipment_id: 1 }, a);
  expect(made.status).toBe(200);
  const mine = await request(env, "GET", "/api/site_visits", undefined, a);
  expect(((await mine.json()) as Site_visit[]).length).toBe(1);
  const theirs = await request(env, "GET", "/api/site_visits", undefined, b);
  expect(((await theirs.json()) as Site_visit[]).length).toBe(0);
});

test("site_visit: empty, create, then list reflects it", async () => {
  const env = makeEnv();
  const cookie = await signUp(env);
  const req = (method: string, path: string, body?: unknown) => request(env, method, path, body, cookie);
  const empty = await req("GET", "/api/site_visits");
  expect(empty.status).toBe(200);
  expect((await empty.json()) as Site_visit[]).toEqual([]);

  const res = await req("POST", "/api/site_visits", { site_id: 1, visit_date: "2026-01-15", purpose: "inspection", notes: "sample", technician_email: "sample", status: "planned", equipment_id: 1 });
  expect(res.status).toBe(200);
  const created = (await res.json()) as Site_visit;
  expect(created.notes).toBe("sample");

  const list = await req("GET", "/api/site_visits");
  expect(((await list.json()) as Site_visit[]).length).toBe(1);

  const missing = await req("POST", "/api/site_visits", { visit_date: "2026-01-15", purpose: "inspection", notes: "sample", technician_email: "sample", status: "planned", equipment_id: 1 });
  expect(missing.status).toBe(400);

  const badEnum = await req("POST", "/api/site_visits", { ...{ site_id: 1, visit_date: "2026-01-15", purpose: "inspection", notes: "sample", technician_email: "sample", status: "planned", equipment_id: 1 }, purpose: "__not_a_state__" });
  expect(badEnum.status).toBe(400);

  const patched = await req("PATCH", `/api/site_visits/${created.id}`, { notes: "patched" });
  expect(patched.status).toBe(200);
  const after = (await patched.json()) as Site_visit;
  expect(after.notes).toBe("patched");
  expect(after.site_id).toBe(1);

  const wfOk = await req("PATCH", `/api/site_visits/${created.id}`, { status: "completed" });
  expect(wfOk.status).toBe(200);
  expect(((await wfOk.json()) as Site_visit).status).toBe("completed");

  const idem1 = await req("POST", "/api/site_visits?idempotency_key=retry-1", { site_id: 1, visit_date: "2026-01-15", purpose: "inspection", notes: "sample", technician_email: "sample", status: "planned", equipment_id: 1 });
  const idem2 = await req("POST", "/api/site_visits?idempotency_key=retry-1", { site_id: 1, visit_date: "2026-01-15", purpose: "inspection", notes: "sample", technician_email: "sample", status: "planned", equipment_id: 1 });
  expect(idem2.status).toBe(200);
  expect(((await idem2.json()) as Site_visit).id).toBe(((await idem1.json()) as Site_visit).id);

  const bulk = await req("POST", "/api/site_visits/bulk", { rows: [{ site_id: 1, visit_date: "2026-01-15", purpose: "inspection", notes: "sample", technician_email: "sample", status: "planned", equipment_id: 1 }, { site_id: 1, visit_date: "2026-01-15", purpose: "inspection", notes: "sample", technician_email: "sample", status: "planned", equipment_id: 1 }] });
  expect(bulk.status).toBe(200);
  expect(((await bulk.json()) as { created: number }).created).toBe(2);
  const bulkBad = await req("POST", "/api/site_visits/bulk", { rows: [{ visit_date: "2026-01-15", purpose: "inspection", notes: "sample", technician_email: "sample", status: "planned", equipment_id: 1 }] });
  expect(bulkBad.status).toBe(400);

  const stats = await req("GET", "/api/site_visits/stats");
  expect(stats.status).toBe(200);
  const buckets = (await stats.json()) as { key: unknown; count: number }[];
  expect(buckets.reduce((n, b) => n + b.count, 0)).toBe(4);
  const badBy = await req("GET", "/api/site_visits/stats?by=__nope__");
  expect(badBy.status).toBe(400);

  const stale = await req("PATCH", `/api/site_visits/${created.id}?if_match=9999`, { site_id: 1 });
  expect(stale.status).toBe(409);
  const fresh = await req("GET", `/api/site_visits/${created.id}`);
  const version = Number((fresh.headers.get("etag") ?? "").replace(/[^0-9]/g, ""));
  expect(version).toBeGreaterThan(0);
  const won = await req("PATCH", `/api/site_visits/${created.id}?if_match=${version}`, { site_id: 1 });
  expect(won.status).toBe(200);

  const del = await req("DELETE", `/api/site_visits/${created.id}`);
  expect(del.status).toBe(200);
  const delMissing = await req("DELETE", `/api/site_visits/${created.id}`);
  expect(delMissing.status).toBe(404);
});
