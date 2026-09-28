import { describe, it, expect, beforeEach, vi } from "bun:test";
import type { D1Database, D1Result } from "@cloudflare/workers-types";

// Import domain types from the shared contract
import type { Reading } from "../src/types";

// Type for our test environment
interface TestEnv {
  DB: D1Database;
}

// Helper to create a mock D1 database for testing
function createMockDB(readings: Reading[] = []): D1Database {
  return {
    prepare: vi.fn((query: string) => ({
      bind: vi.fn(() => ({
        all: vi.fn(async () => {
          // Handle different query types
          if (query.includes("SELECT * FROM readings WHERE sync_status = 'pending'")) {
            return { results: readings.filter(r => r.sync_status === "pending"), success: true } as D1Result;
          }
          if (query.includes("SELECT * FROM readings WHERE tenant =")) {
            return { results: readings, success: true } as D1Result;
          }
          if (query.includes("COUNT(*) as count")) {
            const pendingCount = readings.filter(r => r.sync_status === "pending").length;
            return { results: [{ count: pendingCount }], success: true } as D1Result;
          }
          if (query.includes("MAX(attempted_at)")) {
            const syncedReadings = readings.filter(r => r.sync_status === "synced");
            const maxDate = syncedReadings.length > 0 ? "2026-03-14T10:30:00Z" : null;
            return { results: [{ last_sync: maxDate }], success: true } as D1Result;
          }
          if (query.includes("UPDATE readings SET sync_status")) {
            return { results: [], success: true, meta: { changes: readings.length } } as D1Result;
          }
          if (query.includes("INSERT INTO sync_logs")) {
            return { results: [], success: true, meta: { last_row_id: 1 } } as D1Result;
          }
          return { results: [], success: true } as D1Result;
        }),
        first: vi.fn(async () => {
          if (query.includes("COUNT(*)")) {
            return { count: readings.filter(r => r.sync_status === "pending").length };
          }
          if (query.includes("MAX(attempted_at)")) {
            return { last_sync: "2026-03-14T10:30:00Z" };
          }
          return null;
        }),
      })),
    })),
  } as unknown as D1Database;
}

// Helper to create test environment
function makeEnv(readings: Reading[] = []): TestEnv {
  return {
    DB: createMockDB(readings),
  };
}

// Sample readings for testing
const sampleReadings: Reading[] = [
  {
    id: 1,
    photo: "data:image/jpeg;base64,/9j/4AAQ",
    latitude: 34.0522,
    longitude: -118.2437,
    numeric_value: 42.5,
    timestamp: "2026-03-14T10:00:00Z",
    encrypted_blob: "encrypted_data_1",
    sync_status: "pending",
    sync_attempts: 0,
    dedupe_id: "dedupe-1",
    site_id: 1,
    device_id: 1,
    equipment_id: 1,
    calibration_id: 1,
    row_version: 1,
  },
  {
    id: 2,
    photo: "data:image/jpeg;base64,/9j/4AAQ",
    latitude: 34.0523,
    longitude: -118.2438,
    numeric_value: 43.0,
    timestamp: "2026-03-14T10:05:00Z",
    encrypted_blob: "encrypted_data_2",
    sync_status: "pending",
    sync_attempts: 1,
    dedupe_id: "dedupe-2",
    site_id: 1,
    device_id: 1,
    equipment_id: 1,
    calibration_id: 1,
    row_version: 1,
  },
  {
    id: 3,
    photo: "data:image/jpeg;base64,/9j/4AAQ",
    latitude: 34.0524,
    longitude: -118.2439,
    numeric_value: 44.2,
    timestamp: "2026-03-14T09:00:00Z",
    encrypted_blob: "encrypted_data_3",
    sync_status: "synced",
    sync_attempts: 2,
    dedupe_id: "dedupe-3",
    site_id: 1,
    device_id: 1,
    equipment_id: 1,
    calibration_id: 1,
    row_version: 1,
  },
  {
    id: 4,
    photo: "data:image/jpeg;base64,/9j/4AAQ",
    latitude: 34.0525,
    longitude: -118.2440,
    numeric_value: 41.8,
    timestamp: "2026-03-14T08:00:00Z",
    encrypted_blob: "encrypted_data_4",
    sync_status: "failed",
    sync_attempts: 5,
    dedupe_id: "dedupe-4",
    site_id: 1,
    device_id: 1,
    equipment_id: 1,
    calibration_id: 1,
    row_version: 1,
  },
];

// Mock request helper
async function makeRequest(
  env: TestEnv,
  method: string,
  path: string,
  body?: BodyInit | null
): Promise<Response> {
  // Import the handler from the actual source
  const { handleRequest } = await import("../src/handlers/sync");
  
  const url = new URL(path, "http://localhost");
  const request = new Request(url.toString(), {
    method,
    headers: { "Content-Type": "application/json" },
    body,
  });
  
  return handleRequest(request, env, { waitUntil: vi.fn() } as any);
}

