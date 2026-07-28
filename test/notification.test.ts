// GENERATED from the manifest. Do not edit.
import { expect, test } from "bun:test";
import { makeEnv, request, signUp } from "./harness";
import type { Notification } from "../src/types";

test("notification: anonymous callers are refused", async () => {
  const env = makeEnv();
  const anon = await request(env, "GET", "/api/notifications");
  expect(anon.status).toBe(401);
});

test("notification: one workspace never sees another's rows", async () => {
  const env = makeEnv();
  const a = await signUp(env, "a@test.local");
  const b = await signUp(env, "b@test.local");
  const made = await request(env, "POST", "/api/notifications", { recipient_email: "sample", type: "sync_failure", content: "sample", is_read: 1, created_at: "2026-01-15", related_entity_id: 1, related_entity_type: "reading" }, a);
  expect(made.status).toBe(200);
  const mine = await request(env, "GET", "/api/notifications", undefined, a);
  expect(((await mine.json()) as Notification[]).length).toBe(1);
  const theirs = await request(env, "GET", "/api/notifications", undefined, b);
  expect(((await theirs.json()) as Notification[]).length).toBe(0);
});

test("notification: empty, create, then list reflects it", async () => {
  const env = makeEnv();
  const cookie = await signUp(env);
  const req = (method: string, path: string, body?: unknown) => request(env, method, path, body, cookie);
  const empty = await req("GET", "/api/notifications");
  expect(empty.status).toBe(200);
  expect((await empty.json()) as Notification[]).toEqual([]);

  const res = await req("POST", "/api/notifications", { recipient_email: "sample", type: "sync_failure", content: "sample", is_read: 1, created_at: "2026-01-15", related_entity_id: 1, related_entity_type: "reading" });
  expect(res.status).toBe(200);
  const created = (await res.json()) as Notification;
  expect(created.recipient_email).toBe("sample");

  const list = await req("GET", "/api/notifications");
  expect(((await list.json()) as Notification[]).length).toBe(1);

  const missing = await req("POST", "/api/notifications", { type: "sync_failure", content: "sample", is_read: 1, created_at: "2026-01-15", related_entity_id: 1, related_entity_type: "reading" });
  expect(missing.status).toBe(400);

  const badEnum = await req("POST", "/api/notifications", { ...{ recipient_email: "sample", type: "sync_failure", content: "sample", is_read: 1, created_at: "2026-01-15", related_entity_id: 1, related_entity_type: "reading" }, type: "__not_a_state__" });
  expect(badEnum.status).toBe(400);

  const patched = await req("PATCH", `/api/notifications/${created.id}`, { recipient_email: "patched" });
  expect(patched.status).toBe(200);
  const after = (await patched.json()) as Notification;
  expect(after.recipient_email).toBe("patched");
  expect(after.type).toBe("sync_failure");

  const idem1 = await req("POST", "/api/notifications?idempotency_key=retry-1", { recipient_email: "sample", type: "sync_failure", content: "sample", is_read: 1, created_at: "2026-01-15", related_entity_id: 1, related_entity_type: "reading" });
  const idem2 = await req("POST", "/api/notifications?idempotency_key=retry-1", { recipient_email: "sample", type: "sync_failure", content: "sample", is_read: 1, created_at: "2026-01-15", related_entity_id: 1, related_entity_type: "reading" });
  expect(idem2.status).toBe(200);
  expect(((await idem2.json()) as Notification).id).toBe(((await idem1.json()) as Notification).id);

  const bulk = await req("POST", "/api/notifications/bulk", { rows: [{ recipient_email: "sample", type: "sync_failure", content: "sample", is_read: 1, created_at: "2026-01-15", related_entity_id: 1, related_entity_type: "reading" }, { recipient_email: "sample", type: "sync_failure", content: "sample", is_read: 1, created_at: "2026-01-15", related_entity_id: 1, related_entity_type: "reading" }] });
  expect(bulk.status).toBe(200);
  expect(((await bulk.json()) as { created: number }).created).toBe(2);
  const bulkBad = await req("POST", "/api/notifications/bulk", { rows: [{ type: "sync_failure", content: "sample", is_read: 1, created_at: "2026-01-15", related_entity_id: 1, related_entity_type: "reading" }] });
  expect(bulkBad.status).toBe(400);

  const stats = await req("GET", "/api/notifications/stats");
  expect(stats.status).toBe(200);
  const buckets = (await stats.json()) as { key: unknown; count: number }[];
  expect(buckets.reduce((n, b) => n + b.count, 0)).toBe(4);
  const badBy = await req("GET", "/api/notifications/stats?by=__nope__");
  expect(badBy.status).toBe(400);

  const stale = await req("PATCH", `/api/notifications/${created.id}?if_match=9999`, { recipient_email: "sample" });
  expect(stale.status).toBe(409);
  const fresh = await req("GET", `/api/notifications/${created.id}`);
  const version = Number((fresh.headers.get("etag") ?? "").replace(/[^0-9]/g, ""));
  expect(version).toBeGreaterThan(0);
  const won = await req("PATCH", `/api/notifications/${created.id}?if_match=${version}`, { recipient_email: "sample" });
  expect(won.status).toBe(200);

  const del = await req("DELETE", `/api/notifications/${created.id}`);
  expect(del.status).toBe(200);
  const delMissing = await req("DELETE", `/api/notifications/${created.id}`);
  expect(delMissing.status).toBe(404);
});
