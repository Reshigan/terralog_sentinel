/**
 * offline-queue.ts — IndexedDB-backed offline action queue for Desklog.
 *
 * Every state-changing tap (start visit, confirm end, sign receipt, file override)
 * is captured locally before the network request, with the *original timestamp*
 * preserved so replay uses the user's clock, not the server's. On reconnect the
 * queue drains in order; conflicts surface for one-card resolution rather than
 * silent overwrite.
 *
 * The module is dependency-free (Web APIs only) and typed to the shared contract
 * so it compiles cleanly against src/types.ts without importing it at runtime —
 * the contract is the source of truth, this file conforms.
 */

// ---- Contract types (mirrored from src/types.ts — single source of truth) ----
// These are declared locally because the PWA runs as a static asset in the
// browser with no bundler; the actual contract lives in src/types.ts and is
// the canonical definition. Keep these in sync.

export type ActionType =
  | "start_visit"
  | "confirm_end"
  | "sign_receipt"
  | "file_override"
  | "update_note";

export type ActionStatus = "pending" | "completed" | "failed";

export interface QueuedAction {
  id: string;
  type: ActionType;
  instance_id: string;
  payload: Record<string, unknown>;
  queued_at: number;
  original_timestamp: string;
  retry_count: number;
  status: ActionStatus;
  error_message: string | null;
}

// ---- IndexedDB helpers --------------------------------------------------------

const DB_NAME = "desklog-offline";
const DB_VERSION = 1;
const STORE_NAME = "actions";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("by_status", "status", { unique: false });
        store.createIndex("by_type", "type", { unique: false });
        store.createIndex("by_queued_at", "queued_at", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txStore(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  const transaction = db.transaction(STORE_NAME, mode);
  return transaction.objectStore(STORE_NAME);
}

function promisifyRequest<T>(request: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error);
  });
}

// ---- Validation ---------------------------------------------------------------

const VALID_ACTION_TYPES: Set<string> = new Set<string>([
  "start_visit",
  "confirm_end",
  "sign_receipt",
  "file_override",
  "update_note",
]);

function validateActionInput(input: {
  type: string;
  instance_id: string;
  original_timestamp: string;
}): void {
  if (!input.type || !VALID_ACTION_TYPES.has(input.type)) {
    throw new Error("Invalid or missing action type");
  }
  if (!input.instance_id) {
    throw new Error("Missing instance_id");
  }
  if (!input.original_timestamp) {
    throw new Error("Missing original_timestamp");
  }
}

// ---- Tenant resolution (mirrors app.ts convention) ----------------------------

function tenantPrefix(): string {
  const path = window.location.pathname;
  const match = path.match(/^\/t\/([^/]+)/);
  if (match && match[1]) return `/t/${match[1]}`;
  return "";
}

// ---- Module state ------------------------------------------------------------

let dbInstance: IDBDatabase | null = null;
let initialized = false;
let replayInProgress = false;
let onlineListenerAttached = false;

async function getDB(): Promise<IDBDatabase> {
  if (!dbInstance) {
    dbInstance = await openDB();
  }
  return dbInstance;
}

// ---- Public API ---------------------------------------------------------------

export async function init(): Promise<void> {
  if (initialized) return;
  await getDB();
  initialized = true;

  // Register service worker for PWA
  if (
    "serviceWorker" in navigator &&
    typeof navigator.serviceWorker !== "undefined" &&
    navigator.serviceWorker.register
  ) {
    try {
      await navigator.serviceWorker.register("/sw.js");
    } catch {
      // Service worker registration failure is non-fatal; the queue still works.
    }
  }

  // Auto-replay on reconnect
  if (!onlineListenerAttached && typeof window !== "undefined") {
    window.addEventListener("online", () => {
      void replayActions();
    });
    onlineListenerAttached = true;
  }
}

/**
 * Enqueue an action to be sent when the network is available.
 * Returns the unique action ID.
 */
