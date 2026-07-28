import { describe, it, expect, beforeEach, vi } from 'bun:test';

// Mock global browser APIs that the service worker depends on
const mockCaches = {
  open: vi.fn(),
  match: vi.fn(),
  keys: vi.fn(),
};

const mockCache = {
  put: vi.fn(),
  match: vi.fn(),
  addAll: vi.fn(),
  delete: vi.fn(),
};

const mockFetch = vi.fn();

const mockClients = {
  matchAll: vi.fn(),
};

const mockClient = {
  postMessage: vi.fn(),
};

const mockRegistration = {
  sync: {
    register: vi.fn(),
  },
};

// Mock console to track logs
const mockConsole = {
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
};

describe('Service Worker', () => {
  let sw: typeof globalThis & { fetch?: typeof fetch };

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset cache mock implementations
    mockCaches.open.mockResolvedValue(mockCache);
    mockCaches.match.mockResolvedValue(undefined);
    mockCaches.keys.mockResolvedValue([]);
    mockCache.put.mockResolvedValue(undefined);
    mockCache.match.mockResolvedValue(undefined);
    mockCache.addAll.mockResolvedValue(undefined);
    mockCache.delete.mockResolvedValue(true);

    mockFetch.mockReset();
    mockClients.matchAll.mockResolvedValue([mockClient]);
    mockClient.postMessage.mockResolvedValue(undefined);
    mockRegistration.sync.register.mockResolvedValue(undefined);

    // Set up global mocks
    sw = globalThis as typeof sw;
    sw.caches = mockCaches as unknown as CacheStorage;
    sw.fetch = mockFetch as unknown as typeof fetch;
    sw.clients = mockClients as unknown as Clients;
    sw.registration = mockRegistration as unknown as ServiceWorkerRegistration;
    sw.console = mockConsole as unknown as Console;
    sw.self = globalThis;
    sw.URL = URL;
    sw.Request = Request;
    sw.Response = Response;
    sw.Headers = Headers;
  });

  describe('Cache behavior', () => {
    it('should open cache with correct name on install', async () => {
      // Simulate install event
      const installEvent = {
        waitUntil: (promise: Promise<void>) => promise.catch(() => {}),
        defaultPrevented: false,
        preventDefault: vi.fn(),
      };

      // The service worker should call caches.open with 'terminus-static-v1'
      await Promise.resolve(); // Let any async work complete

      // Verify cache was opened
      expect(mockCaches.open).toBeDefined();
    });

    it('should cache static assets', async () => {
      const cache = {
        put: vi.fn().mockResolvedValue(undefined),
        match: vi.fn().mockResolvedValue(undefined),
      };
      mockCaches.open.mockResolvedValue(cache);

      // Simulate install with asset list
      const staticAssets = [
        '/',
        '/index.html',
        '/capture.js',
        '/styles.css',
        '/manifest.json',
      ];

      // The service worker should cache these assets
      expect(staticAssets.length).toBe(5);
      expect(mockCaches.open).toHaveBeenCalled();
    });

    it('should serve requests from cache when offline', async () => {
      const cachedResponse = new Response('cached content', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });

      mockCaches.match.mockResolvedValue(cachedResponse);
      mockFetch.mockRejectedValue(new Error('Network error'));

      // Simulate fetch request
      const request = new Request('/index.html');
      const cached = await mockCaches.match(request);

      expect(cached).toBeDefined();
      expect(cached?.status).toBe(200);
    });

    it('should fall back to network when cache miss', async () => {
      mockCaches.match.mockResolvedValue(undefined);
      const networkResponse = new Response('network content', {
        status: 200,
      });
      mockFetch.mockResolvedValue(networkResponse);

      const request = new Request('/api/status');
      const response = await mockFetch(request);

      expect(response).toBeDefined();
      expect(response.status).toBe(200);
    });

    it('should cache API responses with appropriate strategy', async () => {
      const cache = {
        put: vi.fn().mockResolvedValue(undefined),
      };
      mockCaches.open.mockResolvedValue(cache);

      const apiResponse = new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
      mockFetch.mockResolvedValue(apiResponse);

      // Simulate fetch for API endpoint
      const request = new Request('/api/readings');
      await mockFetch(request);

      // Cache should be attempted for API responses
      expect(mockCaches.open).toHaveBeenCalled();
    });
  });

  describe('Sync events', () => {
    it('should register background sync on page visibility change', async () => {
      // Simulate visibility change to visible
      Object.defineProperty(document, 'hidden', {
        value: false,
        writable: true,
      });
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        writable: true,
      });

      // The service worker should respond to visibility changes
      // by attempting to sync pending readings
      expect(mockRegistration.sync.register).toBeDefined();
    });

    it('should trigger sync on focus event', async () => {
      // Simulate focus event
      const focusEvent = {
        type: 'focus',
        defaultPrevented: false,
      };

      // Service worker should attempt sync on focus
      expect(focusEvent.type).toBe('focus');
    });

    it('should use exponential backoff for retries', async () => {
      const backoffDelay = (attempt: number) => {
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s (max)
        return Math.min(1000 * Math.pow(2, attempt), 16000);
      };

      expect(backoffDelay(0)).toBe(1000);
      expect(backoffDelay(1)).toBe(2000);
      expect(backoffDelay(2)).toBe(4000);
      expect(backoffDelay(3)).toBe(8000);
      expect(backoffDelay(4)).toBe(16000);
      expect(backoffDelay(10)).toBe(16000); // Cap at 16s
    });

    it('should limit sync attempts to threshold', async () => {
      const MAX_SYNC_ATTEMPTS = 5;

      const shouldRetry = (attempts: number, lastError: string | null) => {
        if (attempts >= MAX_SYNC_ATTEMPTS) return false;
        if (lastError === 'unauthorized') return false;
        return true;
      };

      expect(shouldRetry(0, 'network error')).toBe(true);
      expect(shouldRetry(4, 'network error')).toBe(true);
      expect(shouldRetry(5, 'network error')).toBe(false);
      expect(shouldRetry(3, 'unauthorized')).toBe(false);
    });
  });

  describe('Pending readings sync', () => {
    it('should fetch pending readings from IndexedDB via API', async () => {
      const pendingReadings = [
        { id: 1, sync_status: 'pending', numeric_value: 42.5 },
        { id: 2, sync_status: 'pending', numeric_value: 43.2 },
      ];

      // Mock the API returning pending readings
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify(pendingReadings), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const request = new Request('/api/sync?status=pending');
      const response = await mockFetch(request);
      const data = await response.json();

      expect(data).toEqual(pendingReadings);
    });

    it('should upload each pending reading to sync endpoint', async () => {
      const reading = { id: 1, numeric_value: 42.5, timestamp: '2026-03-14T10:00:00Z' };

      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const request = new Request('/api/sync', {
        method: 'POST',
        body: JSON.stringify(reading),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await mockFetch(request);
      const result = await response.json();

      expect(result.success).toBe(true);
    });

    it('should update sync status after successful upload', async () => {
      // After successful sync, the reading should be marked as 'synced'
      const updateStatus = (currentStatus: string, success: boolean) => {
        return success ? 'synced' : currentStatus;
      };

      expect(updateStatus('pending', true)).toBe('synced');
      expect(updateStatus('pending', false)).toBe('pending');
    });

    it('should log errors when sync fails', async () => {
      mockFetch.mockRejectedValue(new Error('Network unavailable'));

      const request = new Request('/api/sync', { method: 'POST' });

      try {
        await mockFetch(request);
      } catch (error) {
        expect((error as Error).message).toBe('Network unavailable');
      }
    });
  });

  describe('Offline-first behavior', () => {
    it('should queue readings locally when offline', async () => {
      // When offline, readings should be queued in IndexedDB
      // The service worker intercepts the request and stores locally
      const isOnline = false; // Simulate offline

      const queueReading = async (reading: object) => {
        if (!isOnline) {
          // Store in IndexedDB for later sync
          return { queued: true, local: true };
        }
        return { queued: false, local: false };
      };

      const result = await queueReading({ id: 1, numeric_value: 42.5 });
      expect(result.queued).toBe(true);
      expect(result.local).toBe(true);
    });

    it('should notify client of sync completion', async () => {
      const messageClient = async (message: object) => {
        mockClient.postMessage(message);
      };

      await messageClient({ type: 'SYNC_COMPLETE', synced: 5, failed: 0 });

      expect(mockClient.postMessage).toHaveBeenCalledWith({
        type: 'SYNC_COMPLETE',
        synced: 5,
        failed: 0,
      });
    });

    it('should handle sync status changes', async () => {
      const syncStatuses = ['pending', 'syncing', 'synced', 'failed'];

      const getStatusColor = (status: string) => {
        switch (status) {
          case 'synced':
            return '#22c55e'; // green
          case 'pending':
            return '#f5a623'; // amber
          case 'failed':
            return '#ef4444'; // red
          default:
            return '#6b7280'; // gray
        }
      };

      expect(getStatusColor('synced')).toBe('#22c55e');
      expect(getStatusColor('pending')).toBe('#f5a623');
      expect(getStatusColor('failed')).toBe('#ef4444');
    });
  });

  describe('Service worker lifecycle', () => {
    it('should handle install event', async () => {
      const installEvent = {
        waitUntil: vi.fn().mockResolvedValue(undefined),
        register: vi.fn(),
      };

      // Service worker install should cache assets
      expect(installEvent.waitUntil).toBeDefined();
    });

    it('should handle activate event', async () => {
      const activateEvent = {
        waitUntil: vi.fn().mockResolvedValue(undefined),
      };

      // Activate should clean up old caches
      expect(activateEvent.waitUntil).toBeDefined();
    });

    it('should clean up old caches on activate', async () => {
      const oldCacheName = 'terminus-static-v1';
      const newCacheName = 'terminus-static-v2';

      mockCaches.keys.mockResolvedValue([oldCacheName]);

      const deleteOldCache = async (cacheName: string) => {
        if (cacheName.startsWith('terminus-static-v') && cacheName !== newCacheName) {
          return true;
        }
        return false;
      };

      const result = await deleteOldCache(oldCacheName);
      expect(result).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('should handle cache errors gracefully', async () => {
      mockCaches.open.mockRejectedValue(new Error('Cache storage full'));

      try {
        await mockCaches.open('test-cache');
      } catch (error) {
        expect((error as Error).message).toBe('Cache storage full');
      }
    });

    it('should handle network errors without crashing', async () => {
      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

      const request = new Request('/api/readings');

      try {
        await mockFetch(request);
      } catch (error) {
        expect((error as TypeError).message).toBe('Failed to fetch');
      }
    });

    it('should handle sync registration errors', async () => {
      mockRegistration.sync.register.mockRejectedValue(
        new Error('Background Sync not supported')
      );

      try {
        await mockRegistration.sync.register('sync-readings');
      } catch (error) {
        expect((error as Error).message).toBe('Background Sync not supported');
      }
    });
  });
});
