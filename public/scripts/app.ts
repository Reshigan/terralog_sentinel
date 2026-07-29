// public/scripts/app.ts — Frontend controller for the Desklog Now Board.
// Fetches board data, renders the vertical timeline, handles keyboard nav,
// and delegates offline actions to the queue module.

import type { NowBoardResponse, VisitInstanceStatus, DriftState, QueuedAction, ActionType } from "../../src/types";
import { OfflineQueue } from "./offline-queue";

// ─── Constants ──────────────────────────────────────────────────────────────

const DB_NAME = "desklog-offline";
const DB_VERSION = 1;
const STORE_NAME = "actions";
const MAX_RETRIES = 5;
const RETRY_BACKOFF_MS = 2000;

// Drift-state → (border-style, label-text, accent indicator)
const DRIFT_RENDER: Record<
  DriftState,
  { borderStyle: string; label: string; accent: string }
> = {
  on_time:                { borderStyle: "solid",  label: "On time",             accent: "var(--c-ok)" },
  early_start:            { borderStyle: "solid",  label: "Early",                accent: "var(--c-ok)" },
  late_start:             { borderStyle: "dashed", label: "Late start",          accent: "var(--c-warn)" },
  late_start_on_time_end: { borderStyle: "dashed", label: "Late start, on-time end", accent: "var(--c-warn)" },
  missed:                 { borderStyle: "dotted", label: "Missed",              accent: "var(--c-danger)" },
};

const STATUS_LABELS: Record<VisitInstanceStatus, string> = {
  scheduled:   "Scheduled",
  due:         "Due",
  in_progress: "In progress",
  completed:   "Completed",
  missed:      "Missed",
  disputed:    "Disputed",
  archived:    "Archived",
};

const VALID_ACTION_TYPES: Set<ActionType> = new Set([
  "start_visit",
  "confirm_end",
  "sign_receipt",
  "file_override",
  "update_note",
]);

// ─── Helpers ────────────────────────────────────────────────────────────────

function tenantFromPath(): string {
  const parts = window.location.pathname.split("/");
  const tIdx = parts.indexOf("t");
  if (tIdx >= 0 && parts.length > tIdx + 1) return parts[tIdx + 1];
  return "";
}

function nowBoardUrl(tenant: string, date?: string): string {
  const base = `/t/${tenant}/api/v1/now-board`;
  return date ? `${base}?date=${encodeURIComponent(date)}` : base;
}

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
  } catch {
    return iso;
  }
}

function fmtDrift(seconds: number): string {
  if (seconds === 0) return "";
  const abs = Math.abs(seconds);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  const sign = seconds > 0 ? "+" : "−";
  if (m === 0) return `${sign}${s}s`;
  return `${sign}${m}m${s > 0 ? s + "s" : ""}`;
}