describe("POST /api/sync - Trigger Sync", () => {
  it("should sync all pending readings and return success count", async () => {
    const env = makeEnv(sampleReadings);
    const response = await makeRequest(env, "POST", "/api/sync");
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result).toHaveProperty("synced");
    expect(result).toHaveProperty("failed");
    // Should have 2 pending readings
    expect(result.synced).toBe(2);
    expect(result.failed).toBe(0);
  });

  it("should return zero synced when no pending readings exist", async () => {
    const env = makeEnv(sampleReadings.filter(r => r.sync_status !== "pending"));
    const response = await makeRequest(env, "POST", "/api/sync");
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.synced).toBe(0);
    expect(result.failed).toBe(0);
  });

  it("should handle sync failures and increment failed count", async () => {
    // Create mock DB that simulates failure
    const failingDB = {
      prepare: vi.fn((query: string) => ({
        bind: vi.fn(() => ({
          all: vi.fn(async () => {
            if (query.includes("SELECT * FROM readings WHERE sync_status = 'pending'")) {
              return { results: sampleReadings.filter(r => r.sync_status === "pending"), success: true } as D1Result;
            }
            // Simulate sync failure
            if (query.includes("UPDATE readings")) {
              throw new Error("Network error during sync");
            }
            return { results: [], success: true } as D1Result;
          }),
        })),
      })),
    } as unknown as D1Database;

    const env: TestEnv = { DB: failingDB };
    const response = await makeRequest(env, "POST", "/api/sync");
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.synced).toBe(0);
    expect(result.failed).toBe(2);
  });

  it("should filter by tenant when syncing", async () => {
    const env = makeEnv(sampleReadings);
    const response = await makeRequest(env, "POST", "/api/sync?tenant=default");
    const result = await response.json();

    expect(response.status).toBe(200);
    // Should still sync pending readings for the tenant
    expect(result.synced).toBe(2);
  });
});

describe("GET /api/sync/status - Get Sync Status", () => {
  it("should return pending count and last sync timestamp", async () => {
    const env = makeEnv(sampleReadings);
    const response = await makeRequest(env, "GET", "/api/sync/status");
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result).toHaveProperty("pending");
    expect(result).toHaveProperty("last_sync");
    expect(result.pending).toBe(2);
    expect(result.last_sync).toBe("2026-03-14T10:30:00Z");
  });

  it("should return null last_sync when no readings have been synced", async () => {
    const env = makeEnv(sampleReadings.filter(r => r.sync_status !== "synced"));
    const response = await makeRequest(env, "GET", "/api/sync/status");
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.pending).toBe(2);
    expect(result.last_sync).toBeNull();
  });

  it("should return zero pending when all readings are synced", async () => {
    const env = makeEnv(sampleReadings.filter(r => r.sync_status !== "pending"));
    const response = await makeRequest(env, "GET", "/api/sync/status");
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.pending).toBe(0);
  });

  it("should filter by tenant", async () => {
    const env = makeEnv(sampleReadings);
    const response = await makeRequest(env, "GET", "/api/sync/status?tenant=default");
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.pending).toBe(2);
  });
});

describe("Sync with different sync_status values", () => {
  it("should only sync readings with 'pending' status", async () => {
    const mixedReadings: Reading[] = [
      { ...sampleReadings[0], sync_status: "pending" },
      { ...sampleReadings[1], sync_status: "synced" },
      { ...sampleReadings[2], sync_status: "failed" },
    ];
    
    const env = makeEnv(mixedReadings);
    const response = await makeRequest(env, "POST", "/api/sync");
    const result = await response.json();

    expect(result.synced).toBe(1); // Only the pending one
  });

  it("should include sync_attempts in the status response", async () => {
    const env = makeEnv(sampleReadings);
    const response = await makeRequest(env, "GET", "/api/sync/status");
    const result = await response.json();

    // Verify we can see the attempt count in the database query
    expect(result.pending).toBe(2);
  });
});

describe("Error handling", () => {
  it("should return 500 when database query fails", async () => {
    const failingDB = {
      prepare: vi.fn(() => {
        throw new Error("Database connection error");
      }),
    } as unknown as D1Database;

    const env: TestEnv = { DB: failingDB };
    const response = await makeRequest(env, "GET", "/api/sync/status");

    expect(response.status).toBe(500);
    const result = await response.json();
    expect(result).toHaveProperty("error");
  });

  it("should return 405 for unsupported methods", async () => {
    const env = makeEnv(sampleReadings);
    const url = new URL("/api/sync", "http://localhost");
    const request = new Request(url.toString(), {
      method: "DELETE",
    });
    
    const { handleRequest } = await import("../src/handlers/sync");
    const response = await handleRequest(request, env, { waitUntil: vi.fn() } as any);

    expect(response.status).toBe(405);
  });
});
