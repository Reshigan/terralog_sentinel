/**
 * Opportunistic sync between IndexedDB and Cloudflare D1.
 * Handles offline-first data synchronization with retry logic.
 */

import type { Env } from "./http";

export interface SyncResult {
  success: number;
  failed: number;
  errors: string[];
}

export interface SyncOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  maxBatchSize?: number;
}

const DEFAULT_OPTIONS: Required<SyncOptions> = {
  maxRetries: 3,
  retryDelayMs: 1000,
  maxBatchSize: 50,
};

/**
 * Opens the IndexedDB database for readings.
 */
function openReadingsDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("terminus-readings", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("readings")) {
        const store = db.createObjectStore("readings", { keyPath: "id" });
        store.createIndex("syncStatus", "syncStatus", { unique: false });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
  });
}

interface SyncableReading {
  id: string;
  photo?: ArrayBuffer;
  latitude: number;
  longitude: number;
  numericValue: number;
  timestamp: string;
  siteId?: number;
  deviceId?: number;
  equipmentId?: number;
  calibrationId?: number;
  notes?: string;
  syncStatus: "pending" | "syncing" | "synced" | "failed";
  syncAttempts: number;
  lastSyncError?: string;
}

/**
 * Gets all unsynced readings from IndexedDB.
 */
async function getUnsyncedReadings(db: IDBDatabase): Promise<SyncableReading[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("readings", "readonly");
    const store = tx.objectStore("readings");
    const index = store.index("syncStatus");
    const request = index.getAll("pending");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

/**
 * Gets readings that previously failed and are eligible for retry.
 */
async function getRetryableReadings(db: IDBDatabase): Promise<SyncableReading[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("readings", "readonly");
    const store = tx.objectStore("readings");
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const all = request.result as SyncableReading[];
      const retryable = all.filter(
        (r) => r.syncStatus === "failed" && r.syncAttempts < DEFAULT_OPTIONS.maxRetries
      );
      resolve(retryable);
    };
  });
}

/**
 * Updates a reading's sync status in IndexedDB.
 */
async function updateReadingStatus(
  db: IDBDatabase,
  id: string,
  status: SyncableReading["syncStatus"],
  error?: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("readings", "readwrite");
    const store = tx.objectStore("readings");
    const getReq = store.get(id);
    getReq.onerror = () => reject(getReq.error);
    getReq.onsuccess = () => {
      const record = getReq.result as SyncableReading;
      if (record) {
        record.syncStatus = status;
        if (status === "syncing") {
          record.syncAttempts += 1;
        }
        if (error) {
          record.lastSyncError = error;
        }
        const putReq = store.put(record);
        putReq.onerror = () => reject(putReq.error);
        putReq.onsuccess = () => resolve();
      } else {
        resolve();
      }
    };
  });
}

/**
 * Submits a single reading to the D1 API.
 */
async function submitReading(
  reading: SyncableReading,
  baseUrl: string
): Promise<{ ok: boolean; error?: string }> {
  const formData = new FormData();
  formData.append("latitude", String(reading.latitude));
  formData.append("longitude", String(reading.longitude));
  formData.append("numeric_value", String(reading.numericValue));
  formData.append("timestamp", reading.timestamp);

  if (reading.photo) {
    const blob = new Blob([reading.photo], { type: "image/jpeg" });
    formData.append("photo", blob, "photo.jpg");
  }
  if (reading.siteId) {
    formData.append("site_id", String(reading.siteId));
  }
  if (reading.deviceId) {
    formData.append("device_id", String(reading.deviceId));
  }
  if (reading.equipmentId) {
    formData.append("equipment_id", String(reading.equipmentId));
  }
  if (reading.calibrationId) {
    formData.append("calibration_id", String(reading.calibrationId));
  }
  if (reading.notes) {
    formData.append("notes", reading.notes);
  }

  try {
    const response = await fetch(`${baseUrl}/api/readings`, {
      method: "POST",
      body: formData,
    });

    if (response.ok) {
      return { ok: true };
    }

    const errorText = await response.text().catch(() => "Unknown error");
    return { ok: false, error: `HTTP ${response.status}: ${errorText}` };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Network error";
    return { ok: false, error: message };
  }
}

/**
 * Calculates exponential backoff delay.
 */
function getRetryDelay(attempt: number, baseDelay: number): number {
  return Math.min(baseDelay * Math.pow(2, attempt), 30000);
}

/**
 * Main sync function: pushes unsynced readings from IndexedDB to D1.
 * Runs opportunistically when network is available.
 */
