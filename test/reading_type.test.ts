// GENERATED from the manifest. Do not edit.
import { expect, test } from "bun:test";
import { makeEnv, request, signUp } from "./harness";
import type { Reading_type } from "../src/types";

test("reading_type: anonymous callers are refused", async () => {
  const env = makeEnv();
  const anon = await request(env, "GET", "/api/reading_types");
  expect(anon.status).toBe(401);
});

test("reading_type: one workspace never sees another's rows", async () => {
  const env = makeEnv();
  const a = await signUp(env, "a@test.local");
  const b = await signUp(env, "b@test.local");
  const made = await request(env, "POST", "/api/reading_types", { name: "sample", unit: "sample", description: "sample", min_value: 1.5, max_value: 1.5, is_active: 1, category: "pressure", expected_frequency_hours: 1, critical_threshold: 1.5, warning_threshold: 1.5 }, a);
  expect(made.status).toBe(200);
  const mine = await request(env, "GET", "/api/reading_types", undefined, a);
  expect(((await mine.json()) as Reading_type[]).length).toBe(1);
  const theirs = await request(env, "GET", "/api/reading_types", undefined, b);
  expect(((await theirs.json()) as Reading_type[]).length).toBe(0);
});

test("reading_type: empty, create, then list reflects it", async () => {
  const env = makeEnv();
  const cookie = await signUp(env);
  const req = (method: string, path: string, body?: unknown) => request(env, method, path, body, cookie);
  const empty = await req("GET", "/api/reading_types");
  expect(empty.status).toBe(200);
  expect((await empty.json()) as Reading_type[]).toEqual([]);

  const res = await req("POST", "/api/reading_types", { name: "sample", unit: "sample", description: "sample", min_value: 1.5, max_value: 1.5, is_active: 1, category: "pressure", expected_frequency_hours: 1, critical_threshold: 1.5, warning_threshold: 1.5 });
  expect(res.status).toBe(200);
  const created = (await res.json()) as Reading_type;
  expect(created.name).toBe("sample");

  const list = await req("GET", "/api/reading_types");
  expect(((await list.json()) as Reading_type[]).length).toBe(1);

  const missing = await req("POST", "/api/reading_types", { unit: "sample", description: "sample", min_value: 1.5, max_value: 1.5, is_active: 1, category: "pressure", expected_frequency_hours: 1, critical_threshold: 1.5, warning_threshold: 1.5 });
  expect(missing.status).toBe(400);

  const badEnum = await req("POST", "/api/reading_types", { ...{ name: "sample", unit: "sample", description: "sample", min_value: 1.5, max_value: 1.5, is_active: 1, category: "pressure", expected_frequency_hours: 1, critical_threshold: 1.5, warning_threshold: 1.5 }, category: "__not_a_state__" });
  expect(badEnum.status).toBe(400);

  const patched = await req("PATCH", `/api/reading_types/${created.id}`, { name: "patched" });
  expect(patched.status).toBe(200);
  const after = (await patched.json()) as Reading_type;
  expect(after.name).toBe("patched");
  expect(after.unit).toBe("sample");

  const idem1 = await req("POST", "/api/reading_types?idempotency_key=retry-1", { name: "sample", unit: "sample", description: "sample", min_value: 1.5, max_value: 1.5, is_active: 1, category: "pressure", expected_frequency_hours: 1, critical_threshold: 1.5, warning_threshold: 1.5 });
  const idem2 = await req("POST", "/api/reading_types?idempotency_key=retry-1", { name: "sample", unit: "sample", description: "sample", min_value: 1.5, max_value: 1.5, is_active: 1, category: "pressure", expected_frequency_hours: 1, critical_threshold: 1.5, warning_threshold: 1.5 });
  expect(idem2.status).toBe(200);
  expect(((await idem2.json()) as Reading_type).id).toBe(((await idem1.json()) as Reading_type).id);

  const bulk = await req("POST", "/api/reading_types/bulk", { rows: [{ name: "sample", unit: "sample", description: "sample", min_value: 1.5, max_value: 1.5, is_active: 1, category: "pressure", expected_frequency_hours: 1, critical_threshold: 1.5, warning_threshold: 1.5 }, { name: "sample", unit: "sample", description: "sample", min_value: 1.5, max_value: 1.5, is_active: 1, category: "pressure", expected_frequency_hours: 1, critical_threshold: 1.5, warning_threshold: 1.5 }] });
  expect(bulk.status).toBe(200);
  expect(((await bulk.json()) as { created: number }).created).toBe(2);
  const bulkBad = await req("POST", "/api/reading_types/bulk", { rows: [{ unit: "sample", description: "sample", min_value: 1.5, max_value: 1.5, is_active: 1, category: "pressure", expected_frequency_hours: 1, critical_threshold: 1.5, warning_threshold: 1.5 }] });
  expect(bulkBad.status).toBe(400);

  const stats = await req("GET", "/api/reading_types/stats");
  expect(stats.status).toBe(200);
  const buckets = (await stats.json()) as { key: unknown; count: number }[];
  expect(buckets.reduce((n, b) => n + b.count, 0)).toBe(4);
  const badBy = await req("GET", "/api/reading_types/stats?by=__nope__");
  expect(badBy.status).toBe(400);

  const stale = await req("PATCH", `/api/reading_types/${created.id}?if_match=9999`, { name: "sample" });
  expect(stale.status).toBe(409);
  const fresh = await req("GET", `/api/reading_types/${created.id}`);
  const version = Number((fresh.headers.get("etag") ?? "").replace(/[^0-9]/g, ""));
  expect(version).toBeGreaterThan(0);
  const won = await req("PATCH", `/api/reading_types/${created.id}?if_match=${version}`, { name: "sample" });
  expect(won.status).toBe(200);

  const del = await req("DELETE", `/api/reading_types/${created.id}`);
  expect(del.status).toBe(200);
  const delMissing = await req("DELETE", `/api/reading_types/${created.id}`);
  expect(delMissing.status).toBe(404);
});
