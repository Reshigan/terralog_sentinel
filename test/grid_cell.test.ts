// GENERATED from the manifest. Do not edit.
import { expect, test } from "bun:test";
import { makeEnv, request, signUp } from "./harness";
import type { Grid_cell } from "../src/types";

test("grid_cell: anonymous callers are refused", async () => {
  const env = makeEnv();
  const anon = await request(env, "GET", "/api/grid_cells");
  expect(anon.status).toBe(401);
});

test("grid_cell: one workspace never sees another's rows", async () => {
  const env = makeEnv();
  const a = await signUp(env, "a@test.local");
  const b = await signUp(env, "b@test.local");
  const made = await request(env, "POST", "/api/grid_cells", { grid_size_meters: 1, cell_hash: "sample", latitude_min: 1.5, latitude_max: 1.5, longitude_min: 1.5, longitude_max: 1.5, last_updated: "2026-01-15", site_id: 1, reading_count: 1, avg_value: 1.5 }, a);
  expect(made.status).toBe(200);
  const mine = await request(env, "GET", "/api/grid_cells", undefined, a);
  expect(((await mine.json()) as Grid_cell[]).length).toBe(1);
  const theirs = await request(env, "GET", "/api/grid_cells", undefined, b);
  expect(((await theirs.json()) as Grid_cell[]).length).toBe(0);
});

test("grid_cell: empty, create, then list reflects it", async () => {
  const env = makeEnv();
  const cookie = await signUp(env);
  const req = (method: string, path: string, body?: unknown) => request(env, method, path, body, cookie);
  const empty = await req("GET", "/api/grid_cells");
  expect(empty.status).toBe(200);
  expect((await empty.json()) as Grid_cell[]).toEqual([]);

  const res = await req("POST", "/api/grid_cells", { grid_size_meters: 1, cell_hash: "sample", latitude_min: 1.5, latitude_max: 1.5, longitude_min: 1.5, longitude_max: 1.5, last_updated: "2026-01-15", site_id: 1, reading_count: 1, avg_value: 1.5 });
  expect(res.status).toBe(200);
  const created = (await res.json()) as Grid_cell;
  expect(created.cell_hash).toBe("sample");

  const list = await req("GET", "/api/grid_cells");
  expect(((await list.json()) as Grid_cell[]).length).toBe(1);

  const missing = await req("POST", "/api/grid_cells", { cell_hash: "sample", latitude_min: 1.5, latitude_max: 1.5, longitude_min: 1.5, longitude_max: 1.5, last_updated: "2026-01-15", site_id: 1, reading_count: 1, avg_value: 1.5 });
  expect(missing.status).toBe(400);

  const patched = await req("PATCH", `/api/grid_cells/${created.id}`, { cell_hash: "patched" });
  expect(patched.status).toBe(200);
  const after = (await patched.json()) as Grid_cell;
  expect(after.cell_hash).toBe("patched");
  expect(after.grid_size_meters).toBe(1);

  const idem1 = await req("POST", "/api/grid_cells?idempotency_key=retry-1", { grid_size_meters: 1, cell_hash: "sample", latitude_min: 1.5, latitude_max: 1.5, longitude_min: 1.5, longitude_max: 1.5, last_updated: "2026-01-15", site_id: 1, reading_count: 1, avg_value: 1.5 });
  const idem2 = await req("POST", "/api/grid_cells?idempotency_key=retry-1", { grid_size_meters: 1, cell_hash: "sample", latitude_min: 1.5, latitude_max: 1.5, longitude_min: 1.5, longitude_max: 1.5, last_updated: "2026-01-15", site_id: 1, reading_count: 1, avg_value: 1.5 });
  expect(idem2.status).toBe(200);
  expect(((await idem2.json()) as Grid_cell).id).toBe(((await idem1.json()) as Grid_cell).id);

  const bulk = await req("POST", "/api/grid_cells/bulk", { rows: [{ grid_size_meters: 1, cell_hash: "sample", latitude_min: 1.5, latitude_max: 1.5, longitude_min: 1.5, longitude_max: 1.5, last_updated: "2026-01-15", site_id: 1, reading_count: 1, avg_value: 1.5 }, { grid_size_meters: 1, cell_hash: "sample", latitude_min: 1.5, latitude_max: 1.5, longitude_min: 1.5, longitude_max: 1.5, last_updated: "2026-01-15", site_id: 1, reading_count: 1, avg_value: 1.5 }] });
  expect(bulk.status).toBe(200);
  expect(((await bulk.json()) as { created: number }).created).toBe(2);
  const bulkBad = await req("POST", "/api/grid_cells/bulk", { rows: [{ cell_hash: "sample", latitude_min: 1.5, latitude_max: 1.5, longitude_min: 1.5, longitude_max: 1.5, last_updated: "2026-01-15", site_id: 1, reading_count: 1, avg_value: 1.5 }] });
  expect(bulkBad.status).toBe(400);

  const stats = await req("GET", "/api/grid_cells/stats");
  expect(stats.status).toBe(200);
  const buckets = (await stats.json()) as { key: unknown; count: number }[];
  expect(buckets.reduce((n, b) => n + b.count, 0)).toBe(4);
  const badBy = await req("GET", "/api/grid_cells/stats?by=__nope__");
  expect(badBy.status).toBe(400);

  const stale = await req("PATCH", `/api/grid_cells/${created.id}?if_match=9999`, { grid_size_meters: 1 });
  expect(stale.status).toBe(409);
  const fresh = await req("GET", `/api/grid_cells/${created.id}`);
  const version = Number((fresh.headers.get("etag") ?? "").replace(/[^0-9]/g, ""));
  expect(version).toBeGreaterThan(0);
  const won = await req("PATCH", `/api/grid_cells/${created.id}?if_match=${version}`, { grid_size_meters: 1 });
  expect(won.status).toBe(200);

  const del = await req("DELETE", `/api/grid_cells/${created.id}`);
  expect(del.status).toBe(200);
  const delMissing = await req("DELETE", `/api/grid_cells/${created.id}`);
  expect(delMissing.status).toBe(404);
});
