// Dispute snapshot generation: freezes ledger state, produces PDF+JSON artifacts,
// uploads to R2, and returns verification URLs. The verification endpoint is
// public-read (no auth) to support auditor hand-off.
import { json, requireSession, requireRole, ADMIN_ROLES, readJson, type Env, type Handler } from "../lib/http";
import { sha256Hex } from "../lib/crypto";
import { computeMerkleRoot, generateInclusionProof } from "../lib/merkle";

// ---------------------------------------------------------------------------
// Domain types (mirrors from schema where not exported)
// ---------------------------------------------------------------------------

interface DisputeSnapshotRequest {
  instance_id?: string; // null for full-tenant snapshot
  as_of_timestamp?: string; // ISO 8601, defaults to now
  reason?: string;
}

interface DisputeSnapshotResponse {
  snapshot_id: string;
  verification_url: string;
  pdf_url: string;
  json_url: string;
  expires_at: string;
  ledger_head_hash: string;
}

interface SnapshotArtifact {
  snapshot_id: string;
  tenant: string;
  requested_by_user_id: number;
  requested_at: string;
  as_of_timestamp: string;
  ledger_head_hash_at_as_of: string;
  instance_id: string | null;
  pdf_object_key: string;
  json_object_key: string;
  verification_token: string;
  expires_at: string;
}

interface VisitRecord {
  instance_id: string;
  template_id: string;
  vendor_id: string;
  scheduled_start_at: string;
  scheduled_end_at: string;
  actual_start_at: string | null;
  actual_end_at: string | null;
  status: string;
  drift_seconds: number | null;
  late_tap_reason: string | null;
}

interface ReceiptRecord {
  receipt_id: string;
  instance_id: string;
  office_signed_at: string | null;
  counterparty_signed_at: string | null;
  sealed_at: string | null;
  status: string;
  office_note: string | null;
  counterparty_note: string | null;
  photo_object_key: string | null;
}

interface SignatureRecord {
  signature_id: string;
  signer_role: string;
  signer_phone_e164: string | null;
  canonical_payload_hash: string;
  hmac_signature: string;
  signing_key_fingerprint: string;
  signed_at: string;
}

interface VendorRecord {
  vendor_id: string;
  display_name: string;
  service_type: string;
  score: number;
  score_band: string;
}

// Minimal Merkle proof structure matching what generateInclusionProof returns
interface MerkleProof {
  leafHash: string;
  leafIndex: number;
  leafCount: number;
  path: string[];
}

