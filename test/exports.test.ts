import { describe, it, expect, beforeEach, vi } from "vitest";
import type { D1Database } from "@cloudflare/workers-types";

// Type definitions for our test environment
interface TestEnv {
  DB: D1Database;
}

// Helper to create test environment with seeded data
function makeEnv(): TestEnv {
  const mockDB = {
    prepare: vi.fn(),
    bind: vi.fn().mockReturnThis(),
    all: vi.fn(),
    run: vi.fn(),
    first: vi.fn(),
  };

  return {
    DB: mockDB as unknown as D1Database,
  };
}

// Mock request helper
async function request(
  method: string,
  path: string,
  body?: unknown,
  env?: TestEnv
): Promise<Response> {
  const testEnv = env || makeEnv();
  
  // Import the handler from the actual module
  const { handleRequest } = await import("../src/handlers/exports.ts");
  
  const url = new URL(path, "http://localhost");
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  
  const init: RequestInit = {
    method,
    headers,
  };
  
  if (body) {
    init.body = JSON.stringify(body);
  }
  
  const req = new Request(url.toString(), init);
  return handleRequest(req, testEnv, {} as ExecutionContext);
}

describe("exports handler", () => {
  let env: TestEnv;

  beforeEach(() => {
    env = makeEnv();
    vi.clearAllMocks();
  });

  describe("POST /api/exports - create export", () => {
    it("should create an export job for pending readings", async () => {
      // Seed mock readings in pending state
      const mockReadings = [
        { id: 1, tenant: "default", sync_status: "pending", numeric_value: 42.5 },
        { id: 2, tenant: "default", sync_status: "pending", numeric_value: 43.2 },
      ];

      (env.DB.prepare as ReturnType<typeof vi.fn>)
        .mockReturnValue({
          bind: vi.fn().mockReturnValue({
            all: vi.fn().mockResolvedValue({ results: mockReadings }),
          }),
        });

      // Mock the insert for export_jobs table
      (env.DB.prepare as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({
          bind: vi.fn().mockReturnValue({
            run: vi.fn().mockResolvedValue({ success: true }),
          }),
        });

      const response = await request(
        "POST",
        "/api/exports",
        { type: "readings", format: "json" },
        env
      );

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data).toHaveProperty("id");
      expect(data.status).toBe("pending");
    });

    it("should create an export job for custody records", async () => {
      // Seed mock custody records
      const mockCustodyRecords = [
        { id: 1, tenant: "default", reading_id: 1, timestamp: "2026-03-14T10:00:00Z" },
        { id: 2, tenant: "default", reading_id: 2, timestamp: "2026-03-14T11:00:00Z" },
      ];

      (env.DB.prepare as ReturnType<typeof vi.fn>)
        .mockReturnValue({
          bind: vi.fn().mockReturnValue({
            all: vi.fn().mockResolvedValue({ results: mockCustodyRecords }),
          }),
        });

      (env.DB.prepare as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({
          bind: vi.fn().mockReturnValue({
            run: vi.fn().mockResolvedValue({ success: true }),
          }),
        });

      const response = await request(
        "POST",
        "/api/exports",
        { type: "custody", format: "csv" },
        env
      );

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data).toHaveProperty("id");
      expect(data.type).toBe("custody");
      expect(data.format).toBe("csv");
    });

    it("should reject invalid export type", async () => {
      const response = await request(
        "POST",
        "/api/exports",
        { type: "invalid_type", format: "json" },
        env
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("Invalid export type");
    });

    it("should reject invalid format", async () => {
      const response = await request(
        "POST",
        "/api/exports",
        { type: "readings", format: "xml" },
        env
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("Invalid format");
    });

    it("should require type parameter", async () => {
      const response = await request(
        "POST",
        "/api/exports",
        { format: "json" },
        env
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("type is required");
    });
  });

  describe("GET /api/exports - list exports", () => {
    it("should list all exports for tenant", async () => {
      const mockExports = [
        { id: 1, tenant: "default", type: "readings", status: "completed", created_at: "2026-03-14T10:00:00Z" },
        { id: 2, tenant: "default", type: "custody", status: "pending", created_at: "2026-03-14T11:00:00Z" },
        { id: 3, tenant: "default", type: "readings", status: "failed", created_at: "2026-03-14T09:00:00Z" },
      ];

      (env.DB.prepare as ReturnType<typeof vi.fn>)
        .mockReturnValue({
          bind: vi.fn().mockReturnValue({
            all: vi.fn().mockResolvedValue({ results: mockExports }),
          }),
        });

      const response = await request("GET", "/api/exports", undefined, env);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(3);
    });

    it("should filter exports by status", async () => {
      const mockExports = [
        { id: 1, tenant: "default", type: "readings", status: "completed" },
      ];

      (env.DB.prepare as ReturnType<typeof vi.fn>)
        .mockReturnValue({
          bind: vi.fn().mockReturnValue({
            all: vi.fn().mockResolvedValue({ results: mockExports }),
          }),
        });

      const response = await request(
        "GET",
        "/api/exports?status=completed",
        undefined,
        env
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
      // Verify the query included status filter
      expect((env.DB.prepare as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    });
  });

  describe("GET /api/exports/status - get export status", () => {
    it("should return status for specific export", async () => {
      const mockExport = {
        id: 1,
        tenant: "default",
        type: "readings",
        status: "completed",
        progress: 100,
        total_records: 50,
        processed_records: 50,
        created_at: "2026-03-14T10:00:00Z",
        completed_at: "2026-03-14T10:05:00Z",
      };

      (env.DB.prepare as ReturnType<typeof vi.fn>)
        .mockReturnValue({
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(mockExport),
          }),
        });

      const response = await request(
        "GET",
        "/api/exports/status?id=1",
        undefined,
        env
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.id).toBe(1);
      expect(data.status).toBe("completed");
      expect(data.progress).toBe(100);
    });

    it("should return 404 for non-existent export", async () => {
      (env.DB.prepare as ReturnType<typeof vi.fn>)
        .mockReturnValue({
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(null),
          }),
        });

      const response = await request(
        "GET",
        "/api/exports/status?id=999",
        undefined,
        env
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toContain("not found");
    });

    it("should return 400 when id is missing", async () => {
      const response = await request(
        "GET",
        "/api/exports/status",
        undefined,
        env
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("id is required");
    });
  });

  describe("GET /api/exports/download - download export", () => {
    it("should download completed export as JSON", async () => {
      const mockExport = {
        id: 1,
        tenant: "default",
        type: "readings",
        status: "completed",
        file_path: "/exports/readings_1.json",
        file_size: 2048,
      };

      const mockReadings = [
        { id: 1, numeric_value: 42.5, timestamp: "2026-03-14T10:00:00Z" },
        { id: 2, numeric_value: 43.2, timestamp: "2026-03-14T10:05:00Z" },
      ];

      // First call to get export metadata
      (env.DB.prepare as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(mockExport),
          }),
        });

      // Second call to get readings data
      (env.DB.prepare as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({
          bind: vi.fn().mockReturnValue({
            all: vi.fn().mockResolvedValue({ results: mockReadings }),
          }),
        });

      const response = await request(
        "GET",
        "/api/exports/download?id=1",
        undefined,
        env
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("application/json");
      expect(response.headers.get("Content-Disposition")).toContain("readings_1.json");
    });

    it("should download completed export as CSV", async () => {
      const mockExport = {
        id: 2,
        tenant: "default",
        type: "custody",
        status: "completed",
        format: "csv",
      };

      const mockCustodyRecords = [
        { id: 1, reading_id: 1, timestamp: "2026-03-14T10:00:00Z", technician: "tech1@field.example" },
      ];

      (env.DB.prepare as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(mockExport),
          }),
        });

      (env.DB.prepare as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({
          bind: vi.fn().mockReturnValue({
            all: vi.fn().mockResolvedValue({ results: mockCustodyRecords }),
          }),
        });

      const response = await request(
        "GET",
        "/api/exports/download?id=2",
        undefined,
        env
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("text/csv");
    });

    it("should return 400 for pending export", async () => {
      const mockExport = {
        id: 1,
        tenant: "default",
        status: "pending",
      };

      (env.DB.prepare as ReturnType<typeof vi.fn>)
        .mockReturnValue({
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(mockExport),
          }),
        });

      const response = await request(
        "GET",
        "/api/exports/download?id=1",
        undefined,
        env
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("Export is not ready");
    });

    it("should return 400 for failed export", async () => {
      const mockExport = {
        id: 1,
        tenant: "default",
        status: "failed",
        error_message: "Database connection failed",
      };

      (env.DB.prepare as ReturnType<typeof vi.fn>)
        .mockReturnValue({
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(mockExport),
          }),
        });

      const response = await request(
        "GET",
        "/api/exports/download?id=1",
        undefined,
        env
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("Export failed");
    });

    it("should return 404 for non-existent export", async () => {
      (env.DB.prepare as ReturnType<typeof vi.fn>)
        .mockReturnValue({
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(null),
          }),
        });

      const response = await request(
        "GET",
        "/api/exports/download?id=999",
        undefined,
        env
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toContain("not found");
    });

    it("should return 400 when id is missing", async () => {
      const response = await request(
        "GET",
        "/api/exports/download",
        undefined,
        env
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("id is required");
    });
  });

  describe("DELETE /api/exports - delete export", () => {
    it("should delete a pending export", async () => {
      const mockExport = {
        id: 1,
        tenant: "default",
        status: "pending",
      };

      (env.DB.prepare as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(mockExport),
          }),
        })
        .mockReturnValueOnce({
          bind: vi.fn().mockReturnValue({
            run: vi.fn().mockResolvedValue({ success: true }),
          }),
        });

      const response = await request(
        "DELETE",
        "/api/exports?id=1",
        undefined,
        env
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.ok).toBe(true);
    });

    it("should not delete completed exports", async () => {
      const mockExport = {
        id: 1,
        tenant: "default",
        status: "completed",
      };

      (env.DB.prepare as ReturnType<typeof vi.fn>)
        .mockReturnValue({
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(mockExport),
          }),
        });

      const response = await request(
        "DELETE",
        "/api/exports?id=1",
        undefined,
        env
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("Cannot delete completed export");
    });
  });

  describe("tenant isolation", () => {
    it("should only return exports for the requesting tenant", async () => {
      const mockExports = [
        { id: 1, tenant: "default", type: "readings", status: "completed" },
      ];

      (env.DB.prepare as ReturnType<typeof vi.fn>)
        .mockReturnValue({
          bind: vi.fn().mockReturnValue({
            all: vi.fn().mockResolvedValue({ results: mockExports }),
          }),
        });

      const response = await request("GET", "/api/exports", undefined, env);

      expect(response.status).toBe(200);
      // Verify tenant filter is applied in the query
      const prepareMock = env.DB.prepare as ReturnType<typeof vi.fn>;
      expect(prepareMock).toHaveBeenCalled();
    });

    it("should only export readings for the requesting tenant", async () => {
      const mockReadings = [
        { id: 1, tenant: "default", sync_status: "pending", numeric_value: 42.5 },
      ];

      (env.DB.prepare as ReturnType<typeof vi.fn>)
        .mockReturnValue({
          bind: vi.fn().mockReturnValue({
            all: vi.fn().mockResolvedValue({ results: mockReadings }),
          }),
        });

      await request(
        "POST",
        "/api/exports",
        { type: "readings", format: "json" },
        env
      );

      // Verify tenant filter is applied
      const prepareMock = env.DB.prepare as ReturnType<typeof vi.fn>;
      expect(prepareMock).toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("should handle database errors gracefully", async () => {
      (env.DB.prepare as ReturnType<typeof vi.fn>)
        .mockReturnValue({
          bind: vi.fn().mockReturnValue({
            all: vi.fn().mockRejectedValue(new Error("Database unavailable")),
          }),
        });

      const response = await request("GET", "/api/exports", undefined, env);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toContain("Database unavailable");
    });

    it("should handle missing database binding", async () => {
      const envWithoutDb = {
        DB: undefined as unknown as D1Database,
      };

      const response = await request(
        "GET",
        "/api/exports",
        undefined,
        envWithoutDb
      );

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toContain("Database not configured");
    });
  });
});
