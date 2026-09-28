import type { PendingSyncReadingsHandler, FailedSyncThresholdReadingsHandler, SyncStatusHeatmapHandler } from "../types";
import { json } from "../lib/http";

/** POST /api/sync - Trigger sync of pending readings */
export const triggerSync: PendingSyncReadingsHandler = async (request, env) => {
  const url = new URL(request.url);
  const tenant = url.searchParams.get("tenant") || "default";

  // Fetch all pending readings for the tenant
  const pendingResult = await env.DB.prepare(
    "SELECT id, numeric_value, latitude, longitude, timestamp, sync_attempts FROM readings WHERE tenant = ? AND sync_status = 'pending'"
  ).bind(tenant).all();

  if (!pendingResult.success) {
    return json({ error: "Database query failed" }, { status: 500 });
  }

  const pendingReadings = pendingResult.results || [];
  let synced = 0;
  let failed = 0;

  // Process each pending reading
  for (const reading of pendingReadings) {
    const readingId = (reading as { id: number }).id;
    const attempts = (reading as { sync_attempts: number }).sync_attempts || 0;

    try {
      // Simulate sync attempt - in production this would upload to Cloudflare Workers
      // For now, we mark as synced if under retry threshold
      const maxAttempts = 5;
      
      if (attempts < maxAttempts) {
        // Update to synced status
        await env.DB.prepare(
          "UPDATE readings SET sync_status = 'synced', sync_attempts = ? WHERE id = ? AND tenant = ?"
        ).bind(attempts + 1, readingId, tenant).run();

        // Log the sync success
        await env.DB.prepare(
          "INSERT INTO sync_logs (tenant, reading_id, attempted_at, status, response_code) VALUES (?, ?, ?, 'success', 200)"
        ).bind(tenant, readingId, new Date().toISOString()).run();

        synced++;
      } else {
        // Exceeded max attempts - mark as failed
        await env.DB.prepare(
          "UPDATE readings SET sync_status = 'failed' WHERE id = ? AND tenant = ?"
        ).bind(readingId, tenant).run();

        // Log the sync failure
        await env.DB.prepare(
          "INSERT INTO sync_logs (tenant, reading_id, attempted_at, status, response_code, error_message) VALUES (?, ?, ?, 'failure', 0, 'Max retry attempts exceeded')"
        ).bind(tenant, readingId, new Date().toISOString()).run();

        failed++;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      
      // Log the failure
      await env.DB.prepare(
        "INSERT INTO sync_logs (tenant, reading_id, attempted_at, status, response_code, error_message) VALUES (?, ?, ?, 'failure', 0, ?)"
      ).bind(tenant, readingId, new Date().toISOString(), errorMessage).run();

      // Increment sync attempts
      await env.DB.prepare(
        "UPDATE readings SET sync_attempts = sync_attempts + 1 WHERE id = ? AND tenant = ?"
      ).bind(readingId, tenant).run();

      failed++;
    }
  }

  return json({ synced, failed });
};

/** GET /api/sync/status - Get sync status */
export const getSyncStatus: PendingSyncReadingsHandler = async (request, env) => {
  const url = new URL(request.url);
  const tenant = url.searchParams.get("tenant") || "default";

  // Get count of pending readings
  const pendingResult = await env.DB.prepare(
    "SELECT COUNT(*) as count FROM readings WHERE tenant = ? AND sync_status = 'pending'"
  ).bind(tenant).get();

  const pending = ((pendingResult as { count: number })?.count) || 0;

  // Get last successful sync timestamp
  const lastSyncResult = await env.DB.prepare(
    "SELECT attempted_at FROM sync_logs WHERE tenant = ? AND status = 'success' ORDER BY attempted_at DESC LIMIT 1"
  ).bind(tenant).get();

  const lastSync = (lastSyncResult as { attempted_at: string })?.attempted_at || "";

  return json({ pending, last_sync: lastSync });
};

/** GET /api/sync/heatmap - Get sync status heatmap by site */
export const getSyncHeatmap: SyncStatusHeatmapHandler = async (request, env) => {
  const url = new URL(request.url);
  const tenant = url.searchParams.get("tenant") || "default";

  const result = await env.DB.prepare(
    `SELECT 
      s.id as site_id,
      s.name as site_name,
      COUNT(r.id) as total_readings,
      SUM(CASE WHEN r.sync_status = 'synced' THEN 1 ELSE 0 END) as synced_readings,
      SUM(CASE WHEN r.sync_status = 'pending' THEN 1 ELSE 0 END) as pending_readings,
      SUM(CASE WHEN r.sync_status = 'failed' THEN 1 ELSE 0 END) as failed_readings,
      CASE 
        WHEN COUNT(r.id) = 0 THEN 'no_data'
        WHEN SUM(CASE WHEN r.sync_status = 'synced' THEN 1 ELSE 0 END) = COUNT(r.id) THEN 'green'
        WHEN SUM(CASE WHEN r.sync_status = 'failed' THEN 1 ELSE 0 END) > 0 AND 
             MAX(r.sync_attempts) > 5 THEN 'red'
        ELSE 'amber'
      END as status
    FROM sites s
    LEFT JOIN readings r ON s.id = r.site_id AND s.tenant = r.tenant
    WHERE s.tenant = ?
    GROUP BY s.id, s.name`
  ).bind(tenant).all();

  return json(result.results || []);
};

/** GET /api/sync/pending - Get pending sync readings */
export const getPendingReadings: PendingSyncReadingsHandler = async (request, env) => {
  const url = new URL(request.url);
  const tenant = url.searchParams.get("tenant") || "default";

  const result = await env.DB.prepare(
    "SELECT id, numeric_value, latitude, longitude, timestamp, sync_attempts FROM readings WHERE tenant = ? AND sync_status = 'pending' ORDER BY timestamp DESC"
  ).bind(tenant).all();

  return json(result.results || []);
};

/** GET /api/sync/failed - Get failed threshold readings */
export const getFailedThresholdReadings: FailedSyncThresholdReadingsHandler = async (request, env) => {
  const url = new URL(request.url);
  const tenant = url.searchParams.get("tenant") || "default";

  // Get readings that have exceeded the sync threshold (5 attempts)
  const result = await env.DB.prepare(
    "SELECT id, numeric_value, latitude, longitude, timestamp, sync_attempts, sync_status FROM readings WHERE tenant = ? AND sync_status = 'failed' OR sync_attempts > 5 ORDER BY timestamp DESC"
  ).bind(tenant).all();

  return json(result.results || []);
};
