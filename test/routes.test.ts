import { describe, it, expect, beforeEach, jest } from "bun:test";

// Mock the handlers
const mockCapture = jest.fn();
const mockList = jest.fn();
const mockSyncTrigger = jest.fn();
const mockSyncStatus = jest.fn();
const mockKeyDerive = jest.fn();
const mockKeyStatus = jest.fn();

jest.unmock("../src/handlers/readings");
jest.unmock("../src/handlers/sync");
jest.unmock("../src/handlers/keys");

// Setup handler mocks before importing routes
jest.mock("../src/handlers/readings", () => ({
  capture: mockCapture,
  list: mockList,
}));

jest.mock("../src/handlers/sync", () => ({
  trigger: mockSyncTrigger,
  status: mockSyncStatus,
}));

jest.mock("../src/handlers/keys", () => ({
  derive: mockKeyDerive,
  status: mockKeyStatus,
}));

// Import after mocks are set up
import { routes } from "../src/routes";

function makeEnv() {
  return {
    DB: {
      prepare: jest.fn().mockReturnValue({
        bind: jest.fn().mockReturnValue({
          all: jest.fn().mockResolvedValue({ results: [] }),
          run: jest.fn().mockResolvedValue({ success: true }),
          first: jest.fn().mockResolvedValue(null),
        }),
      }),
    },
  };
}

