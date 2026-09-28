import type { Reading } from "../types";

interface ReadingListProps {
  readings: Reading[];
  onSelect?: (reading: Reading) => void;
  selectedId?: number;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function SyncIcon({ status }: { status: string | null }) {
  const color =
    status === "synced"
      ? "var(--ok, #22c55e)"
      : status === "pending"
      ? "var(--warn, #d97757)"
      : "var(--ink-soft, #aab0b8)";

  if (status === "synced") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }
  if (status === "pending") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 21h5v-5" />
    </svg>
  );
}

function LocationIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function ValueIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

export function ReadingList({ readings, onSelect, selectedId }: ReadingListProps) {
  if (readings.length === 0) {
    return (
      <div className="reading-list-empty">
        <div className="empty-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="9" y1="15" x2="15" y2="15" />
          </svg>
        </div>
        <p className="empty-title">No readings yet</p>
        <p className="empty-desc">
          Captured readings will appear here.\nStart by adding your first reading.
        </p>
      </div>
    );
  }

  return (
    <div className="reading-list">
      <div className="reading-list-header">
        <h2>Recent</h2>
        <span className="reading-count">{readings.length} reading{readings.length !== 1 ? "s" : ""}</span>
      </div>
      <ul className="reading-items" role="listbox" aria-label="Recent readings">
        {readings.map((reading) => {
          const isSelected = selectedId === reading.id;
          const hasLocation = reading.latitude != null && reading.longitude != null;

          return (
            <li
              key={reading.id}
              className={`reading-item ${isSelected ? "selected" : ""}`}
              role="option"
              aria-selected={isSelected}
              onClick={() => onSelect?.(reading)}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect?.(reading);
                }
              }}
            >
              <div className="reading-main">
                <span className="reading-value">
                  {reading.numeric_value != null ? reading.numeric_value.toFixed(2) : "—"}
                </span>
                <span className="reading-time">{formatDate(reading.timestamp)}</span>
              </div>
              <div className="reading-meta">
                {hasLocation && (
                  <span className="reading-location">
                    <LocationIcon />
                    {reading.latitude?.toFixed(4)}, {reading.longitude?.toFixed(4)}
                  </span>
                )}
                {reading.numeric_value != null && (
                  <span className="reading-display-value">
                    <ValueIcon />
                    {reading.numeric_value}
                  </span>
                )}
              </div>
              <div className="reading-status">
                <SyncIcon status={reading.sync_status} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
