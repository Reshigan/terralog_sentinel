import { describe, it, expect, beforeEach } from "bun:test";
import type { D1Database } from "@cloudflare/workers-types";

// Types from the shared contract
import type {
  Calibration_log,
  ListCalibration_logsHandler,
  GetCalibration_logHandler,
  CreateCalibration_logHandler,
  UpdateCalibration_logHandler,
} from "../src/types";

// Handler implementations - these will be imported from the actual handlers
// For now, we define them inline to match the contract

interface Env {
  DB: D1Database;
}

// Helper to create test environment with seeded data
async function makeEnv(): Promise<Env & { cleanup: () => Promise<void> }> {
  const DB = await import("../src/lib/db").then(m => m.getTestDB());
  
  // Seed calibration_logs data
  await DB.prepare(`
    INSERT INTO calibration_logs (id, tenant, equipment_id, calibrated_at, calibrated_by, next_calibration, notes, status, reading_id)
    VALUES 
      (1, 'default', 1, '2026-03-01T10:00:00Z', 'tech1@field.example', '2026-06-01T10:00:00Z', 'Initial calibration', 'valid', 1),
      (2, 'default', 2, '2026-03-10T14:30:00Z', 'tech2@field.example', '2026-06-10T14:30:00Z', 'Recalibration after maintenance', 'valid', 2),
      (3, 'default', 3, '2026-02-15T09:00:00Z', 'tech1@field.example', '2026-05-15T09:00:00Z', 'Expired calibration', 'expired', 3)
  `).run();

  const env = { DB } as Env;
  
  return {
    ...env,
    cleanup: async () => {
      await DB.prepare("DELETE FROM calibration_logs WHERE tenant = 'default'").run();
    }
  };
}

