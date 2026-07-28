// GENERATED from the manifest. Do not edit.
import { expect, test } from "bun:test";
import { makeEnv, request, signUp } from "./harness";
import type { Encryption_key } from "../src/types";

test("encryption_key: anonymous callers are refused", async () => {
  const env = makeEnv();
  const anon = await request(env, "GET", "/api/encryption_keys");
  expect(anon.status).toBe(401);
});

test("encryption_key: one workspace never sees another's rows", async () => {
  const env = makeEnv();
  const a = await signUp(env, "a@test.local");
  const b = await signUp(env, "b@test.local");
  const made = await request(env, "POST", "/api/encryption_keys", { salt: "sample", derived_at: "2026-01-15", device_fingerprint: "sample", is_active: 1, erased_at: "2026-01-15", device_id: 1, key_status: "active", passphrase_strength: 1, key_algorithm: "sample", key_iterations: 1 }, a);
  expect(made.status).toBe(200);
  const mine = await request(env, "GET", "/api/encryption_keys", undefined, a);
  expect(((await mine.json()) as Encryption_key[]).length).toBe(1);
  const theirs = await request(env, "GET", "/api/encryption_keys", undefined, b);
  expect(((await theirs.json()) as Encryption_key[]).length).toBe(0);
});

test("encryption_key: empty, create, then list reflects it", async () => {
  const env = makeEnv();
  const cookie = await signUp(env);
  const req = (method: string, path: string, body?: unknown) => request(env, method, path, body, cookie);
  const empty = await req("GET", "/api/encryption_keys");
  expect(empty.status).toBe(200);
  expect((await empty.json()) as Encryption_key[]).toEqual([]);

  const res = await req("POST", "/api/encryption_keys", { salt: "sample", derived_at: "2026-01-15", device_fingerprint: "sample", is_active: 1, erased_at: "2026-01-15", device_id: 1, key_status: "active", passphrase_strength: 1, key_algorithm: "sample", key_iterations: 1 });
  expect(res.status).toBe(200);
  const created = (await res.json()) as Encryption_key;
  expect(created.salt).toBe("sample");

  const list = await req("GET", "/api/encryption_keys");
  expect(((await list.json()) as Encryption_key[]).length).toBe(1);

  const missing = await req("POST", "/api/encryption_keys", { derived_at: "2026-01-15", device_fingerprint: "sample", is_active: 1, erased_at: "2026-01-15", device_id: 1, key_status: "active", passphrase_strength: 1, key_algorithm: "sample", key_iterations: 1 });
  expect(missing.status).toBe(400);

  const badEnum = await req("POST", "/api/encryption_keys", { ...{ salt: "sample", derived_at: "2026-01-15", device_fingerprint: "sample", is_active: 1, erased_at: "2026-01-15", device_id: 1, key_status: "active", passphrase_strength: 1, key_algorithm: "sample", key_iterations: 1 }, key_status: "__not_a_state__" });
  expect(badEnum.status).toBe(400);

  const patched = await req("PATCH", `/api/encryption_keys/${created.id}`, { salt: "patched" });
  expect(patched.status).toBe(200);
  const after = (await patched.json()) as Encryption_key;
  expect(after.salt).toBe("patched");
  expect(after.derived_at).toBe("2026-01-15");

  const wfOk = await req("PATCH", `/api/encryption_keys/${created.id}`, { key_status: "revoked" });
  expect(wfOk.status).toBe(200);
  expect(((await wfOk.json()) as Encryption_key).key_status).toBe("revoked");

  const idem1 = await req("POST", "/api/encryption_keys?idempotency_key=retry-1", { salt: "sample", derived_at: "2026-01-15", device_fingerprint: "sample", is_active: 1, erased_at: "2026-01-15", device_id: 1, key_status: "active", passphrase_strength: 1, key_algorithm: "sample", key_iterations: 1 });
  const idem2 = await req("POST", "/api/encryption_keys?idempotency_key=retry-1", { salt: "sample", derived_at: "2026-01-15", device_fingerprint: "sample", is_active: 1, erased_at: "2026-01-15", device_id: 1, key_status: "active", passphrase_strength: 1, key_algorithm: "sample", key_iterations: 1 });
  expect(idem2.status).toBe(200);
  expect(((await idem2.json()) as Encryption_key).id).toBe(((await idem1.json()) as Encryption_key).id);

  const bulk = await req("POST", "/api/encryption_keys/bulk", { rows: [{ salt: "sample", derived_at: "2026-01-15", device_fingerprint: "sample", is_active: 1, erased_at: "2026-01-15", device_id: 1, key_status: "active", passphrase_strength: 1, key_algorithm: "sample", key_iterations: 1 }, { salt: "sample", derived_at: "2026-01-15", device_fingerprint: "sample", is_active: 1, erased_at: "2026-01-15", device_id: 1, key_status: "active", passphrase_strength: 1, key_algorithm: "sample", key_iterations: 1 }] });
  expect(bulk.status).toBe(200);
  expect(((await bulk.json()) as { created: number }).created).toBe(2);
  const bulkBad = await req("POST", "/api/encryption_keys/bulk", { rows: [{ derived_at: "2026-01-15", device_fingerprint: "sample", is_active: 1, erased_at: "2026-01-15", device_id: 1, key_status: "active", passphrase_strength: 1, key_algorithm: "sample", key_iterations: 1 }] });
  expect(bulkBad.status).toBe(400);

  const stats = await req("GET", "/api/encryption_keys/stats");
  expect(stats.status).toBe(200);
  const buckets = (await stats.json()) as { key: unknown; count: number }[];
  expect(buckets.reduce((n, b) => n + b.count, 0)).toBe(4);
  const badBy = await req("GET", "/api/encryption_keys/stats?by=__nope__");
  expect(badBy.status).toBe(400);

  const stale = await req("PATCH", `/api/encryption_keys/${created.id}?if_match=9999`, { salt: "sample" });
  expect(stale.status).toBe(409);
  const fresh = await req("GET", `/api/encryption_keys/${created.id}`);
  const version = Number((fresh.headers.get("etag") ?? "").replace(/[^0-9]/g, ""));
  expect(version).toBeGreaterThan(0);
  const won = await req("PATCH", `/api/encryption_keys/${created.id}?if_match=${version}`, { salt: "sample" });
  expect(won.status).toBe(200);

  const del = await req("DELETE", `/api/encryption_keys/${created.id}`);
  expect(del.status).toBe(200);
  const delMissing = await req("DELETE", `/api/encryption_keys/${created.id}`);
  expect(delMissing.status).toBe(404);
});
