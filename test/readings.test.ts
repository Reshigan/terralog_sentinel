import { describe, it, expect, beforeEach, vi } from 'bun:test';
import type { D1Database } from '@cloudflare/workers-types';

// Mock the crypto module
vi.mock('../src/lib/crypto', () => ({
  encrypt: vi.fn().mockResolvedValue({
    ciphertext: 'encrypted_data',
    iv: 'test_iv',
  }),
  generateUUIDv5: vi.fn().mockReturnValue('test-uuid-v5'),
}));

// Import after mocking
import { createReading, listReadings } from '../src/handlers/readings';
import type { Reading } from '../src/types';

// Test utilities
function makeEnv(overrides: Partial<{ DB: D1Database }> = {}): { DB: D1Database } & Record<string, unknown> {
  const mockDB = {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [], success: true }),
        run: vi.fn().mockResolvedValue({ success: true }),
      }),
    }),
  };

  return {
    DB: mockDB as unknown as D1Database,
    ...overrides,
  };
}

async function request(
  method: string,
  path: string,
  body?: BodyInit | Record<string, unknown>,
  env: ReturnType<typeof makeEnv> = makeEnv()
): Promise<{ status: number; json: () => Promise<unknown> }> {
  const url = new URL(path, 'http://localhost');
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };

  if (body) {
    init.body = JSON.stringify(body);
  }

  const req = new Request(url.toString(), init);
  
  let response: Response;
  
  if (path === '/api/readings' && method === 'POST') {
    response = await createReading(req, env as { DB: D1Database } & Record<string, unknown>);
  } else if (path === '/api/readings' && method === 'GET') {
    response = await listReadings(req, env as { DB: D1Database } & Record<string, unknown>);
  } else {
    throw new Error(`Unhandled route: ${method} ${path}`);
  }

  return {
    status: response.status,
    json: () => response.json(),
  };
}

