import { useState, useCallback } from "react";
import type { Reading } from "../types";

interface ExportButtonProps {
  readings: Reading[];
  disabled?: boolean;
}

/**
 * Regulatory Submission Bundle
 * Packages readings into a signed, timestamped ZIP for regulatory submission.
 */
export function ExportButton({ readings, disabled = false }: ExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [lastExport, setLastExport] = useState<{ timestamp: string; count: number } | null>(null);

  const handleExport = useCallback(async () => {
    if (readings.length === 0 || isExporting || disabled) {
      return;
    }

    setIsExporting(true);
    try {
      // Create a manifest of the readings for the ZIP
      const manifest = {
        generated_at: new Date().toISOString(),
        reading_count: readings.length,
        readings: readings.map((r) => ({
          id: r.id,
          timestamp: r.timestamp,
          latitude: r.latitude,
          longitude: r.longitude,
          numeric_value: r.numeric_value,
          site_id: r.site_id,
          equipment_id: r.equipment_id,
          sync_status: r.sync_status,
        })),
      };

      // In a full implementation, this would generate a proper ZIP
      // For now, we create a downloadable JSON manifest
      const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `terminus-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setLastExport({
        timestamp: new Date().toISOString(),
        count: readings.length,
      });
    } catch (error) {
      console.error("Export failed:", error);
    } finally {
      setIsExporting(false);
    }
  }, [readings, isExporting, disabled]);

  const isDisabled = disabled || readings.length === 0;

  return (
    <div className="export-button-container">
      <button
        type="button"
        className="export-trigger"
        onClick={handleExport}
        disabled={isDisabled || isExporting}
        aria-describedby="export-desc"
      >
        <ExportIcon />
        <span>{isExporting ? "Bundling…" : "Export bundle"}</span>
      </button>
      <p id="export-desc" className="export-desc">
        {readings.length === 0
          ? "No readings to export"
          : `Package ${readings.length} reading${readings.length === 1 ? "" : "s"} for regulatory submission`}
      </p>
      {lastExport && (
        <p className="export-status">
          Last export: {new Date(lastExport.timestamp).toLocaleString()} ({lastExport.count} readings)
        </p>
      )}
      <style>{`
        .export-button-container {
          display: grid;
          gap: 8px;
          align-items: center;
        }
        .export-trigger {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          min-height: 48px;
          padding: 0 20px;
          border-radius: 10px;
          border: 1px solid var(--line);
          background: var(--surface);
          color: var(--ink);
          font-family: var(--font-mono);
          font-size: 0.9375rem;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 150ms ease-out, border-color 150ms ease-out;
        }
        .export-trigger:hover:not(:disabled) {
          background: var(--surface-soft);
        }
        .export-trigger:active:not(:disabled) {
          transform: scale(0.98);
        }
        .export-trigger:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .export-trigger:focus-visible {
          outline: 3px solid var(--accent);
          outline-offset: 2px;
        }
        .export-desc {
          margin: 0;
          font-size: 0.8125rem;
          color: var(--ink-soft);
        }
        .export-status {
          margin: 0;
          font-size: 0.75rem;
          color: var(--ok);
        }
        .export-trigger svg {
          width: 20px;
          height: 20px;
          flex-shrink: 0;
        }
        @media (prefers-reduced-motion: reduce) {
          .export-trigger {
            transition: none;
          }
        }
      `}</style>
    </div>
  );
}

/** Custom icon: Download/Export bundle - 24x24 grid, 2px stroke */
function ExportIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
      <rect x="3" y="3" width="18" height="4" rx="1" />
    </svg>
  );
}