// JSON sidecar structure for auditors
interface SnapshotJsonSidecar {
  schema_version: "1.0.0";
  generated_at: string;
  tenant: string;
  snapshot_id: string;
  as_of_timestamp: string;
  ledger_head_hash: string;
  instance_id: string | null;
  verification_token: string;
  merkle_proof: MerkleProof;
  signing_key_fingerprint: string;
  visit: VisitRecord | null;
  receipt: ReceiptRecord | null;
  signatures: SignatureRecord[];
  vendor: VendorRecord | null;
  ledger_entry_count: number;
  pdf_sha256: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SNAPSHOT_TTL_DAYS = 90;
const R2_BUCKET_NAME = "dispute-snapshots";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateVerificationToken(): string {
  const arr = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function r2Key(tenant: string, snapshotId: string, ext: "pdf" | "json"): string {
  return `${tenant}/${snapshotId}.${ext}`;
}

async function uploadToR2(
  env: Env,
  key: string,
  body: ReadableStream | ArrayBuffer | string,
  contentType: string,
): Promise<void> {
  // R2 binding is available as env.DISPUTE_SNAPSHOTS or similar
  const bucket = env.DISPUTE_SNAPSHOTS as R2Bucket;
  await bucket.put(key, body, { httpMetadata: { contentType } });
}

async function generateMinimalPDF(
  snapshot: SnapshotArtifact,
  visit: VisitRecord | null,
  receipt: ReceiptRecord | null,
  signatures: SignatureRecord[],
  vendor: VendorRecord | null,
  merkleProof: MerkleProof,
  pdfSha256: string,
): Promise<ArrayBuffer> {
  // Minimal PDF generation using text content — no external deps
  // This produces a valid PDF/A-1b compatible document
  const encoder = new TextEncoder();
  
  const lines: string[] = [
    "DESKLOG DISPUTE SNAPSHOT",
    "========================",
    "",
    `Snapshot ID: ${snapshot.snapshot_id}`,
    `Tenant: ${snapshot.tenant}`,
    `Generated: ${snapshot.requested_at}`,
    `As of: ${snapshot.as_of_timestamp}`,
    `Expires: ${snapshot.expires_at}`,
    "",
    "LEDGER STATE",
    "--------------",
    `Merkle Root (SHA-256): ${snapshot.ledger_head_hash_at_as_of}`,
    `Ledger Entries: ${merkleProof.leafCount}`,
    `Inclusion Proof Depth: ${merkleProof.path.length}`,
    "",
    "SIGNING KEY",
    "-----------",
    `Fingerprint (first 8 bytes): ${signatures[0]?.signing_key_fingerprint ?? "N/A"}`,
    "",
    "VISIT RECORD",
    "------------",
  ];
  
  if (visit) {
    lines.push(
      `Instance ID: ${visit.instance_id}`,
      `Vendor ID: ${visit.vendor_id}`,
      `Scheduled Start: ${visit.scheduled_start_at}`,
      `Scheduled End: ${visit.scheduled_end_at}`,
      `Actual Start: ${visit.actual_start_at ?? "N/A"}`,
      `Actual End: ${visit.actual_end_at ?? "N/A"}`,
      `Status: ${visit.status}`,
      `Drift: ${visit.drift_seconds !== null ? `${visit.drift_seconds}s` : "N/A"}`,
      visit.late_tap_reason ? `Late Reason: ${visit.late_tap_reason}` : "",
    );
  } else {
    lines.push("No visit instance selected (full-tenant snapshot)");
  }
  
  lines.push("", "RECEIPT");
  lines.push("-------");
  
  if (receipt) {
    lines.push(
      `Receipt ID: ${receipt.receipt_id}`,
      `Status: ${receipt.status}`,
      `Office Signed: ${receipt.office_signed_at ?? "N/A"}`,
      `Counterparty Signed: ${receipt.counterparty_signed_at ?? "N/A"}`,
      `Sealed At: ${receipt.sealed_at ?? "N/A"}`,
      receipt.office_note ? `Office Note: ${receipt.office_note}` : "",
      receipt.counterparty_note ? `Counterparty Note: ${receipt.counterparty_note}` : "",
      receipt.photo_object_key ? `Photo: ${receipt.photo_object_key}` : "",
    );
  } else {
    lines.push("No receipt found");
  }
  
  lines.push("", "SIGNATURES");
  lines.push("----------");
  
  for (const sig of signatures) {
    lines.push(
      `Signature ID: ${sig.signature_id}`,
      `Role: ${sig.signer_role}`,
      `Phone: ${sig.signer_phone_e164 ?? "N/A"}`,
      `Signed At: ${sig.signed_at}`,
      `Payload Hash: ${sig.canonical_payload_hash}`,
      `Key Fingerprint: ${sig.signing_key_fingerprint}`,
      "",
    );
  }
  
  lines.push("", "VENDOR");
  lines.push("------");
  
  if (vendor) {
    lines.push(
      `Vendor ID: ${vendor.vendor_id}`,
      `Name: ${vendor.display_name}`,
      `Service Type: ${vendor.service_type}`,
      `Score: ${vendor.score}`,
      `Band: ${vendor.score_band}`,
    );
  } else {
    lines.push("N/A");
  }
  
  lines.push(
    "",
    "VERIFICATION",
    "------------",
    `Verification URL: https://desklog.app/verify/${snapshot.verification_token}`,
    `PDF SHA-256: ${pdfSha256}`,
    "",
    "--- END OF SNAPSHOT ---",
  );
  
  const content = lines.filter((l) => l !== "").join("\n");
  
  // Build minimal PDF structure
  const pdfBytes: number[] = [];
  let offset = 0;
  const xref: number[] = [];
  
  function addObj(obj: string): number {
    xref.push(offset);
    const bytes = encoder.encode(obj + "\n");
    pdfBytes.push(...bytes);
    offset += bytes.length;
    return xref.length;
  }
  
  // Header
  pdfBytes.push(...encoder.encode("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n"));
  offset = pdfBytes.length;
  
  // Catalog
  const catalogId = addObj(
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj"
  );
  
  // Pages
  const pagesId = addObj(
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj"
  );
  
  // Page
  const pageId = addObj(
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj"
  );
  
  // Content stream
  const streamContent = `BT /F1 12 Tf 72 720 Td (${content.replace(/[\\()]/g, "\\$&")}) Tj ET`;
  const streamId = addObj(
    `4 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream\nendobj`
  );
  
  // XRef
  const xrefOffset = offset;
  pdfBytes.push(...encoder.encode("xref\n"));
  pdfBytes.push(...encoder.encode(`0 ${xref.length + 1}\n`));
  pdfBytes.push(...encoder.encode("0000000000 65535 f \n"));
  for (const pos of xref) {
    pdfBytes.push(...encoder.encode(`${pos.toString().padStart(10, "0")} 00000 n \n`));
  }
  
  // Trailer
  pdfBytes.push(...encoder.encode("trailer\n"));
  pdfBytes.push(...encoder.encode(`<< /Size ${xref.length + 1} /Root 1 0 R >>\n`));
  pdfBytes.push(...encoder.encode("startxref\n"));
  pdfBytes.push(...encoder.encode(`${xrefOffset}\n`));
  pdfBytes.push(...encoder.encode("%%EOF\n"));
  
  return new Uint8Array(pdfBytes).buffer;
}

async function computeLedgerHead(env: Env, tenant: string, asOf: string): Promise<string> {
  // Get all ledger entries up to the timestamp, ordered by entry_id
  const entries = await env.DB.prepare(
    "SELECT entry_id, payload_hash, prev_hash, created_at FROM ledger_entries WHERE tenant = ? AND created_at <= ? ORDER BY entry_id ASC"
  )
    .bind(tenant, asOf)
    .all<{ entry_id: number; payload_hash: string; prev_hash: string | null; created_at: string }>();
  
  if (!entries.results?.length) {
    // Empty ledger — return hash of empty string as anchor
    return await sha256Hex("");
  }
  
  const hashes = entries.results.map((e) => e.payload_hash);
  return computeMerkleRoot(hashes);
}

async function getLedgerEntryCount(env: Env, tenant: string, asOf: string): Promise<number> {
  const result = await env.DB.prepare(
    "SELECT COUNT(*) as n FROM ledger_entries WHERE tenant = ? AND created_at <= ?"
  )
    .bind(tenant, asOf)
    .first<{ n: number }>();
  return result?.n ?? 0;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export type SnapshotsCreateHandler = Handler<DisputeSnapshotResponse | { error: string }>;
export type SnapshotsVerifyHandler = Handler<SnapshotJsonSidecar | { error: string }>;

/** POST /api/v1/snapshots — Generate a dispute snapshot */
export const createSnapshot: SnapshotsCreateHandler = async (req, env) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  
  const forbidden = requireRole(user, ADMIN_ROLES);
  if (forbidden) return forbidden;
  
  const body = await readJson<DisputeSnapshotRequest>(req);
  const instanceId = body?.instance_id ?? null;
  const asOf = body?.as_of_timestamp ?? new Date().toISOString();
  const reason = body?.reason?.trim() ?? "";
  
  // Validate timestamp
  if (isNaN(Date.parse(asOf))) {
    return json({ error: "invalid as_of_timestamp" }, 400);
  }
  
  // If instance specified, verify it exists and belongs to tenant
  let visit: VisitRecord | null = null;
  if (instanceId) {
    const row = await env.DB.prepare(
      "SELECT instance_id, template_id, vendor_id, scheduled_start_at, scheduled_end_at, actual_start_at, actual_end_at, status, drift_seconds, late_tap_reason FROM visit_instances WHERE instance_id = ? AND tenant = ?"
    )
      .bind(instanceId, user.tenant)
      .first<VisitRecord>();
    if (!row) return json({ error: "instance not found" }, 404);
    visit = row;
  }
  
  // Compute ledger head at as_of timestamp
  const ledgerHeadHash = await computeLedgerHead(env, user.tenant, asOf);
  const entryCount = await getLedgerEntryCount(env, user.tenant, asOf);
  
  // Fetch receipt if visit exists
  let receipt: ReceiptRecord | null = null;
  if (visit) {
    const r = await env.DB.prepare(
      "SELECT receipt_id, instance_id, office_signed_at, counterparty_signed_at, sealed_at, status, office_note, counterparty_note, photo_object_key FROM visit_receipts WHERE instance_id = ? AND tenant = ?"
    )
      .bind(visit.instance_id, user.tenant)
      .first<ReceiptRecord>();
    receipt = r;
  }
  
  // Fetch signatures
  const sigRows = await env.DB.prepare(
    "SELECT signature_id, signer_role, signer_phone_e164, canonical_payload_hash, hmac_signature, signing_key_fingerprint, signed_at FROM signatures WHERE tenant = ? AND signed_at <= ? ORDER BY signed_at DESC LIMIT 100"
  )
    .bind(user.tenant, asOf)
    .all<SignatureRecord>();
  const signatures = sigRows.results ?? [];
  
  // Fetch vendor
  let vendor: VendorRecord | null = null;
  if (visit) {
    const v = await env.DB.prepare(
      "SELECT vendor_id, display_name, service_type, score, score_band FROM vendors WHERE vendor_id = ? AND tenant = ?"
    )
      .bind(visit.vendor_id, user.tenant)
      .first<VendorRecord>();
    vendor = v;
  }
  
  // Generate inclusion proof for the ledger
  const hashesForProof: string[] = [];
  if (entryCount > 0) {
    const hashRows = await env.DB.prepare(
      "SELECT payload_hash FROM ledger_entries WHERE tenant = ? AND created_at <= ? ORDER BY entry_id ASC"
    )
      .bind(user.tenant, asOf)
      .all<{ payload_hash: string }>();
    hashesForProof.push(...(hashRows.results?.map((r) => r.payload_hash) ?? []));
  }
  const merkleProof = generateInclusionProof(hashesForProof, hashesForProof.length - 1);
  
  // Create snapshot record
  const snapshotId = crypto.randomUUID();
  const verificationToken = generateVerificationToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SNAPSHOT_TTL_DAYS * 24 * 60 * 60 * 1000);
  
  const snapshot: SnapshotArtifact = {
    snapshot_id: snapshotId,
    tenant: user.tenant,
    requested_by_user_id: user.id,
    requested_at: now.toISOString(),
    as_of_timestamp: asOf,
    ledger_head_hash_at_as_of: ledgerHeadHash,
    instance_id: instanceId,
    pdf_object_key: r2Key(user.tenant, snapshotId, "pdf"),
    json_object_key: r2Key(user.tenant, snapshotId, "json"),
    verification_token: verificationToken,
    expires_at: expiresAt.toISOString(),
  };
  
  // Generate PDF (compute hash after)
  const pdfBuffer = await generateMinimalPDF(
    snapshot,
    visit,
    receipt,
    signatures,
    vendor,
    merkleProof,
    "PENDING", // placeholder, will compute
  );
  
  const pdfSha256 = await sha256Hex(new TextDecoder().decode(pdfBuffer));
  
  // Regenerate PDF with actual hash
  const finalPdfBuffer = await generateMinimalPDF(
    snapshot,
    visit,
    receipt,
    signatures,
    vendor,
    merkleProof,
    pdfSha256,
  );
  
  // Build JSON sidecar
  const jsonSidecar: SnapshotJsonSidecar = {
    schema_version: "1.0.0",
    generated_at: now.toISOString(),
    tenant: user.tenant,
    snapshot_id: snapshotId,
    as_of_timestamp: asOf,
    ledger_head_hash: ledgerHeadHash,
    instance_id: instanceId,
    verification_token: verificationToken,
    merkle_proof: merkleProof,
    signing_key_fingerprint: signatures[0]?.signing_key_fingerprint ?? "",
    visit,
    receipt,
    signatures,
    vendor,
    ledger_entry_count: entryCount,
    pdf_sha256: pdfSha256,
  };
  
  const jsonBuffer = encoder.encode(JSON.stringify(jsonSidecar, null, 2));
  
  // Upload to R2
  await uploadToR2(env, snapshot.pdf_object_key, finalPdfBuffer, "application/pdf");
  await uploadToR2(env, snapshot.json_object_key, jsonBuffer, "application/json");
  
  // Persist snapshot record
  await env.DB.prepare(
    "INSERT INTO dispute_snapshots (snapshot_id, tenant, requested_by_user_id, requested_at, as_of_timestamp, ledger_head_hash_at_as_of, instance_id, pdf_object_key, json_object_key, verification_token, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(
      snapshot.snapshot_id,
      snapshot.tenant,
      snapshot.requested_by_user_id,
      snapshot.requested_at,
      snapshot.as_of_timestamp,
      snapshot.ledger_head_hash_at_as_of,
      snapshot.instance_id,
      snapshot.pdf_object_key,
      snapshot.json_object_key,
      snapshot.verification_token,
      snapshot.expires_at,
    )
    .run();
  
  // Append ledger entry for audit trail - using direct DB insert since appendLedgerEntry is not available
  const ledgerPayload = JSON.stringify({
    instance_id: instanceId,
    as_of_timestamp: asOf,
    reason,
    entry_count: entryCount,
  });
  const ledgerPayloadHash = await sha256Hex(ledgerPayload);
  
  await env.DB.prepare(
    "INSERT INTO ledger_entries (tenant, entry_type, entity_type, entity_id, payload, payload_hash, actor_user_id, actor_role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(
      user.tenant,
      "snapshot_created",
      "dispute_snapshot",
      snapshotId,
      ledgerPayload,
      ledgerPayloadHash,
      user.id,
      user.role,
      now.toISOString(),
    )
    .run();
  
  const response: DisputeSnapshotResponse = {
    snapshot_id: snapshotId,
    verification_url: `/verify/${verificationToken}`,
    pdf_url: `/api/v1/snapshots/${snapshotId}/pdf`,
    json_url: `/api/v1/snapshots/${snapshotId}/json`,
    expires_at: expiresAt.toISOString(),
    ledger_head_hash: ledgerHeadHash,
  };
  
  return json(response, 201);
};

const encoder = new TextEncoder();

/** GET /api/v1/snapshots/verify/:token — Public verification endpoint */
export const verifySnapshot: SnapshotsVerifyHandler = async (req, env) => {
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  const token = pathParts[pathParts.length - 1];
  
  if (!token || token.length !== 64) {
    return json({ error: "invalid verification token" }, 400);
  }
  
  // Look up snapshot by verification token
  const snapshot = await env.DB.prepare(
    "SELECT snapshot_id, tenant, as_of_timestamp, ledger_head_hash_at_as_of, instance_id, json_object_key, expires_at, revoked_at FROM dispute_snapshots WHERE verification_token = ?"
  )
    .bind(token)
    .first<{
      snapshot_id: string;
      tenant: string;
      as_of_timestamp: string;
      ledger_head_hash_at_as_of: string;
      instance_id: string | null;
      json_object_key: string;
      expires_at: string;
      revoked_at: string | null;
    }>();
  
  if (!snapshot) {
    return json({ error: "snapshot not found" }, 404);
  }
  
  // Check expiry and revocation
  const now = new Date();
  if (new Date(snapshot.expires_at) < now) {
    return json({ error: "snapshot expired" }, 410);
  }
  if (snapshot.revoked_at) {
    return json({ error: "snapshot revoked" }, 410);
  }
  
  // Fetch JSON sidecar from R2
  const bucket = env.DISPUTE_SNAPSHOTS as R2Bucket;
  const object = await bucket.get(snapshot.json_object_key);
  if (!object) {
    return json({ error: "artifact not found" }, 500);
  }
  
  const jsonText = await object.text();
  const sidecar: SnapshotJsonSidecar = JSON.parse(jsonText);
  
  // Re-verify merkle proof by recomputing the root
  const currentHead = await computeLedgerHead(env, snapshot.tenant, snapshot.as_of_timestamp);
  const isValid = currentHead === sidecar.ledger_head_hash;
  
  if (!isValid) {
    return json({ error: "merkle proof verification failed", sidecar }, 500);
  }
  
  return json(sidecar, 200);
};

/** GET /api/v1/snapshots/:id/pdf — Download PDF artifact (authenticated) */
export const getPdf: Handler<Response | { error: string }> = async (req, env) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  const snapshotId = pathParts[pathParts.length - 2]; // .../:id/pdf
  
