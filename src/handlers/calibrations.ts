import type { Handler } from "../lib/http";
import type { Calibration_log, ApiError, Row } from "../types";

interface CreateCalibrationInput {
  equipment_id: number;
  calibration_date: string;
  expiry_date: string;
  calibrated_by?: string;
  notes?: string;
}

interface ListCalibrationsQuery {
  equipment_id?: string;
  status?: string;
  tenant?: string;
}

function isValidDate(dateString: string): boolean {
  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

function isValidDateRange(calibrationDate: string, expiryDate: string): boolean {
  const cal = new Date(calibrationDate);
  const exp = new Date(expiryDate);
  return exp > cal;
}

export const createCalibration: Handler<Calibration_log | ApiError> = async (
  request,
  env
) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body: CreateCalibrationInput = await request.json();

    if (!body.equipment_id || typeof body.equipment_id !== "number") {
      return new Response(
        JSON.stringify({ error: "equipment_id is required and must be a number" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!body.calibration_date || !isValidDate(body.calibration_date)) {
      return new Response(
        JSON.stringify({ error: "calibration_date is required and must be a valid date" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!body.expiry_date || !isValidDate(body.expiry_date)) {
      return new Response(
        JSON.stringify({ error: "expiry_date is required and must be a valid date" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!isValidDateRange(body.calibration_date, body.expiry_date)) {
      return new Response(
        JSON.stringify({ error: "expiry_date must be after calibration_date" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const tenant = "default";
    const timestamp = new Date().toISOString();
    const status = "active";

    const result = await env.DB.prepare(
      `INSERT INTO calibration_logs 
       (tenant, equipment_id, calibrated_at, calibrated_by, next_calibration, notes, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        tenant,
        body.equipment_id,
        body.calibration_date,
        body.calibrated_by || "system",
        body.expiry_date,
        body.notes || "",
        status
      )
      .run();

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Failed to create calibration record" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const inserted = await env.DB.prepare(
      "SELECT * FROM calibration_logs WHERE tenant = ? AND equipment_id = ? AND calibrated_at = ? ORDER BY id DESC LIMIT 1"
    )
      .bind(tenant, body.equipment_id, body.calibration_date)
      .first<Calibration_log>();

    return new Response(JSON.stringify(inserted), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const listCalibrations: Handler<Calibration_log[] | ApiError> = async (
  request,
  env
) => {
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const url = new URL(request.url);
    const query = url.searchParams;

    const tenant = query.get("tenant") || "default";
    const equipmentId = query.get("equipment_id");
    const status = query.get("status");

    let sql = "SELECT * FROM calibration_logs WHERE tenant = ?";
    const params: (string | number)[] = [tenant];

    if (equipmentId) {
      sql += " AND equipment_id = ?";
      params.push(Number(equipmentId));
    }

    if (status) {
      sql += " AND status = ?";
      params.push(status);
    }

    sql += " ORDER BY calibrated_at DESC";

    const rows = await env.DB.prepare(sql).bind(...params).all<Calibration_log>();

    return new Response(JSON.stringify(rows.results), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const revokeCalibration: Handler<{ ok: boolean } | ApiError> = async (
  request,
  env,
  ctx
) => {
  if (request.method !== "DELETE") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const url = new URL(request.url);
    const idParam = url.searchParams.get("id");

    if (!idParam) {
      return new Response(
        JSON.stringify({ error: "calibration id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const id = Number(idParam);
    if (isNaN(id)) {
      return new Response(
        JSON.stringify({ error: "invalid calibration id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const existing = await env.DB.prepare(
      "SELECT * FROM calibration_logs WHERE id = ?"
    )
      .bind(id)
      .first<Calibration_log>();

    if (!existing) {
      return new Response(
        JSON.stringify({ error: "calibration not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    if (existing.status === "revoked") {
      return new Response(
        JSON.stringify({ error: "calibration already revoked" }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      );
    }

    const result = await env.DB.prepare(
      "UPDATE calibration_logs SET status = ? WHERE id = ?"
    )
      .bind("revoked", id)
      .run();

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Failed to revoke calibration" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const getCalibration: Handler<Calibration_log | ApiError> = async (
  request,
  env
) => {
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const url = new URL(request.url);
    const idParam = url.searchParams.get("id");

    if (!idParam) {
      return new Response(
        JSON.stringify({ error: "calibration id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const id = Number(idParam);
    if (isNaN(id)) {
      return new Response(
        JSON.stringify({ error: "invalid calibration id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const row = await env.DB.prepare(
      "SELECT * FROM calibration_logs WHERE id = ?"
    )
      .bind(id)
      .first<Calibration_log>();

    if (!row) {
      return new Response(
        JSON.stringify({ error: "calibration not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(row), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const updateCalibration: Handler<Calibration_log | ApiError> = async (
  request,
  env
) => {
  if (request.method !== "PUT") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const url = new URL(request.url);
    const idParam = url.searchParams.get("id");

    if (!idParam) {
      return new Response(
        JSON.stringify({ error: "calibration id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const id = Number(idParam);
    if (isNaN(id)) {
      return new Response(
        JSON.stringify({ error: "invalid calibration id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = await request.json();

    const existing = await env.DB.prepare(
      "SELECT * FROM calibration_logs WHERE id = ?"
    )
      .bind(id)
      .first<Calibration_log>();

    if (!existing) {
      return new Response(
        JSON.stringify({ error: "calibration not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const calibratedAt = body.calibration_date || existing.calibrated_at;
    const nextCalibration = body.expiry_date || existing.next_calibration;
    const notes = body.notes ?? existing.notes;
    const status = body.status || existing.status;

    if (body.expiry_date && body.calibration_date && !isValidDateRange(body.calibration_date, body.expiry_date)) {
      return new Response(
        JSON.stringify({ error: "expiry_date must be after calibration_date" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const result = await env.DB.prepare(
      `UPDATE calibration_logs 
       SET calibrated_at = ?, next_calibration = ?, notes = ?, status = ? 
       WHERE id = ?`
    )
      .bind(calibratedAt, nextCalibration, notes, status, id)
      .run();

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Failed to update calibration" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const updated = await env.DB.prepare(
      "SELECT * FROM calibration_logs WHERE id = ?"
    )
      .bind(id)
      .first<Calibration_log>();

    return new Response(JSON.stringify(updated), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