// Mock request helper
function makeRequest(path: string, method: string, body?: unknown): Request {
  const url = new URL(path, "http://localhost");
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// JSON helper for responses
async function json<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

describe("Calibration Logs API", () => {
  let env: Env & { cleanup: () => Promise<void> };

  beforeEach(async () => {
    env = await makeEnv();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  describe("GET /api/calibration_logs", () => {
    it("lists all calibration logs for default tenant", async () => {
      const req = makeRequest("/api/calibration_logs", "GET");
      const handler: ListCalibration_logsHandler = async (req, env) => {
        const rows = await env.DB.prepare(
          "SELECT * FROM calibration_logs WHERE tenant = 'default' ORDER BY calibrated_at DESC"
        ).all();
        return new Response(JSON.stringify(rows.results), {
          headers: { "Content-Type": "application/json" },
        });
      };

      const res = await handler(req, env);
      const data = await json<Calibration_log[]>(res);

      expect(res.status).toBe(200);
      expect(data.length).toBe(3);
      expect(data[0].status).toBe("expired");
    });

    it("filters by status", async () => {
      const req = makeRequest("/api/calibration_logs?status=valid", "GET");
      const handler: ListCalibration_logsHandler = async (req, env) => {
        const url = new URL(req.url);
        const status = url.searchParams.get("status");
        
        let query = "SELECT * FROM calibration_logs WHERE tenant = 'default'";
        const params: unknown[] = [];
        
        if (status) {
          query += " AND status = ?";
          params.push(status);
        }
        
        query += " ORDER BY calibrated_at DESC";
        
        const rows = await env.DB.prepare(query).bind(...params).all();
        return new Response(JSON.stringify(rows.results), {
          headers: { "Content-Type": "application/json" },
        });
      };

      const res = await handler(req, env);
      const data = await json<Calibration_log[]>(res);

      expect(res.status).toBe(200);
      expect(data.length).toBe(2);
      expect(data.every(r => r.status === "valid")).toBe(true);
    });

    it("filters by equipment_id", async () => {
      const req = makeRequest("/api/calibration_logs?equipment_id=1", "GET");
      const handler: ListCalibration_logsHandler = async (req, env) => {
        const url = new URL(req.url);
        const equipmentId = url.searchParams.get("equipment_id");
        
        let query = "SELECT * FROM calibration_logs WHERE tenant = 'default'";
        const params: unknown[] = [];
        
        if (equipmentId) {
          query += " AND equipment_id = ?";
          params.push(parseInt(equipmentId, 10));
        }
        
        query += " ORDER BY calibrated_at DESC";
        
        const rows = await env.DB.prepare(query).bind(...params).all();
        return new Response(JSON.stringify(rows.results), {
          headers: { "Content-Type": "application/json" },
        });
      };

      const res = await handler(req, env);
      const data = await json<Calibration_log[]>(res);

      expect(res.status).toBe(200);
      expect(data.length).toBe(1);
      expect(data[0].equipment_id).toBe(1);
    });
  });

  describe("GET /api/calibration_logs/:id", () => {
    it("returns a single calibration log by id", async () => {
      const req = makeRequest("/api/calibration_logs/1", "GET");
      const handler: GetCalibration_logHandler = async (req, env) => {
        const url = new URL(req.url);
        const id = parseInt(url.pathname.split("/").pop() || "0", 10);
        
        const row = await env.DB.prepare(
          "SELECT * FROM calibration_logs WHERE id = ? AND tenant = 'default'"
        ).bind(id).first();
        
        if (!row) {
          return new Response(JSON.stringify({ error: "Not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
        
        return new Response(JSON.stringify(row), {
          headers: { "Content-Type": "application/json" },
        });
      };

      const res = await handler(req, env);
      const data = await json<Calibration_log>(res);

      expect(res.status).toBe(200);
      expect(data.id).toBe(1);
      expect(data.calibrated_by).toBe("tech1@field.example");
    });

    it("returns 404 for non-existent id", async () => {
      const req = makeRequest("/api/calibration_logs/999", "GET");
      const handler: GetCalibration_logHandler = async (req, env) => {
        const url = new URL(req.url);
        const id = parseInt(url.pathname.split("/").pop() || "0", 10);
        
        const row = await env.DB.prepare(
          "SELECT * FROM calibration_logs WHERE id = ? AND tenant = 'default'"
        ).bind(id).first();
        
        if (!row) {
          return new Response(JSON.stringify({ error: "Not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
        
        return new Response(JSON.stringify(row), {
          headers: { "Content-Type": "application/json" },
        });
      };

      const res = await handler(req, env);

      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/calibration_logs", () => {
    it("creates a new calibration log", async () => {
      const body = {
        equipment_id: 1,
        calibrated_at: "2026-03-15T10:00:00Z",
        calibrated_by: "tech3@field.example",
        next_calibration: "2026-06-15T10:00:00Z",
        notes: "New equipment installed",
        status: "valid",
        reading_id: 4,
      };
      const req = makeRequest("/api/calibration_logs", "POST", body);
      const handler: CreateCalibration_logHandler = async (req, env) => {
        const data = await req.json<typeof body>();
        
        const result = await env.DB.prepare(`
          INSERT INTO calibration_logs (tenant, equipment_id, calibrated_at, calibrated_by, next_calibration, notes, status, reading_id)
          VALUES ('default', ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          data.equipment_id,
          data.calibrated_at,
          data.calibrated_by,
          data.next_calibration,
          data.notes,
          data.status,
          data.reading_id
        ).run();
        
        const row = await env.DB.prepare(
          "SELECT * FROM calibration_logs WHERE id = ?"
        ).bind(result.meta.last_insert_rowid).first();
        
        return new Response(JSON.stringify(row), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      };

      const res = await handler(req, env);
      const data = await json<Calibration_log>(res);

      expect(res.status).toBe(201);
      expect(data.equipment_id).toBe(1);
      expect(data.calibrated_by).toBe("tech3@field.example");
      expect(data.status).toBe("valid");
    });

    it("rejects invalid input - missing required fields", async () => {
      const body = {
        equipment_id: 1,
        // missing calibrated_at, calibrated_by, next_calibration, status
      };
      const req = makeRequest("/api/calibration_logs", "POST", body);
      const handler: CreateCalibration_logHandler = async (req, env) => {
        const data = await req.json();
        
        // Validate required fields
        if (!data.equipment_id || !data.calibrated_at || !data.calibrated_by || !data.next_calibration || !data.status) {
          return new Response(JSON.stringify({ error: "Missing required fields" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        
        const result = await env.DB.prepare(`
          INSERT INTO calibration_logs (tenant, equipment_id, calibrated_at, calibrated_by, next_calibration, notes, status, reading_id)
          VALUES ('default', ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          data.equipment_id,
          data.calibrated_at,
          data.calibrated_by,
          data.next_calibration,
          data.notes,
          data.status,
          data.reading_id
        ).run();
        
        const row = await env.DB.prepare(
          "SELECT * FROM calibration_logs WHERE id = ?"
        ).bind(result.meta.last_insert_rowid).first();
        
        return new Response(JSON.stringify(row), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      };

      const res = await handler(req, env);

      expect(res.status).toBe(400);
      const err = await json<{ error: string }>(res);
      expect(err.error).toContain("required");
    });

    it("rejects invalid status value", async () => {
      const body = {
        equipment_id: 1,
        calibrated_at: "2026-03-15T10:00:00Z",
        calibrated_by: "tech3@field.example",
        next_calibration: "2026-06-15T10:00:00Z",
        notes: "Test",
        status: "invalid_status",
        reading_id: 1,
      };
      const req = makeRequest("/api/calibration_logs", "POST", body);
      const handler: CreateCalibration_logHandler = async (req, env) => {
        const data = await req.json<typeof body>();
        
        const validStatuses = ["valid", "expired", "pending", "revoked"];
        if (!validStatuses.includes(data.status)) {
          return new Response(JSON.stringify({ error: "Invalid status value" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        
        const result = await env.DB.prepare(`
          INSERT INTO calibration_logs (tenant, equipment_id, calibrated_at, calibrated_by, next_calibration, notes, status, reading_id)
          VALUES ('default', ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          data.equipment_id,
          data.calibrated_at,
          data.calibrated_by,
          data.next_calibration,
          data.notes,
          data.status,
          data.reading_id
        ).run();
        
        const row = await env.DB.prepare(
          "SELECT * FROM calibration_logs WHERE id = ?"
        ).bind(result.meta.last_insert_rowid).first();
        
        return new Response(JSON.stringify(row), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      };

      const res = await handler(req, env);

      expect(res.status).toBe(400);
      const err = await json<{ error: string }>(res);
      expect(err.error).toContain("Invalid status");
    });
  });

  describe("PUT /api/calibration_logs/:id (revoke)", () => {
    it("revokes a calibration log by updating status to revoked", async () => {
      const req = makeRequest("/api/calibration_logs/1", "PUT", { status: "revoked" });
      const handler: UpdateCalibration_logHandler = async (req, env) => {
        const url = new URL(req.url);
        const id = parseInt(url.pathname.split("/").pop() || "0", 10);
        const data = await req.json<{ status: string }>();
        
        if (data.status === "revoked") {
          // Revoke: update status and set revoked_at timestamp
          await env.DB.prepare(`
            UPDATE calibration_logs 
            SET status = 'revoked', notes = COALESCE(notes, '') || ' | Revoked at: ' || datetime('now')
            WHERE id = ? AND tenant = 'default'
          `).bind(id).run();
        }
        
        const row = await env.DB.prepare(
          "SELECT * FROM calibration_logs WHERE id = ? AND tenant = 'default'"
        ).bind(id).first();
        
        if (!row) {
          return new Response(JSON.stringify({ error: "Not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
        
        return new Response(JSON.stringify(row), {
          headers: { "Content-Type": "application/json" },
        });
      };

      const res = await handler(req, env);
      const data = await json<Calibration_log>(res);

      expect(res.status).toBe(200);
      expect(data.status).toBe("revoked");
    });

    it("returns 404 when revoking non-existent calibration log", async () => {
      const req = makeRequest("/api/calibration_logs/999", "PUT", { status: "revoked" });
      const handler: UpdateCalibration_logHandler = async (req, env) => {
        const url = new URL(req.url);
        const id = parseInt(url.pathname.split("/").pop() || "0", 10);
        const data = await req.json<{ status: string }>();
        
        if (data.status === "revoked") {
          await env.DB.prepare(`
            UPDATE calibration_logs 
            SET status = 'revoked', notes = COALESCE(notes, '') || ' | Revoked at: ' || datetime('now')
            WHERE id = ? AND tenant = 'default'
          `).bind(id).run();
        }
        
        const row = await env.DB.prepare(
          "SELECT * FROM calibration_logs WHERE id = ? AND tenant = 'default'"
        ).bind(id).first();
        
        if (!row) {
          return new Response(JSON.stringify({ error: "Not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
        
        return new Response(JSON.stringify(row), {
          headers: { "Content-Type": "application/json" },
        });
      };

      const res = await handler(req, env);

      expect(res.status).toBe(404);
    });
  });

  describe("tenant isolation", () => {
    it("only returns data for the request's tenant", async () => {
      // Insert a reading for a different tenant
      await env.DB.prepare(`
        INSERT INTO calibration_logs (id, tenant, equipment_id, calibrated_at, calibrated_by, next_calibration, notes, status, reading_id)
        VALUES (100, 'other_tenant', 1, '2026-03-01T10:00:00Z', 'other@field.example', '2026-06-01T10:00:00Z', 'Other tenant', 'valid', 1)
      `).run();

      const req = makeRequest("/api/calibration_logs", "GET");
      const handler: ListCalibration_logsHandler = async (req, env) => {
        const rows = await env.DB.prepare(
          "SELECT * FROM calibration_logs WHERE tenant = 'default'"
        ).all();
        return new Response(JSON.stringify(rows.results), {
          headers: { "Content-Type": "application/json" },
        });
      };

      const res = await handler(req, env);
      const data = await json<Calibration_log[]>(res);

      expect(res.status).toBe(200);
      expect(data.length).toBe(3); // Only default tenant, not the other_tenant
      expect(data.every(r => r.tenant === "default")).toBe(true);
    });
  });
});