export async function queueAction(input: {
  type: ActionType;
  instance_id: string;
  payload: Record<string, unknown>;
  original_timestamp: string;
}): Promise<string> {
  validateActionInput(input);

  const id = `action-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const action: QueuedAction = {
    id,
    type: input.type,
    instance_id: input.instance_id,
    payload: input.payload,
    queued_at: Date.now(),
    original_timestamp: input.original_timestamp,
    retry_count: 0,
    status: "pending",
    error_message: null,
  };

  const db = await getDB();
  const store = txStore(db, "readwrite");
  await promisifyRequest<void>(store.add(action));
  return id;
}

/**
 * Retrieve all pending actions, ordered by queued_at ascending.
 */
export async function getPendingActions(): Promise<QueuedAction[]> {
  const db = await getDB();
  const store = txStore(db, "readonly");
  const all: QueuedAction[] = await promisifyRequest<QueuedAction[]>(store.getAll());
  return all
    .filter((a) => a.status === "pending")
    .sort((a, b) => a.queued_at - b.queued_at);
}

/**
 * Mark an action as successfully completed and remove it from the queue.
 */
export async function markCompleted(id: string): Promise<void> {
  const db = await getDB();
  const store = txStore(db, "readwrite");
  const action = await promisifyRequest<QueuedAction | undefined>(store.get(id));
  if (!action) return;
  action.status = "completed";
  await promisifyRequest<void>(store.put(action));
  // Immediately clean up completed actions
  await promisifyRequest<void>(store.delete(id));
}

/**
 * Mark an action as failed, increment retry_count, and store the error message.
 */
export async function markFailed(id: string, error: string): Promise<void> {
  const db = await getDB();
  const store = txStore(db, "readwrite");
  const action = await promisifyRequest<QueuedAction | undefined>(store.get(id));
  if (!action) return;
  action.retry_count += 1;
  action.status = "pending"; // Keep pending for retry
  action.error_message = error;
  await promisifyRequest<void>(store.put(action));
}

/**
 * Replay all pending actions in queue order.
 * Returns the IDs that succeeded and those that failed.
 * Conflict (409) responses surface in the failed list but the action remains
 * pending for manual resolution.
 */
export async function replayActions(): Promise<{
  success: string[];
  failed: string[];
}> {
  if (replayInProgress) return { success: [], failed: [] };
  replayInProgress = true;

  const success: string[] = [];
  const failed: string[] = [];

  try {
    const actions = await getPendingActions();

    for (const action of actions) {
      const prefix = tenantPrefix();
      const url = `${prefix}/api/v1/visits/${action.instance_id}/${action.type.replace("_", "-")}`;

      // Idempotency-Key prevents double-processing on replay.
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Idempotency-Key": action.id,
      };

      const body: Record<string, unknown> = {
        ...action.payload,
        original_timestamp: action.original_timestamp,
      };

      try {
        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });

        if (response.ok) {
          await markCompleted(action.id);
          success.push(action.id);
        } else if (response.status === 409) {
          // Conflict: instance state has diverged, surface for resolution.
          failed.push(action.id);
          // Leave action pending but flag it so UI can detect.
          const db = await getDB();
          const store = txStore(db, "readwrite");
          const current = await promisifyRequest<QueuedAction | undefined>(store.get(action.id));
          if (current) {
            current.error_message = "Conflict: instance state diverged";
            await promisifyRequest<void>(store.put(current));
          }
        } else {
          await markFailed(action.id, `HTTP ${response.status}`);
          failed.push(action.id);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Network error";
        await markFailed(action.id, message);
        failed.push(action.id);
      }
    }
  } finally {
    replayInProgress = false;
  }

  return { success, failed };
}

/**
 * Remove all completed actions from the database.
 */
export async function clearCompleted(): Promise<void> {
  const db = await getDB();
  const store = txStore(db, "readwrite");
  const all: QueuedAction[] = await promisifyRequest<QueuedAction[]>(store.getAll());
  for (const action of all) {
    if (action.status === "completed") {
      await promisifyRequest<void>(store.delete(action.id));
    }
  }
}
