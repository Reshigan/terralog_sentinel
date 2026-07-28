import type { Request, Response } from "@cloudflare/workers-types";

interface Env {
  DB: D1Database;
}

interface CustodyRecord {
  id: number;
  tenant: string;
  reading_id: number;
  from_tech: string;
  to_tech: string;
  timestamp: string;
  created_at: string;
  notes?: string;
}

interface CustodyTransferRequest {
  reading_id: number;
  from_tech: string;
  to_tech: string;
  timestamp: string;
  notes?: string;
}

async function json<T>(data: T, init?: ResponseInit): Promise<Response> {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
}

function getTenant(req: Request): string {
  return req.headers.get("X-Tenant-ID") || "default";
}

export const transferCustody = async (
  req: Request,
  env: Env
): Promise<Response> => {
  try {
    const tenant = getTenant(req);
    let body: CustodyTransferRequest;

    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { reading_id, from_tech, to_tech, timestamp, notes } = body;

    if (!reading_id || !from_tech || !to_tech || !timestamp) {
      return json(
        { error: "Missing required fields: reading_id, from_tech, to_tech, timestamp" },
        { status: 400 }
      );
    }

    if (from_tech === to_tech) {
      return json(
        { error: "Cannot transfer custody to the same technician" },
        { status: 400 }
      );
    }

    const db = env.DB;

    // Verify reading exists and belongs to tenant
    const reading = await db
      .prepare(
        "SELECT id, tenant FROM readings WHERE id = ?"
      )
      .bind(reading_id)
      .first<{ id: number; tenant: string }>();

    if (!reading) {
      return json({ error: "Invalid reading_id: reading not found" }, { status: 404 });
    }

    if (reading.tenant !== tenant) {
      return json({ error: "Invalid reading_id: access denied" }, { status: 403 });
    }

    const created_at = new Date().toISOString();

    const result = await db
      .prepare(
        `INSERT INTO custody_records 
         (tenant, reading_id, from_tech, to_tech, timestamp, created_at, notes) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(tenant, reading_id, from_tech, to_tech, timestamp, created_at, notes || null)
      .run();

    const recordId = result.lastInsertRowid;

    return json({
      id: recordId,
      reading_id,
      from_tech,
      to_tech,
      timestamp,
      created_at,
      notes: notes || null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Custody transfer error:", message);
    return json({ error: "Internal server error" }, { status: 500 });
  }
};

export const listCustody = async (
  req: Request,
  env: Env
): Promise<Response> => {
  try {
    const tenant = getTenant(req);
    const url = new URL(req.url);
    const readingId = url.searchParams.get("reading_id");
    const technician = url.searchParams.get("technician");

    const db = env.DB;

    let query = "SELECT * FROM custody_records WHERE tenant = ?";
    const params: (string | number)[] = [tenant];

    if (readingId) {
      query += " AND reading_id = ?";
      params.push(parseInt(readingId, 10));
    }

    if (technician) {
      query += " AND (from_tech = ? OR to_tech = ?)";
      params.push(technician, technician);
    }

    query += " ORDER BY created_at DESC";

    const limit = url.searchParams.get("limit");
    if (limit) {
      query += " LIMIT ?";
      params.push(parseInt(limit, 10));
    }

    const records = await db
      .prepare(query)
      .bind(...params)
      .all<CustodyRecord>();

    return json(records.results || []);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Custody list error:", message);
    return json({ error: "Internal server error" }, { status: 500 });
  }
};

export const getCustodyRecord = async (
  req: Request,
  env: Env,
  id: number
): Promise<Response> => {
  try {
    const tenant = getTenant(req);
    const db = env.DB;

    const record = await db
      .prepare(
        "SELECT * FROM custody_records WHERE id = ? AND tenant = ?"
      )
      .bind(id, tenant)
      .first<CustodyRecord>();

    if (!record) {
      return json({ error: "Custody record not found" }, { status: 404 });
    }

    return json(record);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Get custody record error:", message);
    return json({ error: "Internal server error" }, { status: 500 });
  }
};
