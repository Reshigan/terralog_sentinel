import { describe, it, expect, beforeEach } from "bun:test";
import {
  makeEnv,
  request,
  seedDatabase,
  clearDatabase,
} from "./test-utils";

describe("custody handlers", () => {
  let env: ReturnType<typeof makeEnv>;

  beforeEach(async () => {
    env = makeEnv();
    await clearDatabase(env);
    await seedDatabase(env);
  });

  describe("POST /api/custody/transfer", () => {
    it("transfers custody of equipment to a new technician", async () => {
      const response = await request("/api/custody/transfer", env, {
        method: "POST",
        body: {
          equipment_id: 1,
          from_technician: "tech1@field.example",
          to_technician: "tech2@field.example",
          timestamp: "2026-03-14T12:00:00Z",
        },
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.custody_id).toBeDefined();
    });

    it("fails when equipment does not exist", async () => {
      const response = await request("/api/custody/transfer", env, {
        method: "POST",
        body: {
          equipment_id: 9999,
          from_technician: "tech1@field.example",
          to_technician: "tech2@field.example",
          timestamp: "2026-03-14T12:00:00Z",
        },
      });

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error).toContain("equipment not found");
    });

    it("fails when from_technician does not match current custody", async () => {
      const response = await request("/api/custody/transfer", env, {
        method: "POST",
        body: {
          equipment_id: 1,
          from_technician: "wrong@technician.example",
          to_technician: "tech2@field.example",
          timestamp: "2026-03-14T12:00:00Z",
        },
      });

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toContain("not the current custodian");
    });

    it("fails when required fields are missing", async () => {
      const response = await request("/api/custody/transfer", env, {
        method: "POST",
        body: {
          equipment_id: 1,
          from_technician: "tech1@field.example",
        },
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("missing required field");
    });
  });

  describe("GET /api/custody", () => {
    it("lists custody records for a tenant", async () => {
      const response = await request("/api/custody", env, {
        method: "GET",
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
    });

    it("filters by equipment_id", async () => {
      const response = await request(
        "/api/custody?equipment_id=1",
        env,
        {
          method: "GET",
        }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(Array.isArray(body)).toBe(true);
      for (const record of body) {
        expect(record.equipment_id).toBe(1);
      }
    });

    it("filters by technician", async () => {
      const response = await request(
        "/api/custody?technician=tech1@field.example",
        env,
        {
          method: "GET",
        }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(Array.isArray(body)).toBe(true);
      for (const record of body) {
        expect(
          record.from_technician === "tech1@field.example" ||
            record.to_technician === "tech1@field.example"
        ).toBe(true);
      }
    });

    it("filters by date range", async () => {
      const response = await request(
        "/api/custody?from=2026-01-01&to=2026-12-31",
        env,
        {
          method: "GET",
        }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(Array.isArray(body)).toBe(true);
    });
  });

  describe("GET /api/custody/history/:equipment_id", () => {
    it("returns full chain of custody for equipment", async () => {
      const response = await request(
        "/api/custody/history/1",
        env,
        {
          method: "GET",
        }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
      for (const record of body) {
        expect(record.equipment_id).toBe(1);
      }
    });

    it("returns empty for non-existent equipment", async () => {
      const response = await request(
        "/api/custody/history/9999",
        env,
        {
          method: "GET",
        }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(0);
    });
  });

  describe("GET /api/custody/current/:equipment_id", () => {
    it("returns current custodian for equipment", async () => {
      const response = await request(
        "/api/custody/current/1",
        env,
        {
          method: "GET",
        }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.equipment_id).toBe(1);
      expect(body.current_technician).toBeDefined();
      expect(body.custody_start).toBeDefined();
    });

    it("returns 404 for equipment without custody history", async () => {
      const response = await request(
        "/api/custody/current/9999",
        env,
        {
          method: "GET",
        }
      );

      expect(response.status).toBe(404);
    });
  });

  describe("tenant isolation", () => {
    it("only returns custody records for the request's tenant", async () => {
      const response = await request("/api/custody", env, {
        method: "GET",
      });

      const body = await response.json();
      expect(Array.isArray(body)).toBe(true);
      for (const record of body) {
        expect(record.tenant).toBe("default");
      }
    });

    it("transfer operation respects tenant scope", async () => {
      const response = await request("/api/custody/transfer", env, {
        method: "POST",
        body: {
          equipment_id: 1,
          from_technician: "tech1@field.example",
          to_technician: "tech2@field.example",
          timestamp: "2026-03-14T12:00:00Z",
        },
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.tenant).toBe("default");
    });
  });
});
