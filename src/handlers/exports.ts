import type { Handler } from "../lib/http";

// Export types matching the contract
interface Export {
  id: number;
  tenant: string;
  date_range_start: string;
  date_range_end: string;
  regulatory_body: string;
  format: string;
  status: string;
  file_path: string | null;
  signature: string | null;
  created_at: string;
  completed_at: string | null;
}

// Response types
interface CreateExportResponse {
  id: number;
  status: string;
  regulatory_body: string;
  date_range_start: string;
  date_range_end: string;
  format: string;
  created_at: string;
}

interface ExportStatusResponse {
  id: number;
  status: string;
  regulatory_body: string;
  created_at: string;
  completed_at: string | null;
  error?: string;
}

interface ExportDownloadResponse {
  id: number;
  format: string;
  signature: string;
  content: string;
}

interface ListExportsResponse {
  exports: Export[];
  total: number;
}

// Handler types
type CreateExportHandler = Handler<CreateExportResponse>;
type GetExportHandler = Handler<ExportStatusResponse>;
type DownloadExportHandler = Handler<ExportDownloadResponse>;
type ListExportsHandler = Handler<ListExportsResponse>;

// Generate tamper-evident signature for export
async function generateExportSignature(
  exportData: string,
  env: Env
): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(exportData);
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env.JWT_SECRET || "default-secret-change-in-prod"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, data);
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

// Validate date range
function validateDateRange(start: string, end: string): string | null {
  const startDate = new Date(start);
  const endDate = new Date(end);
  
  if (isNaN(startDate.getTime())) {
    return "Invalid start date format";
  }
  if (isNaN(endDate.getTime())) {
    return "Invalid end date format";
  }
  if (startDate > endDate) {
    return "Start date must be before end date";
  }
  
  const maxRange = 365 * 24 * 60 * 60 * 1000; // 1 year
  if (endDate.getTime() - startDate.getTime() > maxRange) {
    return "Date range cannot exceed 1 year";
  }
  
  return null;
}

// Validate regulatory body
function validateRegulatoryBody(body: string): string | null {
  const validBodies = ["EPA", "OSHA", "ISO", "FDA", "internal"];
  if (!validBodies.includes(body.toUpperCase())) {
    return `Invalid regulatory body. Supported: ${validBodies.join(", ")}`;
  }
  return null;
}

// Generate CSV content from readings
async function generateCSVContent(
  db: D1Database,
  tenant: string,
  startDate: string,
  endDate: string
): Promise<string> {
  const result = await db
    .prepare(
      `SELECT id, numeric_value, latitude, longitude, timestamp, sync_status 
       FROM readings 
       WHERE tenant = ? AND timestamp >= ? AND timestamp <= ?
       ORDER BY timestamp`
    )
    .bind(tenant, startDate, endDate)
    .all();

  if (!result.results || result.results.length === 0) {
    return "reading_id,numeric_value,latitude,longitude,timestamp,sync_status\n";
  }

  const headers = ["reading_id", "numeric_value", "latitude", "longitude", "timestamp", "sync_status"];
  const rows = result.results.map((row: Record<string, unknown>) =>
    [row.id, row.numeric_value, row.latitude, row.longitude, row.timestamp, row.sync_status].join(",")
  );

  return [headers.join(","), ...rows].join("\n");
}

// Get tenant from request
function getTenant(request: Request): string {
  return request.headers.get("X-Tenant") || "default";
}