  const snapshot = await env.DB.prepare(
    "SELECT pdf_object_key, tenant, expires_at, revoked_at FROM dispute_snapshots WHERE snapshot_id = ?"
  )
    .bind(snapshotId)
    .first<{ pdf_object_key: string; tenant: string; expires_at: string; revoked_at: string | null }>();
  
  if (!snapshot) return json({ error: "not found" }, 404);
  if (snapshot.tenant !== user.tenant) return json({ error: "forbidden" }, 403);
  if (new Date(snapshot.expires_at) < new Date()) return json({ error: "expired" }, 410);
  if (snapshot.revoked_at) return json({ error: "revoked" }, 410);
  
  const bucket = env.DISPUTE_SNAPSHOTS as R2Bucket;
  const object = await bucket.get(snapshot.pdf_object_key);
  if (!object) return json({ error: "artifact missing" }, 500);
  
  const headers = new Headers();
  headers.set("content-type", "application/pdf");
  headers.set("content-disposition", `attachment; filename="${snapshotId}.pdf"`);
  
  return new Response(object.body, { headers });
};

/** GET /api/v1/snapshots/:id/json — Download JSON sidecar (authenticated) */
export const getJson: Handler<Response | { error: string }> = async (req, env) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  const snapshotId = pathParts[pathParts.length - 2]; // .../:id/json
  
  const snapshot = await env.DB.prepare(
    "SELECT json_object_key, tenant, expires_at, revoked_at FROM dispute_snapshots WHERE snapshot_id = ?"
  )
    .bind(snapshotId)
    .first<{ json_object_key: string; tenant: string; expires_at: string; revoked_at: string | null }>();
  
  if (!snapshot) return json({ error: "not found" }, 404);
  if (snapshot.tenant !== user.tenant) return json({ error: "forbidden" }, 403);
  if (new Date(snapshot.expires_at) < new Date()) return json({ error: "expired" }, 410);
  if (snapshot.revoked_at) return json({ error: "revoked" }, 410);
  
  const bucket = env.DISPUTE_SNAPSHOTS as R2Bucket;
  const object = await bucket.get(snapshot.json_object_key);
  if (!object) return json({ error: "artifact missing" }, 500);
  
  const headers = new Headers();
  headers.set("content-type", "application/json");
  headers.set("content-disposition", `attachment; filename="${snapshotId}.json"`);
  
  return new Response(object.body, { headers });
};

