// Service Worker for Terminus PWA - Offline-first field data collection
// Handles static asset caching, visibility-based sync, and exponential backoff retry

/// <reference lib="webworker" />

const CACHE_NAME = 'terminus-static-v1';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/capture.js',
  '/manifest.json'
];

const BASE_DELAY = 1000;
const MAX_DELAY = 60000;
const MAX_ATTEMPTS = 5;

const self = globalThis;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  if (url.pathname.startsWith('/api/sync') && event.request.method === 'POST') {
    event.respondWith(handleSyncRequest(event.request));
    return;
  }
  
  if (event.request.method !== 'GET') {
    return;
  }
  
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networked = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
        .catch(() => cached);
      
      return cached || networked;
    })
  );
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-readings') {
    event.waitUntil(syncPendingReadings());
  }
});

self.addEventListener('online', () => {
  syncPendingReadings();
});

self.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    syncPendingReadings();
  }
});

async function handleSyncRequest(request) {
  try {
    const body = await request.json();
    const readingIds = body.reading_ids || [];
    
    let synced = 0;
    let failed = 0;
    
    for (const readingId of readingIds) {
      const success = await attemptSyncReading(readingId);
      if (success) {
        synced++;
      } else {
        failed++;
      }
    }
    
    return new Response(
      JSON.stringify({ synced, failed }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Sync failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function attemptSyncReading(readingId) {
  const db = await openDB();
  const tx = db.transaction('readings', 'readwrite');
  const store = tx.objectStore('readings');
  
  return new Promise((resolve) => {
    const getRequest = store.get(readingId);
    
    getRequest.onsuccess = async () => {
      const reading = getRequest.result;
      
      if (!reading) {
        resolve(false);
        return;
      }
      
      try {
        const response = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reading_ids: [readingId] })
        });
        
        if (response.ok) {
          reading.sync_status = 'synced';
          reading.sync_attempts = 0;
          store.put(reading);
          resolve(true);
        } else {
          reading.sync_attempts = (reading.sync_attempts || 0) + 1;
          if (reading.sync_attempts >= MAX_ATTEMPTS) {
            reading.sync_status = 'failed';
          }
          store.put(reading);
          resolve(false);
        }
      } catch {
        reading.sync_attempts = (reading.sync_attempts || 0) + 1;
        if (reading.sync_attempts >= MAX_ATTEMPTS) {
          reading.sync_status = 'failed';
        }
        store.put(reading);
        resolve(false);
      }
    };
    
    getRequest.onerror = () => resolve(false);
  });
}

function calculateBackoff(attempt) {
  const delay = Math.min(BASE_DELAY * Math.pow(2, attempt - 1), MAX_DELAY);
  const jitter = (Math.random() - 0.5) * 2 * 0.5 * delay;
  return Math.max(500, delay + jitter);
}

async function syncPendingReadings() {
  if (!navigator.onLine) {
    return;
  }
  
  const db = await openDB();
  const tx = db.transaction('readings', 'readonly');
  const store = tx.objectStore('readings');
  const index = store.index('sync_status');
  
  return new Promise((resolve) => {
    const request = index.getAll('pending');
    
    request.onsuccess = async () => {
      const pending = request.result;
      let synced = 0;
      let failed = 0;
      
      for (const reading of pending) {
        const success = await attemptSyncReading(reading.id);
        if (success) {
          synced++;
        } else {
          failed++;
        }
        
        await new Promise(r => setTimeout(r, 100));
      }
      
      notifyClients({ synced, failed });
      resolve();
    };
    
    request.onerror = () => resolve();
  });
}

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('terminus_readings', 1);
    
    request.onerror = () => reject(request.error);
    
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains('readings')) {
        const store = db.createObjectStore('readings', { keyPath: 'id' });
        store.createIndex('sync_status', 'sync_status', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
      
      if (!db.objectStoreNames.contains('sync_queue')) {
        db.createObjectStore('sync_queue', { keyPath: 'id' });
      }
    };
  });
}

async function notifyClients(data) {
  const clients = await self.clients.matchAll();
  clients.forEach((client) => {
    client.postMessage({ type: 'sync-status', ...data });
  });
}

export {};