// POST /api/exports - Create export
export const createExport: CreateExportHandler = async (
  request: Request,
  env: Env
) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await request.json();
    const { date_range_start, date_range_end, regulatory_body, format = "CSV" } = body;

    if (!date_range_start || !date_range_end) {
      return new Response(
        JSON.stringify({ error: "date_range_start and date_range_end are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!regulatory_body) {
      return new Response(
        JSON.stringify({ error: "regulatory_body is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const tenant = getTenant(request);

    // Validate inputs
    const dateError = validateDateRange(date_range_start, date_range_end);
    if (dateError) {
      return new Response(JSON.stringify({ error: dateError }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const bodyError = validateRegulatoryBody(regulatory_body);
    if (bodyError) {
      return new Response(JSON.stringify({ error: bodyError }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const validFormats = ["CSV", "PDF"];
    if (!validFormats.includes(format.toUpperCase())) {
      return new Response(
        JSON.stringify({ error: `Invalid format. Supported: ${validFormats.join(", ")}` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Create export record
    const createdAt = new Date().toISOString();
    const result = await env.DB.prepare(
      `INSERT INTO export_jobs (tenant, date_range_start, date_range_end, regulatory_body, format, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`
    ).bind(
      tenant,
      date_range_start,
      date_range_end,
      regulatory_body.toUpperCase(),
      format.toUpperCase(),
      createdAt
    ).run();

    const exportId = result.meta.last_insert_rowid;

    // Generate content and signature in background (for sync)
    const csvContent = await generateCSVContent(env.DB, tenant, date_range_start, date_range_end);
    const signature = await generateExportSignature(csvContent + exportId, env);

    // Update with signature
    await env.DB.prepare(
      `UPDATE export_jobs SET status = 'ready', signature = ? WHERE id = ?`
    ).bind(signature, exportId).run();

    return new Response(
      JSON.stringify({
        id: exportId,
        status: "ready",
        regulatory_body: regulatory_body.toUpperCase(),
        date_range_start,
        date_range_end,
        format: format.toUpperCase(),
        created_at: createdAt,
      }),
      { status: 201, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Failed to create export" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

// GET /api/exports - List exports
const listExports: ListExportsHandler = async (request: Request, env: Env) => {
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const tenant = getTenant(request);
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
    const offset = parseInt(url.searchParams.get("offset") || "0");

    const [countResult, exportsResult] = await Promise.all([
      env.DB.prepare(
        "SELECT COUNT(*) as total FROM export_jobs WHERE tenant = ?"
      ).bind(tenant).first<{ total: number }>(),
      env.DB.prepare(
        `SELECT id, tenant, date_range_start, date_range_end, regulatory_body, format, 
                status, file_path, signature, created_at, completed_at
         FROM export_jobs 
         WHERE tenant = ? 
         ORDER BY created_at DESC 
         LIMIT ? OFFSET ?`
      ).bind(tenant, limit, offset).all(),
    ]);

    return new Response(
      JSON.stringify({
        exports: exportsResult.results || [],
        total: countResult?.total || 0,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Failed to list exports" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

// GET /api/exports/:id - Get export status
const getExport: GetExportHandler = async (request: Request, env: Env) => {
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const tenant = getTenant(request);
    const url = new URL(request.url);
    const id = url.pathname.split("/").pop();
    const exportId = parseInt(id || "0");

    if (!exportId || isNaN(exportId)) {
      return new Response(
        JSON.stringify({ error: "Invalid export ID" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const result = await env.DB.prepare(
      `SELECT id, tenant, date_range_start, date_range_end, regulatory_body, format,
              status, file_path, signature, created_at, completed_at, error_message
       FROM export_jobs 
       WHERE id = ? AND tenant = ?`
    ).bind(exportId, tenant).first<Export>();

    if (!result) {
      return new Response(
        JSON.stringify({ error: "Export not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const response: ExportStatusResponse = {
      id: result.id,
      status: result.status,
      regulatory_body: result.regulatory_body,
      created_at: result.created_at,
      completed_at: result.completed_at,
    };

    if (result.status === "failed") {
      response.error = (result as unknown as { error_message?: string }).error_message || "Export failed";
    }

    return new Response(JSON.stringify(response), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Failed to get export status" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

// GET /api/exports/:id/download - Download export
const downloadExport: DownloadExportHandler = async (request: Request, env: Env) => {
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const tenant = getTenant(request);
    const url = new URL(request.url);
    const id = url.pathname.split("/").pop();
    const exportId = parseInt(id || "0");

    if (!exportId || isNaN(exportId)) {
      return new Response(
        JSON.stringify({ error: "Invalid export ID" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const result = await env.DB.prepare(
      `SELECT id, date_range_start, date_range_end, regulatory_body, format, status, signature
       FROM export_jobs 
       WHERE id = ? AND tenant = ?`
    ).bind(exportId, tenant).first<Export>();

    if (!result) {
      return new Response(
        JSON.stringify({ error: "Export not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    if (result.status !== "ready") {
      return new Response(
        JSON.stringify({ error: "Export not ready. Current status: " + result.status }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!result.signature) {
      return new Response(
        JSON.stringify({ error: "Export signature missing" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Regenerate content for download
    const content = await generateCSVContent(
      env.DB,
      tenant,
      result.date_range_start,
      result.date_range_end
    );

    // Verify signature
    const expectedSignature = await generateExportSignature(content + exportId, env);
    if (expectedSignature !== result.signature) {
      return new Response(
        JSON.stringify({ error: "Export integrity check failed - file may be tampered" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        id: exportId,
        format: result.format,
        signature: result.signature,
        content,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Failed to download export" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

// Export all handlers
export const exportsHandlers = {
  createExport,
  listExports,
  getExport,
  downloadExport,
};
