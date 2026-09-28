import type { CreateEncryption_keyHandler, ListEncryption_keysHandler, GetEncryption_keyHandler, UpdateEncryption_keyHandler, DeleteEncryption_keyHandler, ApiError } from "../types";
import { createEncryption_key, getEncryption_key, listEncryption_keys, updateEncryption_key, deleteEncryption_key, getEncryption_keyByTenant } from "../lib/db";

/**
 * POST /api/keys
 * Derive encryption key from passphrase + device salt using PBKDF2-SHA256
 * Returns { success: boolean }
 */
export const createKey: CreateEncryption_keyHandler = async (request, env) => {
  try {
    const body = await request.json();
    const { passphrase, deviceId } = body;

    if (!passphrase || typeof passphrase !== "string") {
      return Response.json(
        { error: "Passphrase is required", requestId: crypto.randomUUID() },
        { status: 400 }
      );
    }

    if (passphrase.length < 8) {
      return Response.json(
        { error: "Passphrase must be at least 8 characters", requestId: crypto.randomUUID() },
        { status: 400 }
      );
    }

    const tenant = body.tenant || "default";
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const saltBase64 = btoa(String.fromCharCode(...salt));

    const encoder = new TextEncoder();
    const passphraseKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(passphrase),
      "PBKDF2",
      false,
      ["deriveBits"]
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: 100000,
        hash: "SHA-256"
      },
      passphraseKey,
      256
    );

    const derivedKey = btoa(String.fromCharCode(...new Uint8Array(derivedBits)));

    const result = await createEncryption_key(env.DB, {
      tenant,
      derived_key: derivedKey,
      salt: saltBase64,
      iterations: 100000,
      device_fingerprint: body.deviceFingerprint || "",
      created_at: new Date().toISOString(),
      is_active: 1,
      device_id: deviceId || null
    });

    return Response.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    console.error("Key derivation error:", error);
    return Response.json(
      { error: "Failed to derive encryption key", requestId: crypto.randomUUID() },
      { status: 500 }
    );
  }
};

/**
 * GET /api/keys/status
 * Check if encryption key exists for tenant
 * Returns { exists: boolean }
 */
export const getKeyStatus = async (
  request: Request,
  env: Env
): Promise<Response> => {
  try {
    const url = new URL(request.url);
    const tenant = url.searchParams.get("tenant") || "default";

    const key = await getEncryption_keyByTenant(env.DB, tenant);

    return Response.json({ exists: !!key });
  } catch (error) {
    console.error("Key status check error:", error);
    return Response.json(
      { error: "Failed to check key status", requestId: crypto.randomUUID() },
      { status: 500 }
    );
  }
};

/**
 * GET /api/keys
 * List encryption keys for tenant
 */
export const listKeys: ListEncryption_keysHandler = async (request, env) => {
  try {
    const url = new URL(request.url);
    const tenant = url.searchParams.get("tenant") || "default";

    const keys = await listEncryption_keys(env.DB, tenant);
    return Response.json(keys);
  } catch (error) {
    console.error("List keys error:", error);
    return Response.json(
      { error: "Failed to list encryption keys", requestId: crypto.randomUUID() },
      { status: 500 }
    );
  }
};

/**
 * GET /api/keys/:id
 * Get specific encryption key
 */
export const getKey: GetEncryption_keyHandler = async (request, env, params) => {
  try {
    const id = params.id;
    if (!id) {
      return Response.json(
        { error: "Key ID is required", requestId: crypto.randomUUID() },
        { status: 400 }
      );
    }

    const key = await getEncryption_key(env.DB, Number(id));
    if (!key) {
      return Response.json(
        { error: "Encryption key not found", requestId: crypto.randomUUID() },
        { status: 404 }
      );
    }

    return Response.json(key);
  } catch (error) {
    console.error("Get key error:", error);
    return Response.json(
      { error: "Failed to get encryption key", requestId: crypto.randomUUID() },
      { status: 500 }
    );
  }
};

/**
 * PUT /api/keys/:id
 * Update encryption key (activate/deactivate)
 */
export const updateKey: UpdateEncryption_keyHandler = async (request, env, params) => {
  try {
    const id = params.id;
    if (!id) {
      return Response.json(
        { error: "Key ID is required", requestId: crypto.randomUUID() },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { is_active } = body;

    const updated = await updateEncryption_key(env.DB, Number(id), {
      is_active: is_active !== undefined ? (is_active ? 1 : 0) : undefined
    });

    if (!updated) {
      return Response.json(
        { error: "Encryption key not found", requestId: crypto.randomUUID() },
        { status: 404 }
      );
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("Update key error:", error);
    return Response.json(
      { error: "Failed to update encryption key", requestId: crypto.randomUUID() },
      { status: 500 }
    );
  }
};

/**
 * DELETE /api/keys/:id
 * Delete encryption key (key erasure after failed sync threshold)
 */
export const deleteKey: DeleteEncryption_keyHandler = async (request, env, params) => {
  try {
    const id = params.id;
    if (!id) {
      return Response.json(
        { error: "Key ID is required", requestId: crypto.randomUUID() },
        { status: 400 }
      );
    }

    const deleted = await deleteEncryption_key(env.DB, Number(id));

    if (!deleted) {
      return Response.json(
        { error: "Encryption key not found", requestId: crypto.randomUUID() },
        { status: 404 }
      );
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Delete key error:", error);
    return Response.json(
      { error: "Failed to delete encryption key", requestId: crypto.randomUUID() },
      { status: 500 }
    );
  }
};
