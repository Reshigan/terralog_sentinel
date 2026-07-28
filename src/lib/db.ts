/**
 * IndexedDB wrapper for offline-first field readings.
 * Provides local persistence before sync to the edge.
 */

import type { Reading } from "../types";

const DB_NAME = "terminus-readings";
const DB_VERSION = 1;
const STORE_NAME = "readings";

export interface StoredReading {
  id: string;
  photo: ArrayBuffer | null;
  gps: { lat: number; lng: number } | null;
  value: number;
  timestamp: string;
  synced: boolean;
  siteId: number | null;
  deviceId: number | null;
  equipmentId: number | null;
  calibrationId: number | null;
  notes: string;
  createdAt: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!typeof window || !window.indexedDB) {
      reject(new Error("IndexedDB not available"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("synced", "synced", { unique: false });
        store.createIndex("timestamp", "timestamp", { unique: false });
        store.createIndex("siteId", "siteId", { unique: false });
      }
    };
  });
}

/**
 * Get all readings from local storage.
 * @throws Error on database failure
 */
export async function getAllReadings(): Promise<StoredReading[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error("Failed to get readings"));
  });
}

/**
 * Get a single reading by ID.
 * @param id - The reading ID
 * @throws Error on database failure
 */
export async function getReading(id: string): Promise<StoredReading | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to get reading"));
  });
}

/**
 * Get readings by sync status.
 * @param synced - Filter by synced status
 * @throws Error on database failure
 */
export async function getReadingsBySyncStatus(synced: boolean): Promise<StoredReading[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("synced");
    const request = index.getAll(synced);

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error("Failed to get readings by sync status"));
  });
}

/**
 * Save a new reading to local storage.
 * @param reading - The reading to save
 * @throws Error on database failure
 */
export async function saveReading(reading: StoredReading): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add(reading);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error("Failed to save reading"));
  });
}

/**
 * Update an existing reading.
 * @param reading - The reading with updated fields
 * @throws Error on database failure or if reading not found
 */
export async function updateReading(reading: StoredReading): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(reading);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error("Failed to update reading"));
  });
}

/**
 * Mark a reading as synced.
 * @param id - The reading ID
 * @throws Error on database failure
 */
export async function markAsSynced(id: string): Promise<void> {
  const reading = await getReading(id);
  if (!reading) {
    throw new Error("Reading not found");
  }
  reading.synced = true;
  await updateReading(reading);
}

/**
 * Delete a reading by ID.
 * @param id - The reading ID
 * @throws Error on database failure
 */
export async function deleteReading(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error("Failed to delete reading"));
  });
}

/**
 * Get count of pending (unsynced) readings.
 * @throws Error on database failure
 */
export async function getPendingCount(): Promise<number> {
  const pending = await getReadingsBySyncStatus(false);
  return pending.length;
}

/**
 * Clear all readings from local storage.
 * @throws Error on database failure
 */
export async function clearAllReadings(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error("Failed to clear readings"));
  });
}
