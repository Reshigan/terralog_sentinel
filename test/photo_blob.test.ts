// GENERATED from the manifest. Do not edit.
import { expect, test } from "bun:test";
import { makeEnv, request, signUp } from "./harness";
import type { Photo_blob } from "../src/types";

test("photo_blob: anonymous callers are refused", async () => {
  const env = makeEnv();
  const anon = await request(env, "GET", "/api/photo_blobs");
  expect(anon.status).toBe(401);
});

test("photo_blob: one workspace never sees another's rows", async () => {
  const env = makeEnv();
  const a = await signUp(env, "a@test.local");
  const b = await signUp(env, "b@test.local");
  const made = await request(env, "POST", "/api/photo_blobs", { blob_id: "sample", reading_id: 1, uploaded_at: "2026-01-15", size_bytes: 1, mime_type: "sample", storage_path: "sample", checksum: "sample", is_encrypted: 1, encryption_key_id: 1, thumbnail_blob_id: "sample" }, a);
  expect(made.status).toBe(200);
  const mine = await request(env, "GET", "/api/photo_blobs", undefined, a);
  expect(((await mine.json()) as Photo_blob[]).length).toBe(1);
  const theirs = await request(env, "GET", "/api/photo_blobs", undefined, b);
  expect(((await theirs.json()) as Photo_blob[]).length).toBe(0);
});

test("photo_blob: empty, create, then list reflects it", async () => {
  const env = makeEnv();
  const cookie = await signUp(env);
  const req = (method: string, path: string, body?: unknown) => request(env, method, path, body, cookie);
  const empty = await req("GET", "/api/photo_blobs");
  expect(empty.status).toBe(200);
  expect((await empty.json()) as Photo_blob[]).toEqual([]);

  const res = await req("POST", "/api/photo_blobs", { blob_id: "sample", reading_id: 1, uploaded_at: "2026-01-15", size_bytes: 1, mime_type: "sample", storage_path: "sample", checksum: "sample", is_encrypted: 1, encryption_key_id: 1, thumbnail_blob_id: "sample" });
  expect(res.status).toBe(200);
  const created = (await res.json()) as Photo_blob;
  expect(created.blob_id).toBe("sample");

  const list = await req("GET", "/api/photo_blobs");
  expect(((await list.json()) as Photo_blob[]).length).toBe(1);

  const missing = await req("POST", "/api/photo_blobs", { reading_id: 1, uploaded_at: "2026-01-15", size_bytes: 1, mime_type: "sample", storage_path: "sample", checksum: "sample", is_encrypted: 1, encryption_key_id: 1, thumbnail_blob_id: "sample" });
  expect(missing.status).toBe(400);

  const patched = await req("PATCH", `/api/photo_blobs/${created.id}`, { blob_id: "patched" });
  expect(patched.status).toBe(200);
  const after = (await patched.json()) as Photo_blob;
  expect(after.blob_id).toBe("patched");
  expect(after.reading_id).toBe(1);

  const idem1 = await req("POST", "/api/photo_blobs?idempotency_key=retry-1", { blob_id: "sample", reading_id: 1, uploaded_at: "2026-01-15", size_bytes: 1, mime_type: "sample", storage_path: "sample", checksum: "sample", is_encrypted: 1, encryption_key_id: 1, thumbnail_blob_id: "sample" });
  const idem2 = await req("POST", "/api/photo_blobs?idempotency_key=retry-1", { blob_id: "sample", reading_id: 1, uploaded_at: "2026-01-15", size_bytes: 1, mime_type: "sample", storage_path: "sample", checksum: "sample", is_encrypted: 1, encryption_key_id: 1, thumbnail_blob_id: "sample" });
  expect(idem2.status).toBe(200);
  expect(((await idem2.json()) as Photo_blob).id).toBe(((await idem1.json()) as Photo_blob).id);

  const bulk = await req("POST", "/api/photo_blobs/bulk", { rows: [{ blob_id: "sample", reading_id: 1, uploaded_at: "2026-01-15", size_bytes: 1, mime_type: "sample", storage_path: "sample", checksum: "sample", is_encrypted: 1, encryption_key_id: 1, thumbnail_blob_id: "sample" }, { blob_id: "sample", reading_id: 1, uploaded_at: "2026-01-15", size_bytes: 1, mime_type: "sample", storage_path: "sample", checksum: "sample", is_encrypted: 1, encryption_key_id: 1, thumbnail_blob_id: "sample" }] });
  expect(bulk.status).toBe(200);
  expect(((await bulk.json()) as { created: number }).created).toBe(2);
  const bulkBad = await req("POST", "/api/photo_blobs/bulk", { rows: [{ reading_id: 1, uploaded_at: "2026-01-15", size_bytes: 1, mime_type: "sample", storage_path: "sample", checksum: "sample", is_encrypted: 1, encryption_key_id: 1, thumbnail_blob_id: "sample" }] });
  expect(bulkBad.status).toBe(400);

  const stats = await req("GET", "/api/photo_blobs/stats");
  expect(stats.status).toBe(200);
  const buckets = (await stats.json()) as { key: unknown; count: number }[];
  expect(buckets.reduce((n, b) => n + b.count, 0)).toBe(4);
  const badBy = await req("GET", "/api/photo_blobs/stats?by=__nope__");
  expect(badBy.status).toBe(400);

  const stale = await req("PATCH", `/api/photo_blobs/${created.id}?if_match=9999`, { blob_id: "sample" });
  expect(stale.status).toBe(409);
  const fresh = await req("GET", `/api/photo_blobs/${created.id}`);
  const version = Number((fresh.headers.get("etag") ?? "").replace(/[^0-9]/g, ""));
  expect(version).toBeGreaterThan(0);
  const won = await req("PATCH", `/api/photo_blobs/${created.id}?if_match=${version}`, { blob_id: "sample" });
  expect(won.status).toBe(200);

  const del = await req("DELETE", `/api/photo_blobs/${created.id}`);
  expect(del.status).toBe(200);
  const delMissing = await req("DELETE", `/api/photo_blobs/${created.id}`);
  expect(delMissing.status).toBe(404);
});