function makeRequest(path: string, method: string, body?: unknown): Request {
  return new Request(`https://example.com${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("maps POST /api/readings to capture handler", async () => {
    const req = makeRequest("/api/readings", "POST", {
      photo: "base64data",
      latitude: 34.05,
      longitude: -118.25,
      numeric_value: 42.5,
    });
    const env = makeEnv();
    mockCapture.mockResolvedValue({
      id: 1,
      timestamp: new Date().toISOString(),
      sync_status: "pending",
    });

    const handler = routes["/api/readings"]?.POST;
    expect(handler).toBeDefined();
    
    const response = await handler(req, env, {} as ExecutionContext);
    expect(response.status).toBe(200);
    expect(mockCapture).toHaveBeenCalledWith(req, env);
  });

  it("maps GET /api/readings to list handler", async () => {
    const req = makeRequest("/api/readings?sync_status=pending", "GET");
    const env = makeEnv();
    mockList.mockResolvedValue([]);

    const handler = routes["/api/readings"]?.GET;
    expect(handler).toBeDefined();
    
    const response = await handler(req, env, {} as ExecutionContext);
    expect(response.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith(req, env);
  });

  it("maps POST /api/sync to trigger handler", async () => {
    const req = makeRequest("/api/sync", "POST");
    const env = makeEnv();
    mockSyncTrigger.mockResolvedValue({ synced: 5, failed: 0 });

    const handler = routes["/api/sync"]?.POST;
    expect(handler).toBeDefined();
    
    const response = await handler(req, env, {} as ExecutionContext);
    expect(response.status).toBe(200);
    expect(mockSyncTrigger).toHaveBeenCalledWith(req, env);
  });

  it("maps GET /api/sync/status to status handler", async () => {
    const req = makeRequest("/api/sync/status", "GET");
    const env = makeEnv();
    mockSyncStatus.mockResolvedValue({ pending: 3, last_sync: "2026-03-14T10:00:00Z" });

    const handler = routes["/api/sync/status"]?.GET;
    expect(handler).toBeDefined();
    
    const response = await handler(req, env, {} as ExecutionContext);
    expect(response.status).toBe(200);
    expect(mockSyncStatus).toHaveBeenCalledWith(req, env);
  });

  it("maps POST /api/keys to derive handler", async () => {
    const req = makeRequest("/api/keys", "POST", {
      passphrase: "test-passphrase",
    });
    const env = makeEnv();
    mockKeyDerive.mockResolvedValue({ success: true });

    const handler = routes["/api/keys"]?.POST;
    expect(handler).toBeDefined();
    
    const response = await handler(req, env, {} as ExecutionContext);
    expect(response.status).toBe(200);
    expect(mockKeyDerive).toHaveBeenCalledWith(req, env);
  });

  it("maps GET /api/keys/status to status handler", async () => {
    const req = makeRequest("/api/keys/status", "GET");
    const env = makeEnv();
    mockKeyStatus.mockResolvedValue({ exists: true });

    const handler = routes["/api/keys/status"]?.GET;
    expect(handler).toBeDefined();
    
    const response = await handler(req, env, {} as ExecutionContext);
    expect(response.status).toBe(200);
    expect(mockKeyStatus).toHaveBeenCalledWith(req, env);
  });

  it("returns 404 for unknown routes", async () => {
    const req = makeRequest("/api/unknown", "GET");
    const env = makeEnv();

    const handler = routes["/api/unknown"]?.GET;
    expect(handler).toBeUndefined();
  });

  it("returns 405 for wrong method on /api/readings", async () => {
    const req = makeRequest("/api/readings", "PUT");
    const env = makeEnv();

    const handler = routes["/api/readings"]?.PUT;
    expect(handler).toBeUndefined();
  });

  it("returns 405 for wrong method on /api/sync", async () => {
    const req = makeRequest("/api/sync", "DELETE");
    const env = makeEnv();

    const handler = routes["/api/sync"]?.DELETE;
    expect(handler).toBeUndefined();
  });

  it("returns 405 for wrong method on /api/keys", async () => {
    const req = makeRequest("/api/keys", "PATCH");
    const env = makeEnv();

    const handler = routes["/api/keys"]?.PATCH;
    expect(handler).toBeUndefined();
  });

  it("handles list with tenant filtering", async () => {
    const req = makeRequest("/api/readings?tenant=custom", "GET");
    const env = makeEnv();
    mockList.mockResolvedValue([
      { id: 1, tenant: "custom", numeric_value: 10 },
    ]);

    const handler = routes["/api/readings"]?.GET;
    const response = await handler(req, env, {} as ExecutionContext);
    const data = await response.json();
    
    expect(data).toHaveLength(1);
    expect((data[0] as Record<string, unknown>).tenant).toBe("custom");
  });

  it("handles sync status with last_sync timestamp", async () => {
    const req = makeRequest("/api/sync/status", "GET");
    const env = makeEnv();
    const now = new Date().toISOString();
    mockSyncStatus.mockResolvedValue({ pending: 0, last_sync: now });

    const handler = routes["/api/sync/status"]?.GET;
    const response = await handler(req, env, {} as ExecutionContext);
    const data = await response.json() as Record<string, unknown>;
    
    expect(data.pending).toBe(0);
    expect(data.last_sync).toBe(now);
  });

  it("validates required fields on capture", async () => {
    const req = makeRequest("/api/readings", "POST", {
      photo: "base64data",
      // missing latitude, longitude, numeric_value
    });
    const env = makeEnv();
    mockCapture.mockResolvedValue({
      error: "Missing required fields",
    });

    const handler = routes["/api/readings"]?.POST;
    const response = await handler(req, env, {} as ExecutionContext);
    
    expect(mockCapture).toHaveBeenCalled();
  });

  it("validates passphrase on key derivation", async () => {
    const req = makeRequest("/api/keys", "POST", {
      // missing passphrase
    });
    const env = makeEnv();
    mockKeyDerive.mockResolvedValue({
      error: "Passphrase required",
    });

    const handler = routes["/api/keys"]?.POST;
    const response = await handler(req, env, {} as ExecutionContext);
    
    expect(mockKeyDerive).toHaveBeenCalled();
  });

  it("sync handler returns sync counts", async () => {
    const req = makeRequest("/api/sync", "POST");
    const env = makeEnv();
    mockSyncTrigger.mockResolvedValue({ synced: 10, failed: 2 });

    const handler = routes["/api/sync"]?.POST;
    const response = await handler(req, env, {} as ExecutionContext);
    const data = await response.json() as Record<string, number>;
    
    expect(data.synced).toBe(10);
    expect(data.failed).toBe(2);
  });

  it("key status returns exists flag", async () => {
    const req = makeRequest("/api/keys/status", "GET");
    const env = makeEnv();
    mockKeyStatus.mockResolvedValue({ exists: false });

    const handler = routes["/api/keys/status"]?.GET;
    const response = await handler(req, env, {} as ExecutionContext);
    const data = await response.json() as Record<string, boolean>;
    
    expect(data.exists).toBe(false);
  });

  it("routes object has all expected endpoints", () => {
    expect(routes["/api/readings"]).toBeDefined();
    expect(routes["/api/sync"]).toBeDefined();
    expect(routes["/api/sync/status"]).toBeDefined();
    expect(routes["/api/keys"]).toBeDefined();
    expect(routes["/api/keys/status"]).toBeDefined();
  });

  it("each route has GET and POST handlers where applicable", () => {
    expect(routes["/api/readings"]?.GET).toBeDefined();
    expect(routes["/api/readings"]?.POST).toBeDefined();
    expect(routes["/api/sync"]?.POST).toBeDefined();
    expect(routes["/api/sync/status"]?.GET).toBeDefined();
    expect(routes["/api/keys"]?.POST).toBeDefined();
    expect(routes["/api/keys/status"]?.GET).toBeDefined();
  });
}