export async function syncReadings(
  env: Env,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const result: SyncResult = {
    success: 0,
    failed: 0,
    errors: [],
  };

  // Check network availability
  if (!navigator.onLine) {
    result.errors.push("No network connection");
    return result;
  }

  let db: IDBDatabase;
  try {
    db = await openReadingsDB();
  } catch (e) {
    result.errors.push(`Failed to open IndexedDB: ${e instanceof Error ? e.message : "unknown"}`);
    return result;
  }

  // Get pending readings
  let pendingReadings: SyncableReading[];
  try {
    pendingReadings = await getUnsyncedReadings(db);
  } catch (e) {
    result.errors.push(`Failed to query IndexedDB: ${e instanceof Error ? e.message : "unknown"}`);
    return result;
  }

  // Get retryable failed readings
  let retryableReadings: SyncableReading[];
  try {
    retryableReadings = await getRetryableReadings(db);
  } catch (e) {
    result.errors.push(`Failed to query retryable: ${e instanceof Error ? e.message : "unknown"}`);
    return result;
  }

  // Combine and limit batch size
  const allToSync = [...pendingReadings, ...retryableReadings].slice(0, opts.maxBatchSize);

  if (allToSync.length === 0) {
    return result;
  }

  // Determine base URL from current location
  const baseUrl = `${location.protocol}//${location.host}`;

  // Process each reading
  for (const reading of allToSync) {
    // Mark as syncing
    await updateReadingStatus(db, reading.id, "syncing");

    // Attempt submission with retries
    let submitted = false;
    let lastError = "Unknown error";

    for (let attempt = 0; attempt <= opts.maxRetries && !submitted; attempt++) {
      if (attempt > 0) {
        // Wait before retry (but not on first attempt)
        const delay = getRetryDelay(attempt - 1, opts.retryDelayMs);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      // Check network before each attempt
      if (!navigator.onLine) {
        lastError = "Network lost during sync";
        break;
      }

      const submitResult = await submitReading(reading, baseUrl);
      if (submitResult.ok) {
        submitted = true;
      } else {
        lastError = submitResult.error || "Submission failed";
      }
    }

    if (submitted) {
      await updateReadingStatus(db, reading.id, "synced");
      result.success++;
    } else {
      // Check if it's a permanent failure (4xx) or retryable (5xx/network)
      const isPermanent = lastError.startsWith("HTTP 4");
      if (isPermanent || reading.syncAttempts >= opts.maxRetries) {
        await updateReadingStatus(db, reading.id, "failed", lastError);
        result.failed++;
        result.errors.push(`Failed to sync reading ${reading.id}: ${lastError}`);
      } else {
        // Reset to pending for next sync cycle
        await updateReadingStatus(db, reading.id, "pending", lastError);
        result.failed++;
      }
    }
  }

  return result;
}

/**
 * Gets the count of pending (unsynced) readings in IndexedDB.
 */
export async function getPendingCount(): Promise<number> {
  try {
    const db = await openReadingsDB();
    const readings = await getUnsyncedReadings(db);
    return readings.length;
  } catch {
    return 0;
  }
}

/**
 * Gets sync status summary for all readings.
 */
export async function getSyncStatus(): Promise<{
  pending: number;
  syncing: number;
  synced: number;
  failed: number;
}> {
  try {
    const db = await openReadingsDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("readings", "readonly");
      const store = tx.objectStore("readings");
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const readings = request.result as SyncableReading[];
        const status = {
          pending: 0,
          syncing: 0,
          synced: 0,
          failed: 0,
        };
        for (const r of readings) {
          if (r.syncStatus in status) {
            status[r.syncStatus as keyof typeof status]++;
          }
        }
        resolve(status);
      };
    });
  } catch {
    return { pending: 0, syncing: 0, synced: 0, failed: 0 };
  }
}

/**
 * Sets up online/offline event listeners for automatic sync.
 */
export function setupAutoSync(
  env: Env,
  options: SyncOptions = {}
): () => void {
  const syncOnOnline = async () => {
    // Small delay to ensure connection is stable
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (navigator.onLine) {
      await syncReadings(env, options);
    }
  };

  // Sync when coming back online
  window.addEventListener("online", syncOnOnline);

  // Periodic sync every 5 minutes when online
  const intervalId = setInterval(() => {
    if (navigator.onLine) {
      syncReadings(env, options).catch(() => {
        // Silently fail periodic syncs
      });
    }
  }, 5 * 60 * 1000);

  // Return cleanup function
  return () => {
    window.removeEventListener("online", syncOnOnline);
    clearInterval(intervalId);
  };
}