function esc(str: string): string {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

function generateId(): string {
  return `act-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function csrfToken(): string {
  const m = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : "";
}

// ─── App State ───────────────────────────────────────────────────────────────

interface SlotEntry {
  instance_id: string;
  element: HTMLElement;
}

const state: {
  currentFocusIndex: number;
  slots: SlotEntry[];
  data: NowBoardResponse | null;
  tenant: string;
  loading: boolean;
  error: string | null;
} = {
  currentFocusIndex: -1,
  slots: [],
  data: null,
  tenant: tenantFromPath(),
  loading: false,
  error: null,
};

const queue = new OfflineQueue();

// ─── DOM Rendering ───────────────────────────────────────────────────────────

function getBoard(): HTMLElement | null {
  return document.getElementById("now-board");
}

function renderLoading(board: HTMLElement): void {
  board.innerHTML =
    '<div class="board-skeleton" aria-busy="true" aria-label="Loading today\'s visits">' +
    '<div class="skel skel--slot"></div>'.repeat(3) +
    "</div>";
}

function renderEmpty(board: HTMLElement): void {
  board.innerHTML =
    '<div class="board-empty" role="status">' +
    '<svg class="board-empty__icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' +
    "<p>No visits scheduled for today.</p>" +
    "<p class=\"board-empty__hint\">Connect a calendar or add a visit to get started.</p>" +
    "</div>";
}

function renderError(board: HTMLElement, message: string): void {
  board.innerHTML =
    '<div class="board-error" role="alert">' +
    "<p>Unable to load the Now Board.</p>" +
    `<p class="board-error__detail">${esc(message)}</p>` +
    '<button class="btn btn--retry" type="button" aria-label="Retry loading">Retry</button>' +
    "</div>";
  const retryBtn = board.querySelector<HTMLButtonElement>(".btn--retry");
  if (retryBtn) retryBtn.addEventListener("click", () => void fetchNowBoard());
}

function buildSlot(
  slot: NowBoardResponse["slots"][number],
  reducedMotion: boolean,
): HTMLElement {
  const el = document.createElement("article");
  el.setAttribute("role", "article");
  el.setAttribute("aria-label", `${slot.vendor_name}, ${fmtTime(slot.scheduled_start_at)}`);
  el.dataset.instanceId = slot.instance_id;
  el.dataset.status = slot.status;
  el.dataset.driftState = slot.drift_state;

  const drift = DRIFT_RENDER[slot.drift_state] ?? DRIFT_RENDER.on_time;
  const isCompleted = slot.status === "completed" || slot.receipt_status === "sealed";

  el.className = isCompleted
    ? "slot slot--completed"
    : `slot slot--${slot.status}`;

  el.style.borderStyle = drift.borderStyle;
  if (!reducedMotion && (slot.status === "due" || slot.drift_state === "late_start")) {
    el.classList.add("slot--pulse");
  }

  const accent = isCompleted ? "var(--c-ok)" : drift.accent;
  el.style.borderLeftColor = accent;

  // Scheduled time
  const timeEl = document.createElement("span");
  timeEl.className = "slot__time";
  timeEl.textContent = fmtTime(slot.scheduled_start_at);
  el.appendChild(timeEl);

  // Vendor + service
  const titleEl = document.createElement("span");
  titleEl.className = "slot__vendor";
  titleEl.textContent = `${slot.vendor_name} · ${slot.service_type}`;
  el.appendChild(titleEl);

  // Drift label
  if (slot.drift_seconds !== 0) {
    const driftEl = document.createElement("span");
    driftEl.className = "slot__drift";
    driftEl.textContent = `${drift.label} (${fmtDrift(slot.drift_seconds)})`;
    el.appendChild(driftEl);
  } else if (slot.status !== "completed") {
    const driftEl = document.createElement("span");
    driftEl.className = "slot__drift";
    driftEl.textContent = drift.label;
    el.appendChild(driftEl);
  }

  // Status badge
  const statusEl = document.createElement("span");
  statusEl.className = "slot__status";
  statusEl.textContent = STATUS_LABELS[slot.status] || slot.status;
  el.appendChild(statusEl);

  // Sealed receipt check
  if (slot.receipt_status === "sealed") {
    const checkEl = document.createElement("span");
    checkEl.className = "slot__check";
    checkEl.setAttribute("aria-label", "Receipt sealed");
    // Minimal SVG checkmark icon
    checkEl.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    el.appendChild(checkEl);
  }

  // Action button
  const actionBtn = document.createElement("button");
  actionBtn.type = "button";
  actionBtn.className = "slot__action btn";
  actionBtn.style.minWidth = "44px";
  actionBtn.style.minHeight = "44px";

  if (slot.status === "scheduled" || slot.status === "due") {
    actionBtn.textContent = "Start";
    actionBtn.setAttribute("aria-label", `Start visit for ${slot.vendor_name}`);
    actionBtn.dataset.action = "start";
  } else if (slot.status === "in_progress") {
    actionBtn.textContent = "Confirm end";
    actionBtn.setAttribute("aria-label", `Confirm end of visit for ${slot.vendor_name}`);
    actionBtn.dataset.action = "confirm-end";
  } else {
    actionBtn.textContent = "View";
    actionBtn.setAttribute("aria-label", `View details for ${slot.vendor_name}`);
    actionBtn.dataset.action = "view";
  }

  el.appendChild(actionBtn);
  return el;
}

function buildTimeIndicator(currentTime: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "now-line";
  el.dataset.timeIndicator = "true";
  el.setAttribute("aria-hidden", "true");
  el.textContent = fmtTime(currentTime);
  return el;
}

function renderTimeline(data: NowBoardResponse): void {
  const board = getBoard();
  if (!board) return;
  state.data = data;
  state.slots = [];
  board.innerHTML = "";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (data.slots.length === 0) {
    renderEmpty(board);
    return;
  }

  const sorted = [...data.slots].sort(
    (a, b) => new Date(a.scheduled_start_at).getTime() - new Date(b.scheduled_start_at).getTime(),
  );

  for (const slot of sorted) {
    const el = buildSlot(slot, reducedMotion);
    board.appendChild(el);
    state.slots.push({ instance_id: slot.instance_id, element: el });
  }

  // Time indicator
  const indicator = buildTimeIndicator(data.current_time);
  board.appendChild(indicator);

  // Sync status footer
  const footer = document.createElement("div");
  footer.className = "board-sync";
  footer.setAttribute("role", "status");
  footer.textContent = `Last sync: ${fmtTime(data.sync_status.last_sync_at)}`;
  board.appendChild(footer);
}

// ─── Data Fetching ───────────────────────────────────────────────────────────

async function fetchNowBoard(date?: string): Promise<void> {
  const board = getBoard();
  if (!board) return;

  if (state.loading) return;
  state.loading = true;
  state.error = null;
  renderLoading(board);

  const url = nowBoardUrl(state.tenant, date);
  const headers: Record<string, string> = { Accept: "application/json" };
  const csrf = csrfToken();
  if (csrf) headers["X-CSRF-Token"] = csrf;

  try {
    const res = await fetch(url, { headers });

    if (res.status === 401) {
      window.location.href = "/login";
      return;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${text}`);
    }

    const body: NowBoardResponse = await res.json();

    // Basic contract validation
    if (typeof body.date !== "string" || !Array.isArray(body.slots)) {
      throw new Error("Invalid response format");
    }

    renderTimeline(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    state.error = message;

    if (!navigator.onLine) {
      // Offline: try to render from cache if available
      const cached = window.localStorage.getItem("desklog-now-board-cache");
      if (cached) {
        try {
          const cachedData: NowBoardResponse = JSON.parse(cached);
          renderTimeline(cachedData);
        } catch {
          renderError(board, message);
        }
      } else {
        renderError(board, message);
      }
    } else {
      renderError(board, message);
    }
  } finally {
    state.loading = false;
  }
}

