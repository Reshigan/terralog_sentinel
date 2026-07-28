// GENERATED from the manifest. Do not edit.
import { expect, test } from "bun:test";
import { makeEnv, request, signUp } from "./harness";
import type { Equipment } from "../src/types";

test("equipment: anonymous callers are refused", async () => {
  const env = makeEnv();
  const anon = await request(env, "GET", "/api/equipments");
  expect(anon.status).toBe(401);
});

test("equipment: one workspace never sees another's rows", async () => {
  const env = makeEnv();
  const a = await signUp(env, "a@test.local");
  const b = await signUp(env, "b@test.local");
  const made = await request(env, "POST", "/api/equipments", { serial_number: "sample", type: "sensor", installation_date: "2026-01-15", last_calibration: "2026-01-15", site_id: 1, status: "active", warranty_expiry: "2026-01-15" }, a);
  expect(made.status).toBe(200);
  const mine = await request(env, "GET", "/api/equipments", undefined, a);
  expect(((await mine.json()) as Equipment[]).length).toBe(1);
  const theirs = await request(env, "GET", "/api/equipments", undefined, b);
  expect(((await theirs.json()) as Equipment[]).length).toBe(0);
});

test("equipment: empty, create, then list reflects it", async () => {
  const env = makeEnv();
  const cookie = await signUp(env);
  const req = (method: string, path: string, body?: unknown) => request(env, method, path, body, cookie);
  const empty = await req("GET", "/api/equipments");
  expect(empty.status).toBe(200);
  expect((await empty.json()) as Equipment[]).toEqual([]);

  const res = await req("POST", "/api/equipments", { serial_number: "sample", type: "sensor", installation_date: "2026-01-15", last_calibration: "2026-01-15", site_id: 1, status: "active", warranty_expiry: "2026-01-15" });
  expect(res.status).toBe(200);
  const created = (await res.json()) as Equipment;
  expect(created.serial_number).toBe("sample");

  const list = await req("GET", "/api/equipments");
  expect(((await list.json()) as Equipment[]).length).toBe(1);

  const missing = await req("POST", "/api/equipments", { type: "sensor", installation_date: "2026-01-15", last_calibration: "2026-01-15", site_id: 1, status: "active", warranty_expiry: "2026-01-15" });
  expect(missing.status).toBe(400);

  const badEnum = await req("POST", "/api/equipments", { ...{ serial_number: "sample", type: "sensor", installation_date: "2026-01-15", last_calibration: "2026-01-15", site_id: 1, status: "active", warranty_expiry: "2026-01-15" }, type: "__not_a_state__" });
  expect(badEnum.status).toBe(400);

  const patched = await req("PATCH", `/api/equipments/${created.id}`, { serial_number: "patched" });
  expect(patched.status).toBe(200);
  const after = (await patched.json()) as Equipment;
  expect(after.serial_number).toBe("patched");
  expect(after.type).toBe("sensor");

  const wfOk = await req("PATCH", `/api/equipments/${created.id}`, { status: "maintenance" });
  expect(wfOk.status).toBe(200);
  expect(((await wfOk.json()) as Equipment).status).toBe("maintenance");

  const idem1 = await req("POST", "/api/equipments?idempotency_key=retry-1", { serial_number: "sample", type: "sensor", installation_date: "2026-01-15", last_calibration: "2026-01-15", site_id: 1, status: "active", warranty_expiry: "2026-01-15" });
  const idem2 = await req("POST", "/api/equipments?idempotency_key=retry-1", { serial_number: "sample", type: "sensor", installation_date: "2026-01-15", last_calibration: "2026-01-15", site_id: 1, status: "active", warranty_expiry: "2026-01-15" });
  expect(idem2.status).toBe(200);
  expect(((await idem2.json()) as Equipment).id).toBe(((await idem1.json()) as Equipment).id);

  const bulk = await req("POST", "/api/equipments/bulk", { rows: [{ serial_number: "sample", type: "sensor", installation_date: "2026-01-15", last_calibration: "2026-01-15", site_id: 1, status: "active", warranty_expiry: "2026-01-15" }, { serial_number: "sample", type: "sensor", installation_date: "2026-01-15", last_calibration: "2026-01-15", site_id: 1, status: "active", warranty_expiry: "2026-01-15" }] });
  expect(bulk.status).toBe(200);
  expect(((await bulk.json()) as { created: number }).created).toBe(2);
  const bulkBad = await req("POST", "/api/equipments/bulk", { rows: [{ type: "sensor", installation_date: "2026-01-15", last_calibration: "2026-01-15", site_id: 1, status: "active", warranty_expiry: "2026-01-15" }] });
  expect(bulkBad.status).toBe(400);

  const stats = await req("GET", "/api/equipments/stats");
  expect(stats.status).toBe(200);
  const buckets = (await stats.json()) as { key: unknown; count: number }[];
  expect(buckets.reduce((n, b) => n + b.count, 0)).toBe(4);
  const badBy = await req("GET", "/api/equipments/stats?by=__nope__");
  expect(badBy.status).toBe(400);

  const stale = await req("PATCH", `/api/equipments/${created.id}?if_match=9999`, { serial_number: "sample" });
  expect(stale.status).toBe(409);
  const fresh = await req("GET", `/api/equipments/${created.id}`);
  const version = Number((fresh.headers.get("etag") ?? "").replace(/[^0-9]/g, ""));
  expect(version).toBeGreaterThan(0);
  const won = await req("PATCH", `/api/equipments/${created.id}?if_match=${version}`, { serial_number: "sample" });
  expect(won.status).toBe(200);

  const del = await req("DELETE", `/api/equipments/${created.id}`);
  expect(del.status).toBe(200);
  const delMissing = await req("DELETE", `/api/equipments/${created.id}`);
  expect(delMissing.status).toBe(404);
});
