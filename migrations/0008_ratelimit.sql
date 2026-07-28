-- GENERATED rate-limit counters. One row per ACTIVE key — a tenant (when the
-- caller has a session) or a client IP, per budget — holding the fixed 60s
-- window it is counting in and the hits so far. The window resets IN PLACE
-- rather than inserting a row per window, so this table is bounded by the number
-- of distinct callers seen inside one window, never by traffic volume.
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  hits INTEGER NOT NULL
);
-- The opportunistic prune in src/handlers/ratelimit.ts deletes every row whose
-- window has rolled; without this index that sweep is a full table scan.
CREATE INDEX IF NOT EXISTS rate_limits_window_idx ON rate_limits (window_start);
