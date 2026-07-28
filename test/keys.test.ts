import { describe, expect, test, beforeEach } from "bun:test";

interface TestEnv {
  DB: D1Database;
}

function makeEnv(): TestEnv {
  // @ts-expect-error - D1 binding in test environment
  return globalThis.__env__ as TestEnv;
}

async function request(path: string, options: RequestInit = {}): Promise<Response> {
  const url = `http://localhost:8787${path}`;
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
}

describe("GET /api/keys/status", () => {
  test("returns exists: false when no key is set", async () => {
    const env = makeEnv();
    
    // Ensure no key exists for this test
    await env.DB.prepare("DELETE FROM encryption_keys WHERE tenant = ?")
      .bind("test-key-status")
      .run();
    
    const res = await request("/api/keys/status?tenant=test-key-status");
    expect(res.status).toBe(200);
    
    const body = await res.json();
    expect(body).toEqual({ exists: false });
  });
  
  test("returns exists: true when key is set", async () => {
    const env = makeEnv();
    const tenant = "test-key-exists";
    
    // Clean up and insert a test key
    await env.DB.prepare("DELETE FROM encryption_keys WHERE tenant = ?")
      .bind(tenant)
      .run();
    
    await env.DB.prepare(
      "INSERT INTO encryption_keys (tenant, derived_key, salt, iterations, device_fingerprint, created_at, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      tenant,
      "test_derived_key",
      "test_salt",
      100000,
      "test_fingerprint",
      new Date().toISOString(),
      1
    ).run();
    
    const res = await request(`/api/keys/status?tenant=${tenant}`);
    expect(res.status).toBe(200);
    
    const body = await res.json();
    expect(body).toEqual({ exists: true });
  });
  
  test("defaults to 'default' tenant when not specified", async () => {
    const env = makeEnv();
    
    // Clean up
    await env.DB.prepare("DELETE FROM encryption_keys WHERE tenant = ?")
      .bind("default")
      .run();
    
    const res = await request("/api/keys/status");
    expect(res.status).toBe(200);
    
    const body = await res.json();
    expect(body).toEqual({ exists: false });
  });
});

describe("POST /api/keys", () => {
  test("derives key with device-bound salt and stores it", async () => {
    const env = makeEnv();
    const tenant = "test-derive-key";
    
    // Clean up any existing key
    await env.DB.prepare("DELETE FROM encryption_keys WHERE tenant = ?")
      .bind(tenant)
      .run();
    
    // Insert device info for the test
    await env.DB.prepare(
      "INSERT INTO devices (tenant, user_agent, screen_width, screen_height, hardware_concurrency, status) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(tenant, "test-agent", 1080, 1920, 4, "active").run();
    
    const deviceIdResult = await env.DB.prepare(
      "SELECT id FROM devices WHERE tenant = ? ORDER BY id DESC LIMIT 1"
    ).bind(tenant).first<{ id: number }>();
    
    const res = await request("/api/keys", {
      method: "POST",
      body: JSON.stringify({
        tenant,
        passphrase: "test-passphrase-123",
        deviceId: deviceIdResult?.id,
      }),
    });
    
    expect(res.status).toBe(200);
    
    const body = await res.json();
    expect(body.success).toBe(true);
    
    // Verify key was stored
    const keyResult = await env.DB.prepare(
      "SELECT * FROM encryption_keys WHERE tenant = ?"
    ).bind(tenant).first();
    
    expect(keyResult).not.toBeNull();
    expect((keyResult as Record<string, unknown>).is_active).toBe(1);
    expect((keyResult as Record<string, unknown>).iterations).toBe(100000);
  });
  
  test("fails with weak passphrase", async () => {
    const env = makeEnv();
    const tenant = "test-weak-pass";
    
    const res = await request("/api/keys", {
      method: "POST",
      body: JSON.stringify({
        tenant,
        passphrase: "123",
      }),
    });
    
    expect(res.status).toBe(400);
    
    const body = await res.json();
    expect(body.error).toContain("passphrase");
  });
  
  test("fails without passphrase", async () => {
    const env = makeEnv();
    const tenant = "test-no-pass";
    
    const res = await request("/api/keys", {
      method: "POST",
      body: JSON.stringify({
        tenant,
      }),
    });
    
    expect(res.status).toBe(400);
    
    const body = await res.json();
    expect(body.error).toContain("passphrase");
  });
  
  test("updates existing key when re-deriving", async () => {
    const env = makeEnv();
    const tenant = "test-update-key";
    
    // Insert initial key
    await env.DB.prepare(
      "INSERT INTO encryption_keys (tenant, derived_key, salt, iterations, device_fingerprint, created_at, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      tenant,
      "old_key",
      "old_salt",
      100000,
      "old_fingerprint",
      new Date().toISOString(),
      1
    ).run();
    
    // Insert device
    await env.DB.prepare(
      "INSERT INTO devices (tenant, user_agent, screen_width, screen_height, hardware_concurrency, status) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(tenant, "test-agent", 1080, 1920, 4, "active").run();
    
    const deviceIdResult = await env.DB.prepare(
      "SELECT id FROM devices WHERE tenant = ? ORDER BY id DESC LIMIT 1"
    ).bind(tenant).first<{ id: number }>();
    
    const res = await request("/api/keys", {
      method: "POST",
      body: JSON.stringify({
        tenant,
        passphrase: "new-passphrase-456",
        deviceId: deviceIdResult?.id,
      }),
    });
    
    expect(res.status).toBe(200);
    
    const body = await res.json();
    expect(body.success).toBe(true);
    
    // Verify key was updated, not duplicated
    const keys = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM encryption_keys WHERE tenant = ?"
    ).bind(tenant).first<{ count: number }>();
    
    expect(keys?.count).toBe(1);
  });
});

describe("GET /api/keys/status - tenant isolation", () => {
  test("returns false for tenant without keys despite other tenants having keys", async () => {
    const env = makeEnv();
    const tenantWithKey = "tenant-with-key";
    const tenantWithoutKey = "tenant-without-key";
    
    // Clean up
    await env.DB.prepare("DELETE FROM encryption_keys WHERE tenant = ?").bind(tenantWithKey).run();
    await env.DB.prepare("DELETE FROM encryption_keys WHERE tenant = ?").bind(tenantWithoutKey).run();
    
    // Insert key for one tenant only
    await env.DB.prepare(
      "INSERT INTO encryption_keys (tenant, derived_key, salt, iterations, device_fingerprint, created_at, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      tenantWithKey,
      "key_material",
      "salt_value",
      100000,
      "fingerprint",
      new Date().toISOString(),
      1
    ).run();
    
    // Check tenant WITHOUT key
    const res = await request(`/api/keys/status?tenant=${tenantWithoutKey}`);
    expect(res.status).toBe(200);
    
    const body = await res.json();
    expect(body.exists).toBe(false);
    
    // Check tenant WITH key
    const resWithKey = await request(`/api/keys/status?tenant=${tenantWithKey}`);
    const bodyWithKey = await resWithKey.json();
    expect(bodyWithKey.exists).toBe(true);
  });
});