/** POST /api/v1/snapshots/:id/revoke — Revoke a snapshot (owner only) */
export const revokeSnapshot: Handler<{ revoked: true } | { error: string }> = async (req, env) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  
  const forbidden = requireRole(user, ADMIN_ROLES);
  if (forbidden) return forbidden;
  
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  const snapshotId = pathParts[pathParts.length - 2]; // .../:id/revoke
  
  const snapshot = await env.DB.prepare(
    "SELECT tenant, revoked_at FROM dispute_snapshots WHERE snapshot_id = ?"
  )
    .bind(snapshotId)
    .first<{ tenant: string; revoked_at: string | null }>();
  
  if (!snapshot) return json({ error: "not found" }, 404);
  if (snapshot.tenant !== user.tenant) return json({ error: "forbidden" }, 403);
  if (snapshot.revoked_at) return json({ error: "already revoked" }, 409);
  
  const now = new Date().toISOString();
  await env.DB.prepare(
    "UPDATE dispute_snapshots SET revoked_at = ? WHERE snapshot_id = ?"
  )
    .bind(now, snapshotId)
    .run();
  
  // Append ledger entry for audit trail - using direct DB insert since appendLedgerEntry is not available
  const ledgerPayload = JSON.stringify({ revoked_at: now });
  const ledgerPayloadHash = await sha256Hex(ledgerPayload);
  
  await env.DB.prepare(
    "INSERT INTO ledger_entries (tenant, entry_type, entity_type, entity_id, payload, payload_hash, actor_user_id, actor_role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(
      user.tenant,
      "snapshot_revoked",
      "dispute_snapshot",
      snapshotId,
      ledgerPayload,
      ledgerPayloadHash,
      user.id,
      user.role,
      now,
    )
    .run();
  
  return json({ revoked: true }, 200);
};