describe('readings handlers', () => {
  describe('POST /api/readings - capture', () => {
    it('should create a reading with valid input', async () => {
      const env = makeEnv();
      const mockDB = env.DB as unknown as D1Database;
      
      // Mock the insert to return the created reading
      vi.mocked(mockDB.prepare).mockImplementation((sql: string) => {
        if (sql.includes('INSERT INTO readings')) {
          return {
            bind: vi.fn().mockReturnValue({
              run: vi.fn().mockResolvedValue({ success: true, meta: { last_row_id: 1 } }),
            }),
          } as any;
        }
        return {
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(null),
            all: vi.fn().mockResolvedValue({ results: [], success: true }),
          }),
        } as any;
      });

      const readingData = {
        photo: 'base64_encoded_photo_data',
        latitude: 34.0522,
        longitude: -118.2437,
        numeric_value: 42.5,
        timestamp: '2026-03-14T10:00:00Z',
      };

      const res = await request('POST', '/api/readings', readingData, env);
      
      expect(res.status).toBe(201);
      const data = await res.json() as { id: number; timestamp: string; sync_status: string };
      expect(data.id).toBe(1);
      expect(data.sync_status).toBe('pending');
    });

    it('should reject reading with missing required fields', async () => {
      const env = makeEnv();
      
      const invalidData = {
        photo: 'base64_encoded_photo_data',
        // missing latitude, longitude, numeric_value
      };

      const res = await request('POST', '/api/readings', invalidData, env);
      
      expect(res.status).toBe(400);
      const data = await res.json() as { error: string };
      expect(data.error).toContain('latitude');
    });

    it('should reject reading with invalid GPS coordinates', async () => {
      const env = makeEnv();
      
      const invalidData = {
        photo: 'base64_encoded_photo_data',
        latitude: 100, // invalid: out of range
        longitude: -118.2437,
        numeric_value: 42.5,
        timestamp: '2026-03-14T10:00:00Z',
      };

      const res = await request('POST', '/api/readings', invalidData, env);
      
      expect(res.status).toBe(400);
      const data = await res.json() as { error: string };
      expect(data.error).toContain('latitude');
    });

    it('should reject reading with negative numeric value', async () => {
      const env = makeEnv();
      
      const invalidData = {
        photo: 'base64_encoded_photo_data',
        latitude: 34.0522,
        longitude: -118.2437,
        numeric_value: -10, // invalid: negative
        timestamp: '2026-03-14T10:00:00Z',
      };

      const res = await request('POST', '/api/readings', invalidData, env);
      
      expect(res.status).toBe(400);
      const data = await res.json() as { error: string };
      expect(data.error).toContain('numeric_value');
    });

    it('should reject reading with invalid timestamp format', async () => {
      const env = makeEnv();
      
      const invalidData = {
        photo: 'base64_encoded_photo_data',
        latitude: 34.0522,
        longitude: -118.2437,
        numeric_value: 42.5,
        timestamp: 'invalid-timestamp',
      };

      const res = await request('POST', '/api/readings', invalidData, env);
      
      expect(res.status).toBe(400);
      const data = await res.json() as { error: string };
      expect(data.error).toContain('timestamp');
    });

    it('should reject reading with empty photo data', async () => {
      const env = makeEnv();
      
      const invalidData = {
        photo: '',
        latitude: 34.0522,
        longitude: -118.2437,
        numeric_value: 42.5,
        timestamp: '2026-03-14T10:00:00Z',
      };

      const res = await request('POST', '/api/readings', invalidData, env);
      
      expect(res.status).toBe(400);
      const data = await res.json() as { error: string };
      expect(data.error).toContain('photo');
    });
  });

  describe('GET /api/readings - list', () => {
    it('should list all readings for default tenant', async () => {
      const env = makeEnv();
      const mockDB = env.DB as unknown as D1Database;
      
      const mockReadings: Reading[] = [
        {
          id: 1,
          photo: 'photo1',
          latitude: 34.0522,
          longitude: -118.2437,
          numeric_value: 42.5,
          timestamp: '2026-03-14T10:00:00Z',
          encrypted_blob: 'blob1',
          sync_status: 'pending',
          sync_attempts: 0,
          dedupe_id: 'dedupe1',
          site_id: 1,
          device_id: 1,
          equipment_id: 1,
          calibration_id: 1,
          row_version: 1,
        },
        {
          id: 2,
          photo: 'photo2',
          latitude: 34.0622,
          longitude: -118.2537,
          numeric_value: 43.0,
          timestamp: '2026-03-14T11:00:00Z',
          encrypted_blob: 'blob2',
          sync_status: 'synced',
          sync_attempts: 1,
          dedupe_id: 'dedupe2',
          site_id: 1,
          device_id: 1,
          equipment_id: 1,
          calibration_id: 1,
          row_version: 1,
        },
      ];

      vi.mocked(mockDB.prepare).mockImplementation((sql: string) => {
        if (sql.includes('SELECT') && sql.includes('readings')) {
          return {
            bind: vi.fn().mockReturnValue({
              all: vi.fn().mockResolvedValue({ results: mockReadings, success: true }),
            }),
          } as any;
        }
        return {
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(null),
            all: vi.fn().mockResolvedValue({ results: [], success: true }),
          }),
        } as any;
      });

      const res = await request('GET', '/api/readings', undefined, env);
      
      expect(res.status).toBe(200);
      const data = await res.json() as Reading[];
      expect(data).toHaveLength(2);
      expect(data[0].sync_status).toBe('pending');
      expect(data[1].sync_status).toBe('synced');
    });

    it('should filter readings by sync_status', async () => {
      const env = makeEnv();
      const mockDB = env.DB as unknown as D1Database;
      
      const mockReadings: Reading[] = [
        {
          id: 1,
          photo: 'photo1',
          latitude: 34.0522,
          longitude: -118.2437,
          numeric_value: 42.5,
          timestamp: '2026-03-14T10:00:00Z',
          encrypted_blob: 'blob1',
          sync_status: 'pending',
          sync_attempts: 0,
          dedupe_id: 'dedupe1',
          site_id: 1,
          device_id: 1,
          equipment_id: 1,
          calibration_id: 1,
          row_version: 1,
        },
      ];

      vi.mocked(mockDB.prepare).mockImplementation((sql: string) => {
        if (sql.includes('SELECT') && sql.includes('readings') && sql.includes('sync_status')) {
          return {
            bind: vi.fn().mockReturnValue({
              all: vi.fn().mockResolvedValue({ results: mockReadings, success: true }),
            }),
          } as any;
        }
        return {
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(null),
            all: vi.fn().mockResolvedValue({ results: [], success: true }),
          }),
        } as any;
      });

      const res = await request('GET', '/api/readings?sync_status=pending', undefined, env);
      
      expect(res.status).toBe(200);
      const data = await res.json() as Reading[];
      expect(data).toHaveLength(1);
      expect(data[0].sync_status).toBe('pending');
    });

    it('should return empty array when no readings exist', async () => {
      const env = makeEnv();
      const mockDB = env.DB as unknown as D1Database;

      vi.mocked(mockDB.prepare).mockImplementation((sql: string) => {
        if (sql.includes('SELECT') && sql.includes('readings')) {
          return {
            bind: vi.fn().mockReturnValue({
              all: vi.fn().mockResolvedValue({ results: [], success: true }),
            }),
          } as any;
        }
        return {
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(null),
            all: vi.fn().mockResolvedValue({ results: [], success: true }),
          }),
        } as any;
      });

      const res = await request('GET', '/api/readings', undefined, env);
      
      expect(res.status).toBe(200);
      const data = await res.json() as Reading[];
      expect(data).toHaveLength(0);
    });

    it('should filter by custom tenant when provided', async () => {
      const env = makeEnv();
      const mockDB = env.DB as unknown as D1Database;
      
      vi.mocked(mockDB.prepare).mockImplementation((sql: string) => {
        if (sql.includes('tenant')) {
          return {
            bind: vi.fn().mockImplementation((...args: unknown[]) => {
              // Verify tenant is bound
              expect(args).toContain('custom-tenant');
              return {
                all: vi.fn().mockResolvedValue({ results: [], success: true }),
              };
            }),
          } as any;
        }
        return {
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(null),
            all: vi.fn().mockResolvedValue({ results: [], success: true }),
          }),
        } as any;
      });

      const url = new URL('http://localhost/api/readings');
      url.searchParams.set('tenant', 'custom-tenant');
      
      const req = new Request(url.toString(), { method: 'GET' });
      const res = await listReadings(req, env as { DB: D1Database } & Record<string, unknown>);
      
      expect(res.status).toBe(200);
    });
  });
});
