import type { Handler } from "../lib/http";
import type {
  CreateReadingHandler,
  CreateReadingResponse,
  ListReadingsHandler,
  ListReadingsResponse,
  UpdateReadingSyncStatusHandler,
  UpdateReadingSyncStatusResponse,
} from "../types";

/** Parse multipart/form-data to extract fields. */
async function parseFormData(request: Request): Promise<{
  photo: ArrayBuffer | null;
  latitude: number | null;
  longitude: number | null;
  numericValue: number | null;
  timestamp: string;
  siteId: number | null;
  deviceId: number | null;
  equipmentId: number | null;
  calibrationId: number | null;
}> {
  const formData = await request.formData();

  const photoFile = formData.get("photo");
  let photo: ArrayBuffer | null = null;
  if (photoFile instanceof Blob) {
    photo = await photoFile.arrayBuffer();
  }

  const lat = formData.get("latitude");
  const lng = formData.get("longitude");
  const num = formData.get("numeric_value");
  const ts = formData.get("timestamp");
  const site = formData.get("site_id");
  const device = formData.get("device_id");
  const equip = formData.get("equipment_id");
  const calib = formData.get("calibration_id");

  const latitude = lat ? parseFloat(String(lat)) : null;
  const longitude = lng ? parseFloat(String(lng)) : null;
  const numericValue = num ? parseFloat(String(num)) : null;
  const timestamp = ts ? String(ts) : new Date().toISOString();
  const siteId = site ? parseInt(String(site), 10) : null;
  const deviceId = device ? parseInt(String(device), 10) : null;
  const equipmentId = equip ? parseInt(String(equip), 10) : null;
  const calibrationId = calib ? parseInt(String(calib), 10) : null;

  return {
    photo,
    latitude,
    longitude,
    numericValue,
    timestamp,
    siteId,
    deviceId,
    equipmentId,
    calibrationId,
  };
}

/** Encrypt data using AES-256-GCM. Returns { iv, ciphertext } as base64 strings. */
async function encryptData(
  data: ArrayBuffer,
  _env: {
    DB: D1Database;
  },
): Promise<{ iv: string; ciphertext: string }> {
  // Generate a random 256-bit key for this operation
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );

  // Generate a random 96-bit IV
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data,
  );

  // Export the key material to include with the ciphertext
  const exportedKey = await crypto.subtle.exportKey("raw", key);

  // Combine IV + exportedKey + ciphertext for storage
  const combined = new Uint8Array(iv.length + exportedKey.byteLength + ciphertext.byteLength);
  combined.set(new Uint8Array(iv), 0);
  combined.set(new Uint8Array(exportedKey), iv.length);
  combined.set(new Uint8Array(ciphertext), iv.length + exportedKey.byteLength);

  // Return base64 encoded IV and combined data
  const ivBase64 = btoa(String.fromCharCode(...iv));
  const ciphertextBase64 = btoa(String.fromCharCode(...combined));

  return { iv: ivBase64, ciphertext: ciphertextBase64 };
}