// ─── Slot Actions ───────────────────────────────────────────────────────────

async function activateSlot(instanceId: string): Promise<void> {
  const slotData = state.data?.slots.find((s) => s.instance_id === instanceId);
  if (!slotData) return;

  const actionType: ActionType | null =
    slotData.status === "scheduled" || slotData.status === "due"
      ? "start_visit"
      : slotData.status === "in_progress"
        ? "confirm_end"
        : null;

  if (!actionType) return; // "view" actions handled differently

  const payload: Record<string, unknown> = {
    actual_start_at: new Date().toISOString(),
  };

  if (!navigator.onLine) {
    await queue.queueAction({
      type: actionType,
      instance_id: instanceId,
      payload,
      original_timestamp: new Date().toISOString(),
    });
    // Optimistically update UI
    if (state.data) {
      for (const s of state.data.slots) {
        if (s.instance_id === instanceId) {
          s.status = actionType === "start_visit" ? "in_progress" : s.status;
          break;
        }
      }
      renderTimeline(state.data);
    }
    return;
  }

  // Online: send immediately
  const url = `/t/${state.tenant}/api/v1/visits/${encodeURIComponent(instanceId)}/${actionType === "start_visit" ? "start" : "confirm-end"}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Idempotency-Key": generateId(),
  };
  const csrf = csrfToken();
  if (csrf) headers["X-CSRF-Token"] = csrf;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...payload, original_timestamp: new Date().toISOString() }),
    });

    if (res.status === 409) {
      // Conflict: server state differs, surface to user
      const body = await res.json().catch(() => ({}));
      handleConflict(instanceId, body);
      return;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${text}`);
    }

    // Refresh board
    await fetchNowBoard();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    // Fallback to queue
    await queue.queueAction({
      type: actionType,
      instance_id: instanceId,
      payload,
      original_timestamp: new Date().toISOString(),
    });
    // Show brief error toast
    showToast(`Action queued for retry: ${message}`);
  }
}

