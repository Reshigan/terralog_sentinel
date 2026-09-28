/**
 * Terminus UI - Root React Component
 *
 * Offline-first PWA for field data collection.
 * Fetches readings on mount, subscribes to sync events.
 */

import { useState, useEffect, useCallback } from "react";
import { Layout } from "./components/Layout";
import { ReadingList } from "./components/ReadingList";
import { ReadingForm } from "./components/ReadingForm";

// Domain types from shared contract
interface Reading {
  id: number;
  tenant: string;
  photo: string | null;
  latitude: number;
  longitude: number;
  numeric_value: number;
  timestamp: string;
  encrypted_blob: string | null;
  sync_status: "pending" | "synced" | "failed";
  sync_attempts: number;
  dedupe_id: string;
  site_id: number | null;
  device_id: number | null;
  equipment_id: number | null;
  calibration_id: number | null;
  created_at: string;
  row_version: number;
}

type SyncStatus = "online" | "offline" | "syncing" | "error";

interface AppState {
  readings: Reading[];
  loading: boolean;
  error: string | null;
  syncStatus: SyncStatus;
  pendingCount: number;
}

// Error boundary component
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[100dvh] flex items-center justify-center bg-[var(--bg)] text-[var(--ink)]">
          <div className="card max-w-md text-center">
            <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
            <p className="text-[var(--ink-soft)] text-sm mb-4">
              {this.state.error?.message || "An unexpected error occurred"}
            </p>
            <button
              className="primary"
              onClick={() => window.location.reload()}
            >
              Reload app
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

import React from "react";

/**
 * Main App component
 *
 * Handles:
 * - Reading list display and fetching
 * - New reading form
 * - Sync status management
 * - Offline/online detection
 */
export function App() {
  const [state, setState] = useState<AppState>({
    readings: [],
    loading: true,
    error: null,
    syncStatus: "offline",
    pendingCount: 0,
  });

  const [showForm, setShowForm] = useState(false);

  // Fetch readings from API
  const fetchReadings = useCallback(async () => {
    try {
      const response = await fetch("/api/readings");
      if (!response.ok) {
        throw new Error(`Failed to fetch readings: ${response.status}`);
      }
      const data = await response.json();
      const readings = Array.isArray(data) ? data : [];
      const pending = readings.filter(
        (r: Reading) => r.sync_status === "pending"
      ).length;

      setState((prev) => ({
        ...prev,
        readings,
        pendingCount: pending,
        loading: false,
        error: null,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load readings",
      }));
    }
  }, []);

  // Check network status
  const updateNetworkStatus = useCallback(() => {
    const status: SyncStatus = navigator.onLine ? "online" : "offline";
    setState((prev) => ({ ...prev, syncStatus: status }));
  }, []);

  // Sync pending readings
  const syncReadings = useCallback(async () => {
    if (!navigator.onLine) return;

    setState((prev) => ({ ...prev, syncStatus: "syncing" }));

    try {
      // Get pending readings
      const pending = state.readings.filter(
        (r) => r.sync_status === "pending"
      );

      for (const reading of pending) {
        try {
          const response = await fetch(`/api/readings/${reading.id}/sync`, {
            method: "POST",
          });

          if (response.ok) {
            // Update local state to mark as synced
            setState((prev) => ({
              ...prev,
              readings: prev.readings.map((r) =>
                r.id === reading.id ? { ...r, sync_status: "synced" as const } : r
              ),
              pendingCount: Math.max(0, prev.pendingCount - 1),
            }));
          }
        } catch {
          // Individual sync failure - continue with next
        }
      }

      setState((prev) => ({ ...prev, syncStatus: "online" }));
    } catch {
      setState((prev) => ({ ...prev, syncStatus: "error" }));
    }
  }, [state.readings]);

  // Initial fetch on mount
  useEffect(() => {
    fetchReadings();
    updateNetworkStatus();
  }, [fetchReadings, updateNetworkStatus]);

  // Network event listeners
  useEffect(() => {
    const handleOnline = () => {
      updateNetworkStatus();
      syncReadings();
    };
    const handleOffline = () => {
      updateNetworkStatus();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [updateNetworkStatus, syncReadings]);

  // Periodic sync when online
  useEffect(() => {
    if (state.syncStatus !== "online") return;

    const interval = setInterval(() => {
      syncReadings();
    }, 30000); // Sync every 30 seconds

    return () => clearInterval(interval);
  }, [state.syncStatus, syncReadings]);

  // Handle new reading submitted
  const handleReadingCreated = useCallback(
    (reading: Reading) => {
      setState((prev) => ({
        ...prev,
        readings: [reading, ...prev.readings],
        pendingCount: prev.pendingCount + 1,
      }));
      setShowForm(false);
    },
    []
  );

  // Handle manual sync trigger
  const handleManualSync = useCallback(() => {
    if (navigator.onLine) {
      syncReadings();
    }
  }, [syncReadings]);

  return (
    <ErrorBoundary>
      <Layout
        syncStatus={state.syncStatus}
        pendingCount={state.pendingCount}
        onSync={handleManualSync}
      >
        {state.loading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-24 bg-[var(--surface)] rounded-[var(--radius)] border border-[var(--line)]" />
            <div className="h-24 bg-[var(--surface)] rounded-[var(--radius)] border border-[var(--line)]" />
            <div className="h-24 bg-[var(--surface)] rounded-[var(--radius)] border border-[var(--line)]" />
          </div>
        ) : state.error ? (
          <div className="card text-center py-8">
            <h2 className="text-lg font-semibold mb-2">Unable to load readings</h2>
            <p className="text-[var(--ink-soft)] text-sm mb-4">{state.error}</p>
            <button className="primary" onClick={fetchReadings}>
              Try again
            </button>
          </div>
        ) : (
          <>
            {showForm ? (
              <ReadingForm
                onSubmit={handleReadingCreated}
                onCancel={() => setShowForm(false)}
              />
            ) : (
              <ReadingList
                readings={state.readings}
                onNewReading={() => setShowForm(true)}
              />
            )}
          </>
        )}
      </Layout>
    </ErrorBoundary>
  );
}

export default App;
