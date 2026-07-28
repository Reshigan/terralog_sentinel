// GENERATED from the manifest. Do not edit.
import { expect, test } from "bun:test";
import { makeEnv, request, signUp } from "./harness";
import type { Passphrase } from "../src/types";

test("passphrase: anonymous callers are refused", async () => {
  const env = makeEnv();
  const anon = await request(env, "GET", "/api/passphrases");
  expect(anon.status).toBe(401);
});

test("passphrase: one workspace never sees another's rows", async () => {
  const env = makeEnv();
  const a = await signUp(env, "a@test.local");
  const b = await signUp(env, "b@test.local");
  const made = await request(env, "POST", "/api/passphrases", { hash: "sample", salt: "sample", is_set: 1, set_at: "2026-01-15", device_id: 1, failed_attempts: 1 }, a);
  expect(made.status).toBe(200);
  const mine = await request(env, "GET", "/api/passphrases", undefined, a);
  expect(((await mine.json()) as Passphrase[]).length).toBe(1);
  const theirs = await request(env, "GET", "/api/passphrases", undefined, b);
  expect(((await theirs.json()) as Passphrase[]).length).toBe(0);
});

test("passphrase: empty, create, then list reflects it", async () => {
  const env = makeEnv();
  const cookie = await signUp(env);
  const req = (method: string, path: string, body?: unknown) => request(env, method, path, body, cookie);
  const empty = await req("GET", "/api/passphrases");
  expect(empty.status).toBe(200);
  expect((await empty.json()) as Passphrase[]).toEqual([]);

  const res = await req("POST", "/api/passphrases", { hash: "sample", salt: "sample", is_set: 1, set_at: "2026-01-15", device_id: 1, failed_attempts: 1 });
  expect(res.status).toBe(200);
  const created = (await res.json()) as Passphrase;
  expect(created.hash).toBe("sample");

  const list = await req("GET", "/api/passphrases");
  expect(((await list.json()) as Passphrase[]).length).toBe(1);

  const missing = await req("POST", "/api/passphrases", { salt: "sample", is_set: 1, set_at: "2026-01-15", device_id: 1, failed_attempts: 1 });
  expect(missing.status).toBe(400);

  const patched = await req("PATCH", `/api/passphrases/${created.id}`, { hash: "patched" });
  expect(patched.status).toBe(200);
  const after = (await patched.json()) as Passphrase;
  expect(after.hash).toBe("patched");
  expect(after.salt).toBe("sample");

  const idem1 = await req("POST", "/api/passphrases?idempotency_key=retry-1", { hash: "sample", salt: "sample", is_set: 1, set_at: "2026-01-15", device_id: 1, failed_attempts: 1 });
  const idem2 = await req("POST", "/api/passphrases?idempotency_key=retry-1", { hash: "sample", salt: "sample", is_set: 1, set_at: "2026-01-15", device_id: 1, failed_attempts: 1 });
  expect(idem2.status).toBe(200);
  expect(((await idem2.json()) as Passphrase).id).toBe(((await idem1.json()) as Passphrase).id);

  const bulk = await req("POST", "/api/passphrases/bulk", { rows: [{ hash: "sample", salt: "sample", is_set: 1, set_at: "2026-01-15", device_id: 1, failed_attempts: 1 }, { hash: "sample", salt: "sample", is_set: 1, set_at: "2026-01-15", device_id: 1, failed_attempts: 1 }] });
  expect(bulk.status).toBe(200);
  expect(((await bulk.json()) as { created: number }).created).toBe(2);
  const bulkBad = await req("POST", "/api/passphrases/bulk", { rows: [{ salt: "sample", is_set: 1, set_at: "2026-01-15", device_id: 1, failed_attempts: 1 }] });
  expect(bulkBad.status).toBe(400);

  const stats = await req("GET", "/api/passphrases/stats");
  expect(stats.status).toBe(200);
  const buckets = (await stats.json()) as { key: unknown; count: number }[];
  expect(buckets.reduce((n, b) => n + b.count, 0)).toBe(4);
  const badBy = await req("GET", "/api/passphrases/stats?by=__nope__");
  expect(badBy.status).toBe(400);

  const stale = await req("PATCH", `/api/passphrases/${created.id}?if_match=9999`, { hash: "sample" });
  expect(stale.status).toBe(409);
  const fresh = await req("GET", `/api/passphrases/${created.id}`);
  const version = Number((fresh.headers.get("etag") ?? "").replace(/[^0-9]/g, ""));
  expect(version).toBeGreaterThan(0);
  const won = await req("PATCH", `/api/passphrases/${created.id}?if_match=${version}`, { hash: "sample" });
  expect(won.status).toBe(200);

  const del = await req("DELETE", `/api/passphrases/${created.id}`);
  expect(del.status).toBe(200);
  const delMissing = await req("DELETE", `/api/passphrases/${created.id}`);
  expect(delMissing.status).toBe(404);
});
