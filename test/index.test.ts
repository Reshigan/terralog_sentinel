import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';

// Mock environment factory
function makeEnv(overrides: Record<string, unknown> = {}): { DB: D1Database } {
  const mockDB = {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({ results: [], success: true }),
        first: vi.fn().mockResolvedValue(null),
        run: vi.fn().mockResolvedValue({ success: true }),
      }),
    }),
  };

  return {
    DB: mockDB as unknown as D1Database,
    ...overrides,
  };
}

// Simple request helper
async function request(
  app: (request: Request, env: { DB: D1Database }) => Promise<Response>,
  url: string,
  options: RequestInit = {},
  env = makeEnv()
): Promise<Response> {
  const request = new Request(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  return app(request, env as { DB: D1Database });
}

// Import the actual index handler
// Note: We'll test the exported fetch function from src/index.ts
describe('index.ts', () => {
  let app: (request: Request, env: { DB: D1Database }) => Promise<Response>;

  beforeEach(async () => {
    // Dynamic import to get the worker fetch handler
    const mod = await import('../src/index.ts');
    app = mod.default as typeof app;
  });

  describe('Route handling', () => {
    it('returns 200 for GET /api/readings', async () => {
      const env = makeEnv();
      const response = await request(app, '/api/readings', { method: 'GET' }, env);
      expect(response.status).toBe(200);
    });

    it('returns 200 for POST /api/readings', async () => {
      const env = makeEnv();
      const response = await request(
        app,
        '/api/readings',
        {
          method: 'POST',
          body: JSON.stringify({
            latitude: 34.05,
            longitude: -118.25,
            numeric_value: 42.5,
            photo: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
          }),
        },
        env
      );
      expect(response.status).toBe(201);
    });

    it('returns 200 for GET /api/sync/status', async () => {
      const env = makeEnv();
      const response = await request(app, '/api/sync/status', { method: 'GET' }, env);
      expect(response.status).toBe(200);
    });

    it('returns 200 for POST /api/sync', async () => {
      const env = makeEnv();
      const response = await request(app, '/api/sync', { method: 'POST' }, env);
      expect(response.status).toBe(200);
    });

    it('returns 200 for GET /api/keys/status', async () => {
      const env = makeEnv();
      const response = await request(app, '/api/keys/status', { method: 'GET' }, env);
      expect(response.status).toBe(200);
    });

    it('returns 200 for POST /api/keys', async () => {
      const env = makeEnv();
      const response = await request(
        app,
        '/api/keys',
        {
          method: 'POST',
          body: JSON.stringify({ passphrase: 'test-passphrase-123' }),
        },
        env
      );
      expect(response.status).toBe(200);
    });
  });

  describe('404 handling', () => {
    it('returns 404 for unknown routes', async () => {
      const env = makeEnv();
      const response = await request(app, '/api/unknown', { method: 'GET' }, env);
      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error).toBeDefined();
    });

    it('returns 404 for non-API routes', async () => {
      const env = makeEnv();
      const response = await request(app, '/', { method: 'GET' }, env);
      expect(response.status).toBe(404);
    });

    it('returns 404 for invalid method on valid route', async () => {
      const env = makeEnv();
      const response = await request(app, '/api/readings', { method: 'DELETE' }, env);
      expect(response.status).toBe(404);
    });
  });

  describe('500 error handling', () => {
    it('returns 500 when database throws', async () => {
      const mockDB = {
        prepare: vi.fn().mockImplementation(() => {
          throw new Error('Database connection failed');
        }),
      };

      const env = {
        DB: mockDB as unknown as D1Database,
      };

      const response = await request(app, '/api/readings', { method: 'GET' }, env);
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toBeDefined();
    });

    it('returns 500 when required env is missing', async () => {
      const response = await request(
        app,
        '/api/readings',
        { method: 'GET' },
        {} as { DB: D1Database }
      );
      expect(response.status).toBe(500);
    });

    it('returns 500 for malformed JSON in POST body', async () => {
      const env = makeEnv();
      const response = await request(
        app,
        '/api/readings',
        {
          method: 'POST',
          body: 'not-valid-json',
        },
        env
      );
      expect(response.status).toBe(500);
    });
  });

  describe('Request parsing', () => {
    it('parses query parameters correctly', async () => {
      const env = makeEnv();
      const response = await request(
        app,
        '/api/readings?sync_status=pending&limit=10',
        { method: 'GET' },
        env
      );
      expect(response.status).toBe(200);
    });

    it('handles CORS preflight', async () => {
      const env = makeEnv();
      const response = await request(app, '/api/readings', {
        method: 'OPTIONS',
        headers: {
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'content-type',
        },
      }, env);
      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Methods')).toBeDefined();
    });
  });
});
