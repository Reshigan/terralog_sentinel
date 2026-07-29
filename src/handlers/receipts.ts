// Dual-signature workflow for visit receipts.
// Seals receipts when both parties sign, creates ledger entries, and manages
// the cryptographic chain of custody for visit verification.

import { json, readJson, noteTenant } from "../lib/http";
import type { Env, Handler } from "../lib/http";
import { requireSession, requireRole, WRITE_ROLES, type AuthUser } from "./auth";

// ---- crypto helpers ---------------------------------------------------------

function toHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return toHex(digest);
}

async function hmacSign(key: CryptoKey, message: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return toHex(sig);
}

async function importHmacKey(hexKey: string): Promise<CryptoKey> {
  const keyBytes = new Uint8Array(hexKey.length / 2);
  for (let i = 0; i < keyBytes.length; i++) {
    keyBytes[i] = parseInt(hexKey.slice(i * 2, i * 2 + 2), 16);
  }
  return crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

function formatDurationSeconds(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

// ---- types from shared contract ---------------------------------------------

interface Receipt {
  receipt_id: string;
  tenant_id: string;
  instance_id: string;
  office_signature_id: string | null;
  counterparty_signature_id: string | null;
  office_signed_at: string | null;
  counterparty_signed_at: string | null;
  sealed_at: string | null;
  office_note: string | null;
  counterparty_note: string | null;
  photo_object_key: string | null;
  status: "drafted" | "awaiting_office" | "awaiting_counterparty" | "sealed" | "expired" | "revoked";
}

interface VisitInstance {
  instance_id: string;
  tenant_id: string;
  vendor_id: string;
  scheduled_start_at: string;
  scheduled_end_at: string;
  status: string;
  actual_start_at: string | null;
  actual_end_at: string | null;
  drift_seconds: number | null;
}

interface CounterpartyToken {
  token_id: string;
  tenant_id: string;
  instance_id: string;
  token_hash: string;
  channel: "sms" | "email";
  issued_at: string;
  expires_at: string;
  consumed_at: string | null;
  ip_hash_at_consume: string | null;
}

interface Signature {
  signature_id: string;
  tenant_id: string;
  signer_user_id: number | null;
  signer_role: "office" | "counterparty" | "auditor" | "system";
  signer_phone_e164: string | null;
  canonical_payload_hash: string;
  hmac_signature: string;
  signing_key_fingerprint: string;
  signed_at: string;
  ip_hash: string;
  user_agent_hash: string;
  counterparty_token_id: string | null;
}

// ---- audit trail ------------------------------------------------------------

async function audit(
  env: Env,
  actor: AuthUser,
  action: string,
  entityType: string,
  entityId: string | number,
  metadata: unknown,
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO audit_trails (tenant, entity_type, entity_id, action, performed_at, performed_by, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      actor.tenant,
      entityType,
      entityId,
      action,
      new Date().toISOString(),
      actor.email,
      JSON.stringify(metadata),
    )
    .run();
}

// ---- ledger entry -----------------------------------------------------------

async function writeLedgerEntry(
  env: Env,
  tenant: string,
  entryType: string,
  entityType: string,
  entityId: string,
  payload: unknown,
  actor: AuthUser | null,
  signatureId: string | null,
): Promise<{ entryId: number; entryHash: string }> {
  const payloadJson = JSON.stringify(payload, Object.keys(payload as object).sort());
  const payloadHash = await sha256Hex(payloadJson);

  // Get previous head for chain
  const prevHead = await env.DB.prepare(
    "SELECT entry_hash FROM ledger_entries WHERE tenant_id = ? ORDER BY entry_id DESC LIMIT 1",
  )
    .bind(tenant)
    .first<{ entry_hash: string }>();

  const prevHash = prevHead?.entry_hash ?? "0000000000000000000000000000000000000000000000000000000000000000";
  const timestamp = new Date().toISOString();
  const actorId = actor?.id ?? 0;
  const actorRole = actor?.role ?? "system";

  // Compute entry hash: prev_hash || payload_hash || timestamp || actor
  const chainInput = `${prevHash}${payloadHash}${timestamp}${actorId}${actorRole}`;
  const entryHash = await sha256Hex(chainInput);

  const result = await env.DB.prepare(
    "INSERT INTO ledger_entries (tenant_id, entry_type, entity_type, entity_id, payload_canonical_json, payload_hash, prev_hash, entry_hash, actor_user_id, actor_role, created_at, signature_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      tenant,
      entryType,
      entityType,
      entityId,
      payloadJson,
      payloadHash,
      prevHash,
      entryHash,
      actorId || null,
      actorRole,
      timestamp,
      signatureId,
    )
    .run();

  return { entryId: result.meta.last_row_id as number, entryHash };
}

// ---- signing key management -------------------------------------------------

async function getTenantSigningKey(env: Env, tenant: string): Promise<{ key: CryptoKey; fingerprint: string }> {
  // In production, this would fetch from a secure key management service
  // For now, derive from tenant_id + master secret (env.SIGNING_SECRET)
  const masterSecret = (env as unknown as Record<string, string>).SIGNING_SECRET ?? "REPLACE_ME_SIGNING_SECRET";
  const keyMaterial = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${masterSecret}:${tenant}`));
  const key = await crypto.subtle.importKey(
    "raw",
    keyMaterial,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const fingerprint = toHex(await crypto.subtle.digest("SHA-256", keyMaterial)).slice(0, 16);
  return { key, fingerprint };
}

// ---- canonical receipt payload ----------------------------------------------

interface CanonicalReceiptPayload {
  receipt_id: string;
  instance_id: string;
  scheduled_start: string;
  scheduled_end: string;
  actual_start: string | null;
  actual_end: string | null;
  duration_seconds: number | null;
  drift_seconds: number | null;
  office_note: string | null;
  counterparty_note: string | null;
  photo_hash: string | null;
  tenant_id: string;
}

function buildCanonicalPayload(
  receipt: Receipt,
  instance: VisitInstance,
): CanonicalReceiptPayload {
  const actualStart = instance.actual_start_at;
  const actualEnd = instance.actual_end_at;
  const durationSeconds = actualStart && actualEnd
    ? Math.floor((new Date(actualEnd).getTime() - new Date(actualStart).getTime()) / 1000)
    : null;

  return {
    receipt_id: receipt.receipt_id,
    instance_id: receipt.instance_id,
    scheduled_start: instance.scheduled_start_at,
    scheduled_end: instance.scheduled_end_at,
    actual_start: actualStart,
    actual_end: actualEnd,
    duration_seconds: durationSeconds,
    drift_seconds: instance.drift_seconds,
    office_note: receipt.office_note,
    counterparty_note: receipt.counterparty_note,
    photo_hash: receipt.photo_object_key, // hash of photo content would be stored
    tenant_id: receipt.tenant_id,
  };
}

// ---- receipt creation (drafted on visit start) ------------------------------

export interface ReceiptCreateBody {
  instance_id: string;
}

export interface ReceiptResponse {
  receipt_id: string;
  instance_id: string;
  status: string;
  office_signed: boolean;
  counterparty_signed: boolean;
  sealed: boolean;
}

export const createReceipt: Handler<ReceiptResponse | { error: string }> = async (req, env) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  const forbidden = requireRole(user, WRITE_ROLES);
  if (forbidden) return forbidden;

  const body = await readJson<ReceiptCreateBody>(req);
  if (!body?.instance_id) return json({ error: "instance_id is required" }, 400);

  // Verify instance exists and belongs to tenant
  const instance = await env.DB.prepare(
    "SELECT instance_id, tenant_id, status FROM visit_instances WHERE instance_id = ? AND tenant_id = ?",
  )
    .bind(body.instance_id, user.tenant)
    .first<{ instance_id: string; tenant_id: string; status: string }>();

  if (!instance) return json({ error: "visit instance not found" }, 404);
  if (instance.status !== "in_progress") {
    return json({ error: "visit must be in progress to create receipt" }, 409);
  }

  // Check for existing receipt
  const existing = await env.DB.prepare(
    "SELECT receipt_id, status FROM visit_receipts WHERE instance_id = ? AND tenant_id = ?",
  )
    .bind(body.instance_id, user.tenant)
    .first<{ receipt_id: string; status: string }>();

  if (existing && existing.status !== "expired" && existing.status !== "revoked") {
    return json({ error: "receipt already exists for this visit" }, 409);
  }

  const receiptId = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(
    "INSERT INTO visit_receipts (receipt_id, tenant_id, instance_id, status, office_signed_at, counterparty_signed_at, sealed_at, created_at) VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?)",
  )
    .bind(receiptId, user.tenant, body.instance_id, "drafted", now)
    .run();

  await audit(env, user, "receipt_created", "visit_receipts", receiptId, { instance_id: body.instance_id });

  await writeLedgerEntry(
    env,
    user.tenant,
    "receipt_created",
    "visit_receipts",
    receiptId,
    { receipt_id: receiptId, instance_id: body.instance_id, status: "drafted" },
    user,
    null,
  );

  noteTenant(req, user.tenant);
  return json<ReceiptResponse>({
    receipt_id: receiptId,
    instance_id: body.instance_id,
    status: "drafted",
    office_signed: false,
    counterparty_signed: false,
    sealed: false,
  }, 201);
};

// ---- office signature --------------------------------------------------------

export interface OfficeSignBody {
  receipt_id: string;
  note?: string;
  photo_object_key?: string;
}

export interface SignatureResponse {
  signature_id: string;
  signed_at: string;
  receipt_status: string;
  awaiting_counterparty: boolean;
}

export const signOffice: Handler<SignatureResponse | { error: string }> = async (req, env) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  const forbidden = requireRole(user, WRITE_ROLES);
  if (forbidden) return forbidden;

  const body = await readJson<OfficeSignBody>(req);
  if (!body?.receipt_id) return json({ error: "receipt_id is required" }, 400);

  const receipt = await env.DB.prepare(
    "SELECT receipt_id, tenant_id, instance_id, office_signature_id, counterparty_signature_id, status, office_signed_at, counterparty_signed_at, office_note, counterparty_note, photo_object_key FROM visit_receipts WHERE receipt_id = ? AND tenant_id = ?",
  )
    .bind(body.receipt_id, user.tenant)
    .first<Receipt>();

  if (!receipt) return json({ error: "receipt not found" }, 404);
  if (receipt.status === "sealed") return json({ error: "receipt already sealed" }, 409);
  if (receipt.status === "expired") return json({ error: "receipt expired" }, 410);
  if (receipt.status === "revoked") return json({ error: "receipt revoked" }, 410);
  if (receipt.office_signature_id) return json({ error: "already signed by office" }, 409);

  // Get visit instance for canonical payload
  const instance = await env.DB.prepare(
    "SELECT instance_id, tenant_id, vendor_id, scheduled_start_at, scheduled_end_at, status, actual_start_at, actual_end_at, drift_seconds FROM visit_instances WHERE instance_id = ? AND tenant_id = ?",
  )
    .bind(receipt.instance_id, user.tenant)
    .first<VisitInstance>();

  if (!instance) return json({ error: "visit instance not found" }, 404);

  // Build canonical payload and sign
  const payload = buildCanonicalPayload(receipt, instance);
  if (body.note) payload.office_note = body.note;
  if (body.photo_object_key) payload.photo_hash = body.photo_object_key;

  const { key, fingerprint } = await getTenantSigningKey(env, user.tenant);
  const payloadJson = JSON.stringify(payload, Object.keys(payload).sort());
  const payloadHash = await sha256Hex(payloadJson);
  const signature = await hmacSign(key, payloadJson);

  const signatureId = crypto.randomUUID();
  const now = new Date().toISOString();
  const ipHash = await sha256Hex(req.headers.get("cf-connecting-ip") ?? "unknown");
  const uaHash = await sha256Hex(req.headers.get("user-agent") ?? "unknown");

  await env.DB.prepare(
    "INSERT INTO signatures (signature_id, tenant_id, signer_user_id, signer_role, signer_phone_e164, canonical_payload_hash, hmac_signature, signing_key_fingerprint, signed_at, ip_hash, user_agent_hash, counterparty_token_id) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL)",
  )
    .bind(
      signatureId,
      user.tenant,
      user.id,
      "office",
      payloadHash,
      signature,
      fingerprint,
      now,
      ipHash,
      uaHash,
    )
    .run();

  // Update receipt
  const newStatus = receipt.counterparty_signature_id ? "sealed" : "awaiting_counterparty";
  const sealedAt = newStatus === "sealed" ? now : null;

  await env.DB.prepare(
    "UPDATE visit_receipts SET office_signature_id = ?, office_signed_at = ?, status = ?, sealed_at = ?, office_note = COALESCE(?, office_note), photo_object_key = COALESCE(?, photo_object_key) WHERE receipt_id = ? AND tenant_id = ?",
  )
    .bind(
      signatureId,
      now,
      newStatus,
      sealedAt,
      body.note ?? null,
      body.photo_object_key ?? null,
      body.receipt_id,
      user.tenant,
    )
    .run();

  // If sealed, update visit instance
  if (newStatus === "sealed") {
    await env.DB.prepare(
      "UPDATE visit_instances SET status = ?, actual_end_at = ? WHERE instance_id = ? AND tenant_id = ?",
    )
      .bind("completed", now, receipt.instance_id, user.tenant)
      .run();

    await writeLedgerEntry(
      env,
      user.tenant,
      "visit_completed",
      "visit_instances",
      receipt.instance_id,
      { instance_id: receipt.instance_id, status: "completed", actual_end_at: now },
      user,
      signatureId,
    );
  }

  await writeLedgerEntry(
    env,
    user.tenant,
    "receipt_signed",
    "visit_receipts",
    body.receipt_id,
    { receipt_id: body.receipt_id, signer: "office", signature_id: signatureId, status: newStatus },
    user,
    signatureId,
  );

  await audit(env, user, "office_signature_added", "visit_receipts", body.receipt_id, {
    signature_id: signatureId,
    status: newStatus,
  });

  noteTenant(req, user.tenant);
  return json<SignatureResponse>({
    signature_id: signatureId,
    signed_at: now,
    receipt_status: newStatus,
    awaiting_counterparty: newStatus === "awaiting_counterparty",
  }, 200);
};

// ---- counterparty signature via magic link ----------------------------------

export interface CounterpartySignBody {
  token: string;
  note?: string;
}

export const signCounterparty: Handler<SignatureResponse | { error: string }> = async (req, env) => {
  const body = await readJson<CounterpartySignBody>(req);
  if (!body?.token) return json({ error: "token is required" }, 400);

  const tokenHash = await sha256Hex(body.token);

  // Look up and validate token
  const tokenRow = await env.DB.prepare(
    "SELECT token_id, tenant_id, instance_id, token_hash, channel, issued_at, expires_at, consumed_at, ip_hash_at_consume FROM counterparty_tokens WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ?",
  )
    .bind(tokenHash, new Date().toISOString())
    .first<CounterpartyToken>();

  if (!tokenRow) return json({ error: "invalid or expired token" }, 401);

  // Get receipt for this instance
  const receipt = await env.DB.prepare(
    "SELECT receipt_id, tenant_id, instance_id, office_signature_id, counterparty_signature_id, status, office_signed_at, counterparty_signed_at, office_note, counterparty_note, photo_object_key FROM visit_receipts WHERE instance_id = ? AND tenant_id = ?",
  )
    .bind(tokenRow.instance_id, tokenRow.tenant_id)
    .first<Receipt>();

  if (!receipt) return json({ error: "receipt not found" }, 404);
  if (receipt.status === "sealed") return json({ error: "receipt already sealed" }, 409);
  if (receipt.status === "expired") return json({ error: "receipt expired" }, 410);
  if (receipt.status === "revoked") return json({ error: "receipt revoked" }, 410);
  if (receipt.counterparty_signature_id) return json({ error: "already signed by counterparty" }, 409);

  // Get visit instance
  const instance = await env.DB.prepare(
    "SELECT instance_id, tenant_id, vendor_id, scheduled_start_at, scheduled_end_at, status, actual_start_at, actual_end_at, drift_seconds FROM visit_instances WHERE instance_id = ? AND tenant_id = ?",
  )
    .bind(receipt.instance_id, tokenRow.tenant_id)
    .first<VisitInstance>();

  if (!instance) return json({ error: "visit instance not found" }, 404);

  // Build canonical payload and sign
  const payload = buildCanonicalPayload(receipt, instance);
  if (body.note) payload.counterparty_note = body.note;

  const { key, fingerprint } = await getTenantSigningKey(env, tokenRow.tenant_id);
  const payloadJson = JSON.stringify(payload, Object.keys(payload).sort());
  const payloadHash = await sha256Hex(payloadJson);
  const signature = await hmacSign(key, payloadJson);

  const signatureId = crypto.randomUUID();
  const now = new Date().toISOString();
  const ipHash = await sha256Hex(req.headers.get("cf-connecting-ip") ?? "unknown");
  const uaHash = await sha256Hex(req.headers.get("user-agent") ?? "unknown");

  // Get vendor contact info for the signature record
  const contact = await env.DB.prepare(
    "SELECT phone_e164 FROM vendor_contacts WHERE vendor_contact_id = (SELECT vendor_contact_id FROM counterparty_tokens WHERE token_id = ?)",
  )
    .bind(tokenRow.token_id)
    .first<{ phone_e164: string }>();

  await env.DB.prepare(
    "INSERT INTO signatures (signature_id, tenant_id, signer_user_id, signer_role, signer_phone_e164, canonical_payload_hash, hmac_signature, signing_key_fingerprint, signed_at, ip_hash, user_agent_hash, counterparty_token_id) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      signatureId,
      tokenRow.tenant_id,
      "counterparty",
      contact?.phone_e164 ?? null,
      payloadHash,
      signature,
      fingerprint,
      now,
      ipHash,
      uaHash,
      tokenRow.token_id,
    )
    .run();

  // Consume token
  await env.DB.prepare(
    "UPDATE counterparty_tokens SET consumed_at = ?, ip_hash_at_consume = ? WHERE token_id = ? AND consumed_at IS NULL",
  )
    .bind(now, ipHash, tokenRow.token_id)
    .run();

  // Update receipt
  const newStatus = receipt.office_signature_id ? "sealed" : "awaiting_office";
  const sealedAt = newStatus === "sealed" ? now : null;

  await env.DB.prepare(
    "UPDATE visit_receipts SET counterparty_signature_id = ?, counterparty_signed_at = ?, status = ?, sealed_at = ?, counterparty_note = COALESCE(?, counterparty_note) WHERE receipt_id = ? AND tenant_id = ?",
  )
    .bind(
      signatureId,
      now,
      newStatus,
      sealedAt,
      body.note ?? null,
      receipt.receipt_id,
      tokenRow.tenant_id,
    )
    .run();

  // If sealed, update visit instance
  if (newStatus === "sealed") {
    await env.DB.prepare(
      "UPDATE visit_instances SET status = ?, actual_end_at = ? WHERE instance_id = ? AND tenant_id = ?",
    )
      .bind("completed", now, receipt.instance_id, tokenRow.tenant_id)
      .run();

    await writeLedgerEntry(
      env,
      tokenRow.tenant_id,
      "visit_completed",
      "visit_instances",
      receipt.instance_id,
      { instance_id: receipt.instance_id, status: "completed", actual_end_at: now },
      null,
      signatureId,
    );
  }

  await writeLedgerEntry(
    env,
    tokenRow.tenant_id,
    "receipt_signed",
    "visit_receipts",
    receipt.receipt_id,
    { receipt_id: receipt.receipt_id, signer: "counterparty", signature_id: signatureId, status: newStatus },
    null,
    signatureId,
  );

  noteTenant(req, tokenRow.tenant_id);
  return json<SignatureResponse>({
    signature_id: signatureId,
    signed_at: now,
    receipt_status: newStatus,
    awaiting_counterparty: false,
  }, 200);
};

// ---- get receipt details -----------------------------------------------------

export interface ReceiptDetailResponse {
  receipt_id: string;
  instance_id: string;
  status: string;
  scheduled_start: string;
  scheduled_end: string;
  actual_start: string | null;
  actual_end: string | null;
  duration_formatted: string | null;
  drift_seconds: number | null;
  office_signed: boolean;
  office_signed_at: string | null;
  counterparty_signed: boolean;
  counterparty_signed_at: string | null;
  sealed: boolean;
  sealed_at: string | null;
  office_note: string | null;
  counterparty_note: string | null;
  photo_object_key: string | null;
  signatures: {
    office: { signature_id: string; fingerprint: string; signed_at: string } | null;
    counterparty: { signature_id: string; fingerprint: string; signed_at: string; phone: string | null } | null;
  };
}

export const getReceipt: Handler<ReceiptDetailResponse | { error: string }> = async (req, env) => {
  const user = await requireSession(req, env);
  const url = new URL(req.url);
  const receiptId = url.pathname.split("/").pop();

  if (!receiptId || receiptId === "receipts") return json({ error: "receipt_id is required" }, 400);

  // Allow unauthenticated access via magic link token for counterparty
  const token = url.searchParams.get("token");
  let tenant: string | null = null;

  if (!user && token) {
    const tokenHash = await sha256Hex(token);
    const tokenRow = await env.DB.prepare(
      "SELECT tenant_id FROM counterparty_tokens WHERE token_hash = ? AND (consumed_at IS NULL OR consumed_at > '1970-01-01')",
    )
      .bind(tokenHash)
      .first<{ tenant_id: string }>();
    if (!tokenRow) return json({ error: "unauthenticated" }, 401);
    tenant = tokenRow.tenant_id;
  } else if (user) {
    tenant = user.tenant;
  } else {
    return json({ error: "unauthenticated" }, 401);
  }

  const receipt = await env.DB.prepare(
    "SELECT receipt_id, tenant_id, instance_id, office_signature_id, counterparty_signature_id, status, office_signed_at, counterparty_signed_at, sealed_at, office_note, counterparty_note, photo_object_key FROM visit_receipts WHERE receipt_id = ? AND tenant_id = ?",
  )
    .bind(receiptId, tenant)
    .first<Receipt>();

  if (!receipt) return json({ error: "receipt not found" }, 404);

  const instance = await env.DB.prepare(
    "SELECT instance_id, scheduled_start_at, scheduled_end_at, actual_start_at, actual_end_at, drift_seconds FROM visit_instances WHERE instance_id = ? AND tenant_id = ?",
  )
    .bind(receipt.instance_id, tenant)
    .first<VisitInstance>();

  if (!instance) return json({ error: "visit instance not found" }, 404);

  // Fetch signature details
  const officeSig = receipt.office_signature_id
    ? await env.DB.prepare(
        "SELECT signature_id, signing_key_fingerprint, signed_at FROM signatures WHERE signature_id = ? AND tenant_id = ?",
      )
        .bind(receipt.office_signature_id, tenant)
        .first<{ signature_id: string; signing_key_fingerprint: string; signed_at: string }>()
    : null;

  const counterpartySig = receipt.counterparty_signature_id
    ? await env.DB.prepare(
        "SELECT signature_id, signing_key_fingerprint, signed_at, signer_phone_e164 FROM signatures WHERE signature_id = ? AND tenant_id = ?",
      )
        .bind(receipt.counterparty_signature_id, tenant)
        .first<{ signature_id: string; signing_key_fingerprint: string; signed_at: string; signer_phone_e164: string | null }>()
    : null;

  const durationSeconds = instance.actual_start_at && instance.actual_end_at
    ? Math.floor((new Date(instance.actual_end_at).getTime() - new Date(instance.actual_start_at).getTime()) / 1000)
    : null;

  noteTenant(req, tenant);
  return json<ReceiptDetailResponse>({
    receipt_id: receipt.receipt_id,
    instance_id: receipt.instance_id,
    status: receipt.status,
    scheduled_start: instance.scheduled_start_at,
    scheduled_end: instance.scheduled_end_at,
    actual_start: instance.actual_start_at,
    actual_end: instance.actual_end_at,
    duration_formatted: durationSeconds !== null ? formatDurationSeconds(durationSeconds) : null,
    drift_seconds: instance.drift_seconds,
    office_signed: !!receipt.office_signature_id,
    office_signed_at: receipt.office_signed_at,
    counterparty_signed: !!receipt.counterparty_signature_id,
    counterparty_signed_at: receipt.counterparty_signed_at,
    sealed: receipt.status === "sealed",
    sealed_at: receipt.sealed_at,
    office_note: receipt.office_note,
    counterparty_note: receipt.counterparty_note,
    photo_object_key: receipt.photo_object_key,
    signatures: {
      office: officeSig
        ? {
            signature_id: officeSig.signature_id,
            fingerprint: officeSig.signing_key_fingerprint,
            signed_at: officeSig.signed_at,
          }
        : null,
      counterparty: counterpartySig
        ? {
            signature_id: counterpartySig.signature_id,
            fingerprint: counterpartySig.signing_key_fingerprint,
            signed_at: counterpartySig.signed_at,
            phone: counterpartySig.signer_phone_e164,
          }
        : null,
    },
  }, 200);
};

// ---- verify receipt signatures ---------------------------------------------

export interface VerifyReceiptResponse {
  receipt_id: string;
  valid: boolean;
  office_signature_valid: boolean;
  counterparty_signature_valid: boolean;
  payload_hash_match: boolean;
  chain_integrity: boolean;
}

export const verifyReceipt: Handler<VerifyReceiptResponse | { error: string }> = async (req, env) => {
  const url = new URL(req.url);
  const receiptId = url.pathname.split("/").pop();

  if (!receiptId || receiptId === "verify") return json({ error: "receipt_id is required" }, 400);

  // Public verification - no auth required
  const receipt = await env.DB.prepare(
    "SELECT receipt_id, tenant_id, instance_id, office_signature_id, counterparty_signature_id, status FROM visit_receipts WHERE receipt_id = ?",
  )
    .bind(receiptId)
    .first<Receipt>();

  if (!receipt) return json({ error: "receipt not found" }, 404);
  if (receipt.status !== "sealed") {
    return json({ error: "receipt not yet sealed", valid: false } as VerifyReceiptResponse, 200);
  }

  const instance = await env.DB.prepare(
    "SELECT instance_id, scheduled_start_at, scheduled_end_at, actual_start_at, actual_end_at, drift_seconds FROM visit_instances WHERE instance_id = ? AND tenant_id = ?",
  )
    .bind(receipt.instance_id, receipt.tenant_id)
    .first<VisitInstance>();

  if (!instance) return json({ error: "visit instance not found" }, 404);

  const signatures = await env.DB.prepare(
    "SELECT signature_id, signer_role, canonical_payload_hash, hmac_signature, signing_key_fingerprint FROM signatures WHERE signature_id IN (?, ?) AND tenant_id = ?",
  )
    .bind(receipt.office_signature_id, receipt.counterparty_signature_id, receipt.tenant_id)
    .all<{ signature_id: string; signer_role: string; canonical_payload_hash: string; hmac_signature: string; signing_key_fingerprint: string }>();

  const officeSig = signatures.results?.find((s) => s.signer_role === "office");
  const counterpartySig = signatures.results?.find((s) => s.signer_role === "counterparty");

  if (!officeSig || !counterpartySig) {
    return json<VerifyReceiptResponse>({
      receipt_id: receiptId,
      valid: false,
      office_signature_valid: !!officeSig,
      counterparty_signature_valid: !!counterpartySig,
      payload_hash_match: false,
      chain_integrity: false,
    }, 200);
  }

  // Reconstruct payload and verify
  const payload = buildCanonicalPayload(receipt, instance);
  const payloadJson = JSON.stringify(payload, Object.keys(payload).sort());
  const computedHash = await sha256Hex(payloadJson);

  const { key } = await getTenantSigningKey(env, receipt.tenant_id);
  const expectedSignature = await hmacSign(key, payloadJson);

  const officeValid = timingSafeEqual(officeSig.hmac_signature, expectedSignature);
  const counterpartyValid = timingSafeEqual(counterpartySig.hmac_signature, expectedSignature);
  const hashMatch = officeSig.canonical_payload_hash === computedHash &&
    counterpartySig.canonical_payload_hash === computedHash;

  // Check chain integrity - verify this receipt appears in ledger
  const ledgerEntry = await env.DB.prepare(
    "SELECT entry_hash, prev_hash FROM ledger_entries WHERE tenant_id = ? AND entity_type = ? AND entity_id = ? AND entry_type = ? ORDER BY created_at DESC LIMIT 1",
  )
    .bind(receipt.tenant_id, "visit_receipts", receiptId, "receipt_signed")
    .first<{ entry_hash: string; prev_hash: string }>();

  const chainValid = !!ledgerEntry;

  return json<VerifyReceiptResponse>({
    receipt_id: receiptId,
    valid: officeValid && counterpartyValid && hashMatch && chainValid,
    office_signature_valid: officeValid,
    counterparty_signature_valid: counterpartyValid,
    payload_hash_match: hashMatch,
    chain_integrity: chainValid,
  }, 200);
};

// ---- timing-safe comparison for hex strings ---------------------------------

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ---- list receipts for an instance ------------------------------------------

export interface ReceiptListResponse {
  receipts: ReceiptResponse[];
}

export const listReceipts: Handler<ReceiptListResponse | { error: string }> = async (req, env) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);

  const url = new URL(req.url);
  const instanceId = url.searchParams.get("instance_id");

  if (!instanceId) return json({ error: "instance_id is required" }, 400);

  // Verify instance belongs to tenant
  const instance = await env.DB.prepare(
    "SELECT instance_id FROM visit_instances WHERE instance_id = ? AND tenant_id = ?",
  )
    .bind(instanceId, user.tenant)
    .first<{ instance_id: string }>();

  if (!instance) return json({ error: "visit instance not found" }, 404);

  const rows = await env.DB.prepare(
    "SELECT receipt_id, instance_id, status, office_signature_id IS NOT NULL as office_signed, counterparty_signature_id IS NOT NULL as counterparty_signed, sealed_at IS NOT NULL as sealed FROM visit_receipts WHERE instance_id = ? AND tenant_id = ? ORDER BY created_at DESC",
  )
    .bind(instanceId, user.tenant)
    .all<{ receipt_id: string; instance_id: string; status: string; office_signed: number; counterparty_signed: number; sealed: number }>();

  noteTenant(req, user.tenant);
  return json<ReceiptListResponse>({
    receipts: (rows.results ?? []).map((r) => ({
      receipt_id: r.receipt_id,
      instance_id: r.instance_id,
      status: r.status,
      office_signed: !!r.office_signed,
      counterparty_signed: !!r.counterparty_signed,
      sealed: !!r.sealed,
    })),
  }, 200);
};