function handleConflict(instanceId: string, serverState: Record<string, unknown>): void {
  const board = getBoard();
  if (!board) return;
  const slot = state.data?.slots.find((s) => s.instance_id === instanceId);
  if (!slot) return;

  // Show inline conflict notice
  const existing = board.querySelector(`[data-instance-id="${CSS.escape(instanceId)}"] .slot__conflict`);
  if (existing) existing.remove();

  const notice = document.createElement("div");
  notice.className = "slot__conflict";
  notice.setAttribute("role", "alert");
  notice.textContent = `Conflict: server shows status "${String(serverState.status ?? "unknown")}". Refresh to update.`;
  const slotEl = board.querySelector(`[data-instance-id="${CSS.escape(instanceId)}"]`);
  slotEl?.appendChild(notice);
}

function showToast(message: string): void {
  const existing = document.getElementById("desklog-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "desklog-toast";
  toast.className = "toast";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 4000);
}

// ─── Keyboard Navigation ─────────────────────────────────────────────────────

function navigateSlot(direction: "next" | "prev"): void {
  if (state.slots.length === 0) return;

  if (direction === "next") {
    state.currentFocusIndex =
      state.currentFocusIndex < state.slots.length - 1
        ? state.currentFocusIndex + 1
        : 0;
  } else {
    state.currentFocusIndex =
      state.currentFocusIndex > 0
        ? state.currentFocusIndex - 1
        : state.slots.length - 1;
  }

  const target = state.slots[state.currentFocusIndex];
  if (target) {
    target.element.focus();
    target.element.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function handleKeyDown(e: KeyboardEvent): void {
  const board = getBoard();
  if (!board) return;

  if (e.key === "ArrowDown" || e.key === "j") {
    e.preventDefault();
    navigateSlot("next");
  } else if (e.key === "ArrowUp" || e.key === "k") {
    e.preventDefault();
    navigateSlot("prev");
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (state.currentFocusIndex >= 0 && state.currentFocusIndex < state.slots.length) {
      const slot = state.slots[state.currentFocusIndex];
      if (slot) void activateSlot(slot.instance_id);
    }
  }
}

// ─── Offline Queue ────────────────────────────────────────────────────────────

class OfflineQueue {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("by_status", "status");
          store.createIndex("by_type", "type");
          store.createIndex("by_queued_at", "queued_at");
        }
      };
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  async queueAction(
    action: Omit<QueuedAction, "id" | "queued_at" | "retry_count" | "status">,
  ): Promise<string> {
    if (!action.type || !VALID_ACTION_TYPES.has(action.type)) {
      throw new Error("Invalid or missing action type");
    }
    if (!action.instance_id || action.instance_id.trim() === "") {
      throw new Error("Invalid or missing instance_id");
    }
    if (!action.original_timestamp || action.original_timestamp.trim() === "") {
      throw new Error("Invalid or missing original_timestamp");
    }

    const id = generateId();
    const queuedAction: QueuedAction = {
      id,
      type: action.type,
      instance_id: action.instance_id,
      payload: action.payload,
      queued_at: Date.now(),
      original_timestamp: action.original_timestamp,
      retry_count: 0,
      status: "pending",
    };

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }
      const tx = this.db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.add(queuedAction);
      req.onsuccess = () => resolve(id);
      req.onerror = () => reject(req.error);
    });
  }

  async getPendingActions(): Promise<QueuedAction[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }
      const tx = this.db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const index = store.index("by_status");
      const req = index.getAll("pending");
      req.onsuccess = () => {
        const results = (req.result as QueuedAction[]).sort(
          (a, b) => a.queued_at - b.queued_at,
        );
        resolve(results);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async markCompleted(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }
      const tx = this.db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const action = getReq.result as QueuedAction | undefined;
        if (!action) {
          resolve();
          return;
        }
        const deleteReq = store.delete(id);
        deleteReq.onsuccess = () => resolve();
        deleteReq.onerror = () => reject(deleteReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }

  async markFailed(id: string, error: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }
      const tx = this.db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const action = getReq.result as QueuedAction | undefined;
        if (!action) {
          resolve();
          return;
        }
        action.retry_count += 1;
        action.status = "pending";
        action.error = error;
        const putReq = store.put(action);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }

  async replayActions(): Promise<{ success: string[]; failed: string[] }> {
    const pending = await this.getPendingActions();
    const success: string[] = [];
    const failed: string[] = [];

    for (const action of pending) {
      if (action.retry_count >= MAX_RETRIES) {
        await this.markCompleted(action.id);
        failed.push(action.id);
        continue;
      }

      const endpoint =
        action.type === "start_visit"
          ? "start"
          : action.type === "confirm_end"
            ? "confirm-end"
            : action.type === "sign_receipt"
              ? "sign"
              : action.type === "file_override"
                ? "override"
                : "update-note";

      const url = `/t/${state.tenant}/api/v1/visits/${encodeURIComponent(action.instance_id)}/${endpoint}`;
      const idempotencyKey = action.id;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      };
      const csrf = csrfToken();
      if (csrf) headers["X-CSRF-Token"] = csrf;

      try {
        const res = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify({
            ...action.payload,
            original_timestamp: action.original_timestamp,
          }),
        });

        if (res.status === 409) {
          // Conflict: server state differs, mark as completed to avoid retries
          await this.markCompleted(action.id);
          failed.push(action.id);
          showToast(`Conflict for visit ${action.instance_id}. Please refresh.`);
          continue;
        }

        if (res.ok) {
          await this.markCompleted(action.id);
          success.push(action.id);
        } else {
          await this.markFailed(action.id, `HTTP ${res.status}`);
          failed.push(action.id);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Network error";
        await this.markFailed(action.id, msg);
        failed.push(action.id);
      }
    }

    return { success, failed };
  }

  async clearCompleted(): Promise<void> {
    // In this implementation, completed items are already deleted by markCompleted.
    // This is a no-op for interface compatibility but would clean up if we
    // switched to a soft-delete model.
  }
}

