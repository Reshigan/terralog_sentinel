import type { FC } from "react";

/**
 * GeofenceAlert displays a warning banner when the device's GPS coordinates
 * fall outside the designated project area.
 *
 * @param isOutside - true if the current GPS position is outside the geofence
 */
export const GeofenceAlert: FC<{ isOutside: boolean }> = ({ isOutside }) => {
  if (!isOutside) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--warn)",
        borderRadius: "var(--radius, 14px)",
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        color: "var(--ink)",
        fontSize: "0.875rem",
      }}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--warn)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
      <span>
        <strong style={{ color: "var(--warn)" }}>Outside project zone</strong>
        <span style={{ marginLeft: "6px", color: "var(--ink-soft)" }}>
          This reading will be flagged for review.
        </span>
      </span>
    </div>
  );
};