/** Generate a deterministic UUIDv5 from the given namespace and name. */
async function generateUUIDv5(
  namespace: string,
  name: string,
): Promise<string> {
  // Convert namespace string to bytes
  const namespaceBytes = new TextEncoder().encode(namespace);
  const nameBytes = new TextEncoder().encode(name);

  // Hash the namespace to get 16 bytes
  const namespaceHash = await crypto.subtle.digest("SHA-256", namespaceBytes);
  const namespaceSlice = namespaceHash.slice(0, 16);

  // Combine with name and hash again
  const combined = new Uint8Array(namespaceSlice.length + nameBytes.length);
  combined.set(new Uint8Array(namespaceSlice), 0);
  combined.set(nameBytes, namespaceSlice.length);

  const hash = await crypto.subtle.digest("SHA-256", combined);
  const hashBytes = new Uint8Array(hash);

  // Set version (5) and variant (RFC 4122)
  hashBytes[6] = (hashBytes[6] & 0x0f) | 0x50; // Version 5
  hashBytes[8] = (hashBytes[8] & 0x3f) | 0x80; // RFC 4122 variant

  // Format as UUID string
  const hex = Array.from(hashBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** Capture a new reading. POST /api/readings */
export const createReading: CreateReadingHandler = async (
  request: Request,
  env: { DB: D1Database },
): Promise<CreateReadingResponse> => {
  const tenant = "default"; // Default tenant for now

  // Parse the form data
  let parsed: Awaited<ReturnType<typeof parseFormData>>;
  try {
    parsed = await parseFormData(request);
  } catch {
    return {
      error: "Invalid form data",
    };
  }

  const { photo, latitude, longitude, numericValue, timestamp, siteId, deviceId, equipmentId, calibrationId } = parsed;

  // Validate required fields
  if (latitude === null || longitude === null || numericValue === null) {
    return {
      error: "Missing required fields: latitude, longitude, numeric_value",
    };
  }

  if (latitude < -90 || latitude > 90) {
    return {
      error: "Invalid latitude: must be between -90 and 90",
    };
  }

  if (longitude < -180 || longitude > 180) {
    return {
      error: "Invalid longitude: must be between -180 and 180",
    };
  }

  // Generate deduplication ID using UUIDv5
  const dedupeName = `${timestamp}+${latitude}+${longitude}`;
  const dedupeId = await generateUUIDv5("terminus-field", dedupeName);

  // Encrypt the photo if present
  let encryptedBlob = "";
  if (photo) {
    try {
      const { iv, ciphertext } = await encryptData(photo, env);
      encryptedBlob = JSON.stringify({ iv, data: ciphertext });
    } catch (e) {
      return {
        error: `Encryption failed: ${e instanceof Error ? e.message : "unknown error"}`,
      };
    }
  }

  // Insert into database
  const insertResult = await env.DB.prepare(
    `INSERT INTO readings (
      tenant,
      photo,
      latitude,
      longitude,
      numeric_value,
      timestamp,
      encrypted_blob,
      sync_status,
      sync_attempts,
      dedupe_id,
      site_id,
      device_id,
      equipment_id,
      calibration_id,
      row_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      tenant,
      null, // photo stored as encrypted_blob, not directly
      latitude,
      longitude,
      numericValue,
      timestamp,
      encryptedBlob,
      "pending",
      0,
      dedupeId,
      siteId,
      deviceId,
      equipmentId,
      calibrationId,
      1, // row_version
    )
    .run();

  if (!insertResult.success) {
    return {
      error: "Failed to save reading",
    };
  }

  // Get the inserted row
  const lastId = env.DB.prepare("SELECT last_insert_rowid() as id").first<{ id: number }>();
  const insertedRow = await env.DB.prepare(
    "SELECT * FROM readings WHERE id = ? AND tenant = ?"
  )
    .bind((await lastId)?.id ?? 0, tenant)
    .first();

  return insertedRow as CreateReadingResponse;
};

/** List readings for tenant. GET /api/readings */
export const listReadings: ListReadingsHandler = async (
  request: Request,
  env: { DB: D1Database },
): Promise<ListReadingsResponse> => {
  const tenant = "default";
  const url = new URL(request.url);
  const syncStatus = url.searchParams.get("sync_status");

  let query = "SELECT * FROM readings WHERE tenant = ?";
  const params: (string | number)[] = [tenant];

  if (syncStatus) {
    query += " AND sync_status = ?";
    params.push(syncStatus);
  }

  query += " ORDER BY timestamp DESC";

  const result = await env.DB.prepare(query).bind(...params).all();

  return (result.results || []) as ListReadingsResponse;
};

/** Update reading sync status. PUT /api/readings/:id */
export const updateReadingSyncStatus: UpdateReadingSyncStatusHandler = async (
  request: Request,
  env: { DB: D1Database },
): Promise<UpdateReadingSyncStatusResponse> => {
  const tenant = "default";
  const url = new URL(request.url);
  const pathParts = url.pathname.split("/");
  const idStr = pathParts[pathParts.length - 1];
  const id = parseInt(idStr, 10);

  if (isNaN(id)) {
    return {
      error: "Invalid reading ID",
    };
  }

  let body: { sync_status?: string; sync_attempts?: number };
  try {
    body = await request.json();
  } catch {
    return {
      error: "Invalid JSON body",
    };
  }

  const { sync_status, sync_attempts } = body;

  // Validate sync_status
  const validStatuses = ["pending", "syncing", "synced", "failed"];
  if (sync_status && !validStatuses.includes(sync_status)) {
    return {
      error: `Invalid sync_status. Must be one of: ${validStatuses.join(", ")}`,
    };
  }

  // Build update query dynamically
  const updates: string[] = [];
  const params: (string | number)[] = [];

  if (sync_status) {
    updates.push("sync_status = ?");
    params.push(sync_status);
  }

  if (typeof sync_attempts === "number") {
    updates.push("sync_attempts = ?");
    params.push(sync_attempts);
  }

  if (updates.length === 0) {
    return {
      error: "No fields to update",
    };
  }

  params.push(id, tenant);

  const query = `UPDATE readings SET ${updates.join(", ")} WHERE id = ? AND tenant = ?`;

  const result = await env.DB.prepare(query).bind(...params).run();

  if (!result.success) {
    return {
      error: "Failed to update reading",
    };
  }

  if (result.meta.changes === 0) {
    return {
      error: "Reading not found",
    };
  }

  // Get the updated row
  const updatedRow = await env.DB.prepare(
    "SELECT * FROM readings WHERE id = ? AND tenant = ?"
  )
    .bind(id, tenant)
    .first();

  return updatedRow as UpdateReadingSyncStatusResponse;
};