// ─── Init ────────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  // Service worker registration
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("/service-worker.js");
    } catch {
      // Service worker registration is best-effort; the app still works without it.
    }
  }

  // Initialize offline queue
  await queue.init();

  // Keyboard navigation
  document.addEventListener("keydown", handleKeyDown);

  // Slot action delegation
  document.addEventListener("click", (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const btn = target.closest<HTMLButtonElement>(".slot__action");
    if (!btn) return;
    const slot = btn.closest<HTMLElement>("[data-instance-id]");
    if (!slot) return;
    const instanceId = slot.dataset.instanceId;
    if (instanceId) void activateSlot(instanceId);
  });

  // Online/offline events
  window.addEventListener("online", () => {
    void queue.replayActions().then((result) => {
      if (result.success.length > 0) {
        showToast(`${result.success.length} queued action(s) synced.`);
        void fetchNowBoard();
      }
    });
  });

  // Cache board data for offline use
  const originalFetch = fetchNowBoard;
  const patchedFetch = async (date?: string): Promise<void> => {
    await originalFetch(date);
    if (state.data) {
      try {
        window.localStorage.setItem("desklog-now-board-cache", JSON.stringify(state.data));
      } catch {
        // Storage quota exceeded; ignore
      }
    }
  };

  // Initial fetch
  await patchedFetch();

  // Periodic refresh every 60 seconds
  setInterval(() => void patchedFetch(), 60_000);
}

// Expose for tests
export {
  init,
  fetchNowBoard,
  renderTimeline,
  navigateSlot,
  activateSlot,
  state,
  OfflineQueue,
  queue,
};

// Auto-init when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void init());
} else {
  void init();
}
