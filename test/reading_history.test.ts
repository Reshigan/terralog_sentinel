// GENERATED from the manifest. Do not edit.
import { expect, test } from "bun:test";
import { makeEnv, request, signUp } from "./harness";
import type { Reading_history } from "../src/types";

test("reading_history: anonymous callers are refused", async () => {
  const env = makeEnv();
  const anon = await request(env, "GET", "/api/reading_historys");
  expect(anon.status).toBe(401);
});

test("reading_history: one workspace never sees another's rows", async () => {
  const env = makeEnv();
  const a = await signUp(env, "a@test.local");
  const b = await signUp(env, "b@test.local");
  const made = await request(env, "POST", "/api/reading_historys", { reading_id: 1, changed_field: "sample", old_value: "sample", new_value: "sample", changed_at: "2026-01-15", changed_by: "sample", revision_id: 1 }, a);
  expect(made.status).toBe(200);
  const mine = await request(env, "GET", "/api/reading_historys", undefined, a);
  expect(((await mine.json()) as Reading_history[]).length).toBe(1);
  const theirs = await request(env, "GET", "/api/reading_historys", undefined, b);
  expect(((await theirs.json()) as Reading_history[]).length).toBe(0);
});

test("reading_history: empty, create, then list reflects it", async () => {
  const env = makeEnv();
  const cookie = await signUp(env);
  const req = (method: string, path: string, body?: unknown) => request(env, method, path, body, cookie);
  const empty = await req("GET", "/api/reading_historys");
  expect(empty.status).toBe(200);
  expect((await empty.json()) as Reading_history[]).toEqual([]);

  const res = await req("POST", "/api/reading_historys", { reading_id: 1, changed_field: "sample", old_value: "sample", new_value: "sample", changed_at: "2026-01-15", changed_by: "sample", revision_id: 1 });
  expect(res.status).toBe(200);
  const created = (await res.json()) as Reading_history;
  expect(created.changed_field).toBe("sample");

  const list = await req("GET", "/api/reading_historys");
  expect(((await list.json()) as Reading_history[]).length).toBe(1);

  const missing = await req("POST", "/api/reading_historys", { changed_field: "sample", old_value: "sample", new_value: "sample", changed_at: "2026-01-15", changed_by: "sample", revision_id: 1 });
  expect(missing.status).toBe(400);

  const patched = await req("PATCH", `/api/reading_historys/${created.id}`, { changed_field: "patched" });
  expect(patched.status).toBe(200);
  const after = (await patched.json()) as Reading_history;
  expect(after.changed_field).toBe("patched");
  expect(after.reading_id).toBe(1);

  const idem1 = await req("POST", "/api/reading_historys?idempotency_key=retry-1", { reading_id: 1, changed_field: "sample", old_value: "sample", new_value: "sample", changed_at: "2026-01-15", changed_by: "sample", revision_id: 1 });
  const idem2 = await req("POST", "/api/reading_historys?idempotency_key=retry-1", { reading_id: 1, changed_field: "sample", old_value: "sample", new_value: "sample", changed_at: "2026-01-15", changed_by: "sample", revision_id: 1 });
  expect(idem2.status).toBe(200);
  expect(((await idem2.json()) as Reading_history).id).toBe(((await idem1.json()) as Reading_history).id);

  const bulk = await req("POST", "/api/reading_historys/bulk", { rows: [{ reading_id: 1, changed_field: "sample", old_value: "sample", new_value: "sample", changed_at: "2026-01-15", changed_by: "sample", revision_id: 1 }, { reading_id: 1, changed_field: "sample", old_value: "sample", new_value: "sample", changed_at: "2026-01-15", changed_by: "sample", revision_id: 1 }] });
  expect(bulk.status).toBe(200);
  expect(((await bulk.json()) as { created: number }).created).toBe(2);
  const bulkBad = await req("POST", "/api/reading_historys/bulk", { rows: [{ changed_field: "sample", old_value: "sample", new_value: "sample", changed_at: "2026-01-15", changed_by: "sample", revision_id: 1 }] });
  expect(bulkBad.status).toBe(400);

  const stats = await req("GET", "/api/reading_historys/stats");
  expect(stats.status).toBe(200);
  const buckets = (await stats.json()) as { key: unknown; count: number }[];
  expect(buckets.reduce((n, b) => n + b.count, 0)).toBe(4);
  const badBy = await req("GET", "/api/reading_historys/stats?by=__nope__");
  expect(badBy.status).toBe(400);

  const stale = await req("PATCH", `/api/reading_historys/${created.id}?if_match=9999`, { reading_id: 1 });
  expect(stale.status).toBe(409);
  const fresh = await req("GET", `/api/reading_historys/${created.id}`);
  const version = Number((fresh.headers.get("etag") ?? "").replace(/[^0-9]/g, ""));
  expect(version).toBeGreaterThan(0);
  const won = await req("PATCH", `/api/reading_historys/${created.id}?if_match=${version}`, { reading_id: 1 });
  expect(won.status).toBe(200);
});
