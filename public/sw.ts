// Service Worker for Terminus UI – offline‑first static asset caching and network strategies

/** Cache name for static assets */
const CACHE_NAME = "terminus-static-v1" as const;
/** List of assets that should be cached during install */
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/main.tsx",
  "/sw.js",
  "/styles.css",
] as const;

/** Install handler – cache static assets and activate immediately */
self.addEventListener("install", (event: ExtendableEvent) => {
  // Pre‑cache defined static assets.
  const cachePromise = (async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(STATIC_ASSETS);
  })();
  // Ensure the install waits for caching to finish.
  (event as any).waitUntil(cachePromise);
  // Activate this SW without waiting for older versions.
  self.skipWaiting();
});

/** Activate handler – claim clients and delete old caches */
self.addEventListener("activate", (event: ExtendableEvent) => {
  const cleanupPromise = (async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.map((key) => {
        if (key !== CACHE_NAME) {
          return caches.delete(key);
        }
        return Promise.resolve();
      })
    );
    // Take control of all open clients.
    await self.clients.claim();
  })();
  (event as any).waitUntil(cleanupPromise);
});

/** Fetch handler – static assets: cache‑first, API: network‑first, navigation: network‑first with offline fallback */
self.addEventListener("fetch", (event: FetchEvent) => {
  const { request } = event;
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Helper to respond with a cached response if present, otherwise fetch from network.
  const cacheFirst = async (): Promise<Response> => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    const response = await fetch(request);
    if (response && response.ok) {
      // Populate the cache for future use.
      void cache.put(request, response.clone());
    }
    return response;
  };

  // Helper for network‑first strategy with optional offline JSON fallback.
  const networkFirst = async (offlineFallback?: Response): Promise<Response> => {
    try {
      return await fetch(request);
    } catch {
      return offlineFallback ?? new Response("Offline", { status: 503 });
    }
  };

  // Decide strategy based on request characteristics.
  let responsePromise: Promise<Response>;

  // Static assets – use cache‑first.
  if (STATIC_ASSETS.includes(pathname)) {
    responsePromise = cacheFirst();
  } else if (pathname.startsWith("/api/")) {
    // API – network‑first, return a small JSON payload when offline.
    const offlineJson = new Response(
      JSON.stringify({ error: "offline", message: "Data queued for sync" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
    responsePromise = networkFirst(offlineJson);
  } else if (request.mode === "navigate") {
    // Navigation – try network first, fall back to cached root page.
    responsePromise = networkFirst(
      await (async () => {
        const cache = await caches.open(CACHE_NAME);
        const fallback = await cache.match("/");
        return fallback ?? new Response("Offline", { status: 503 });
      })()
    );
  } else {
    // For any other request, just perform a network fetch.
    responsePromise = fetch(request);
  }

  // Respond to the fetch event.
  event.respondWith(responsePromise);
});
