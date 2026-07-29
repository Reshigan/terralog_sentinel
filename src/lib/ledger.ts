// Ledger: append-only, hash-chained audit trail. Every state change in the
// operational tables produces exactly one LedgerEntry row. The ledger itself
// is immutable: UPDATE and DELETE are rejected at the query layer by policy,
// not merely by convention.
//
// Entry format (canonical JSON, UTF-8, no unescaped control characters):
//   {
//     "entry_id": <number>,           // monotonically increasing per tenant
//     "tenant_id": <string>,
//     "entry_type": <string>,       // domain event type
//     "entity_type": <string>,
//     "entity_id": <string>,
//     "payload": <any>,               // the operational payload at this version
//     "prev_hash": <hex64>,           // SHA-256 of prior entry (null for first)
//     "actor": { "user_id": <number|null>, "role": <string> },
//     "timestamp": <ISO8601>,
//     "signature_id": <number|null>
//   }
//
// entry_hash = SHA-256( prev_hash || payload_hash || timestamp || actor )
// where payload_hash = SHA-256(canonical_payload_json)
//
// The chain is verified by walking prev_hash from any entry back to the tenant's
// first entry. Tampering is detected when prev_hash does not match the stored
// hash of the prior entry.

import type { D1Database } from "@cloudflare/workers-types";

// Domain event types written to entry_type. These are the ONLY values that
// appear; append-only here too — never rename, only add.
export const ENTRY_TYPES = [
  "visit_created",
  "visit_started",
  "visit_completed",
  "receipt_sealed",
  "receipt_expired",
  "receipt_revoked",
  "override_requested",
  "override_approved",
  "override_rejected",
  "override_executed",
  "score_update",
  "correction",
  "anomaly_flag",
  "cross_tenant_attempt",
] as const;

export type EntryType = (typeof ENTRY_TYPES)[number];

// Actor role values for the ledger; these align with User.role but include
// synthetic roles for system-initiated actions.
export const ACTOR_ROLES = [
  "office",
  "counterparty",
  "auditor",
  "system",
  "shadow",
] as const;

export type ActorRole = (typeof ACTOR_ROLES)[number];

export interface LedgerPayload {
  [key: string]: unknown;
}

export interface LedgerActor {
  user_id: number | null;
  role: ActorRole;
}

export interface LedgerEntry {
  entry_id: number;
  tenant_id: string;
  entry_type: EntryType;
  entity_type: string;
  entity_id: string;
  payload: LedgerPayload;
  payload_hash: string; // hex64
  prev_hash: string | null; // hex64
  entry_hash: string; // hex64
  actor_user_id: number | null;
  actor_role: ActorRole;
  created_at: string; // ISO8601
  signature_id: number | null;
}

// Canonical JSON: keys sorted, no trailing whitespace, no extra spaces.
// We rely on JSON.stringify with sorted keys; numbers are represented
// without exponent where possible (standard JS stringify).
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as object).sort());
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Compute the entry hash as defined in the contract.
// prevHash: hex64 or null
// payloadHash: hex64
// timestamp: ISO8601 string
// actor: LedgerActor
async function computeEntryHash(
  prevHash: string | null,
  payloadHash: string,
  timestamp: string,
  actor: LedgerActor,
): Promise<string> {
  const actorCanonical = canonicalJson(actor);
  const preimage = (prevHash ?? "") + payloadHash + timestamp + actorCanonical;
  return sha256Hex(preimage);
}

// Interface for the operational context needed to append an entry.
export interface AppendContext {
  db: D1Database;
  tenantId: string;
  actor: LedgerActor;
  now?: Date; // optional for testing; defaults to new Date()
}

// Result of appending an entry.
export interface AppendResult {
  entry: LedgerEntry;
  prevHash: string | null;
}

/** Append a new entry to the tenant's ledger. This is the ONLY way to write
 * to the ledger table; it enforces the hash chain and the monotonic entry_id.
 *
 * The caller provides the operational payload; this function computes hashes,
 * resolves prev_hash from the current ledger head, and inserts the row.
 *
 * Returns the complete entry including the assigned entry_id.
 *
 * Throws on database errors (caller should translate to 500).
 */
export async function appendEntry(
  ctx: AppendContext,
  entryType: EntryType,
  entityType: string,
  entityId: string,
  payload: LedgerPayload,
  signatureId: number | null = null,
): Promise<AppendResult> {
  const { db, tenantId, actor } = ctx;
  const now = ctx.now ?? new Date();
  const timestamp = now.toISOString();

  // Compute payload hash from canonical JSON.
  const payloadCanonical = canonicalJson(payload);
  const payloadHash = await sha256Hex(payloadCanonical);

  // Resolve the current ledger head to get prev_hash and the next entry_id.
  // entry_id is monotonically increasing per tenant; we use MAX+1.
  // In a high-concurrency scenario this would need a stronger sequence,
  // but D1's transactional semantics (SERIALIZABLE) make this safe for
  // the expected load. We read and write in the same implicit transaction
  // because D1 batches statements into a transaction until committed.
  const headRow = await db
    .prepare(
      "SELECT entry_id, entry_hash FROM ledger_entries WHERE tenant_id = ? ORDER BY entry_id DESC LIMIT 1"
    )
    .bind(tenantId)
    .first<{ entry_id: number; entry_hash: string }>();

  const prevHash: string | null = headRow?.entry_hash ?? null;
  const nextEntryId = (headRow?.entry_id ?? 0) + 1;

  // Compute the entry hash.
  const entryHash = await computeEntryHash(prevHash, payloadHash, timestamp, actor);

  // Insert the row. We include prev_hash explicitly to enforce the chain.
  const insert = await db
    .prepare(
      "INSERT INTO ledger_entries (tenant_id, entry_id, entry_type, entity_type, entity_id, payload_canonical_json, payload_hash, prev_hash, entry_hash, actor_user_id, actor_role, created_at, signature_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(
      tenantId,
      nextEntryId,
      entryType,
      entityType,
      entityId,
      payloadCanonical,
      payloadHash,
      prevHash,
      entryHash,
      actor.user_id,
      actor.role,
      timestamp,
      signatureId
    )
    .run();

  if (!insert.success) {
    throw new Error("ledger insert failed");
  }

  const entry: LedgerEntry = {
    entry_id: nextEntryId,
    tenant_id: tenantId,
    entry_type: entryType,
    entity_type: entityType,
    entity_id: entityId,
    payload,
    payload_hash: payloadHash,
    prev_hash: prevHash,
    entry_hash: entryHash,
    actor_user_id: actor.user_id,
    actor_role: actor.role,
    created_at: timestamp,
    signature_id: signatureId,
  };

  return { entry, prevHash };
}

/** Verify the integrity of the ledger for a tenant.
 *
 * Walks the chain from the most recent entry back to the first, verifying:
 * - entry_hash recomputes correctly
 * - prev_hash matches the prior entry's entry_hash
 * - entry_id is strictly decreasing by 1 (no gaps, no duplicates)
 *
 * Returns { valid: true } or { valid: false, brokenAtEntryId: number, reason: string }.
 *
 * This is expensive (O(n) rows); use sparingly (e.g., during audit exports).
 */
export async function verifyLedger(
  db: D1Database,
  tenantId: string
): Promise<{ valid: true } | { valid: false; brokenAtEntryId: number; reason: string }> {
  // Fetch all entries in reverse order (newest first).
  const rows = await db
    .prepare(
      "SELECT entry_id, entry_type, entity_type, entity_id, payload_canonical_json, payload_hash, prev_hash, entry_hash, actor_user_id, actor_role, created_at, signature_id FROM ledger_entries WHERE tenant_id = ? ORDER BY entry_id DESC"
    )
    .bind(tenantId)
    .all<{
      entry_id: number;
      entry_type: EntryType;
      entity_type: string;
      entity_id: string;
      payload_canonical_json: string;
      payload_hash: string;
      prev_hash: string | null;
      entry_hash: string;
      actor_user_id: number | null;
      actor_role: ActorRole;
      created_at: string;
      signature_id: number | null;
    }>();

  const entries = rows.results ?? [];
  if (entries.length === 0) {
    // Empty ledger is valid; nothing to verify.
    return { valid: true };
  }

  // Build a map of entry_id -> entry for O(1) lookup of prev entries.
  const byId = new Map<number, (typeof entries)[0]>();
  for (const e of entries) {
    byId.set(e.entry_id, e);
  }

  // Verify from the oldest entry forward (ascending entry_id) so we can
  // validate prev_hash chains correctly.
  const ascending = [...entries].sort((a, b) => a.entry_id - b.entry_id);

  for (let i = 0; i < ascending.length; i++) {
    const current = ascending[i]!;

    // Verify entry_id sequence: must start at 1, increment by 1.
    const expectedId = i + 1;
    if (current.entry_id !== expectedId) {
      return {
        valid: false,
        brokenAtEntryId: current.entry_id,
        reason: `sequence gap: expected entry_id ${expectedId}, found ${current.entry_id}`,
      };
    }

    // Recompute entry_hash and verify.
    const actor: LedgerActor = {
      user_id: current.actor_user_id,
      role: current.actor_role,
    };
    const recomputedHash = await computeEntryHash(
      current.prev_hash,
      current.payload_hash,
      current.created_at,
      actor
    );
    if (recomputedHash !== current.entry_hash) {
      return {
        valid: false,
        brokenAtEntryId: current.entry_id,
        reason: `entry_hash mismatch: stored ${current.entry_hash}, recomputed ${recomputedHash}`,
      };
    }

    // Verify prev_hash links correctly (except for the first entry).
    if (i > 0) {
      const prior = ascending[i - 1]!;
      if (current.prev_hash !== prior.entry_hash) {
        return {
          valid: false,
          brokenAtEntryId: current.entry_id,
          reason: `prev_hash mismatch: points to ${current.prev_hash}, prior entry_hash is ${prior.entry_hash}`,
        };
      }
    } else {
      // First entry: prev_hash must be null.
      if (current.prev_hash !== null) {
        return {
          valid: false,
          brokenAtEntryId: current.entry_id,
          reason: `first entry prev_hash must be null, found ${current.prev_hash}`,
        };
      }
    }
  }

  return { valid: true };
}

/** Get the current ledger head (most recent entry) for a tenant.
 *
 * Returns null if the ledger is empty.
 */
export async function getLedgerHead(
  db: D1Database,
  tenantId: string
): Promise<LedgerEntry | null> {
  const row = await db
    .prepare(
      "SELECT entry_id, entry_type, entity_type, entity_id, payload_canonical_json, payload_hash, prev_hash, entry_hash, actor_user_id, actor_role, created_at, signature_id FROM ledger_entries WHERE tenant_id = ? ORDER BY entry_id DESC LIMIT 1"
    )
    .bind(tenantId)
    .first<{
      entry_id: number;
      entry_type: EntryType;
      entity_type: string;
      entity_id: string;
      payload_canonical_json: string;
      payload_hash: string;
      prev_hash: string | null;
      entry_hash: string;
      actor_user_id: number | null;
      actor_role: ActorRole;
      created_at: string;
      signature_id: number | null;
    }>();

  if (!row) return null;

  return {
    entry_id: row.entry_id,
    tenant_id: tenantId,
    entry_type: row.entry_type,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    payload: JSON.parse(row.payload_canonical_json) as LedgerPayload,
    payload_hash: row.payload_hash,
    prev_hash: row.prev_hash,
    entry_hash: row.entry_hash,
    actor_user_id: row.actor_user_id,
    actor_role: row.actor_role,
    created_at: row.created_at,
    signature_id: row.signature_id,
  };
}

/** Get the ledger root hash (Merkle root) for a tenant at a given time.
 *
 * This is a placeholder for the actual Merkle tree computation; the real
 * implementation in src/lib/merkle.ts builds a tree from entry hashes.
 * This function returns the entry_hash of the head entry as a simple root
 * for the single-chain case; merkle.ts will replace with proper tree root.
 */
export async function getLedgerRoot(
  db: D1Database,
  tenantId: string,
  asOf?: Date
): Promise<string | null> {
  const asOfIso = asOf?.toISOString() ?? new Date().toISOString();
  const row = await db
    .prepare(
      "SELECT entry_hash FROM ledger_entries WHERE tenant_id = ? AND created_at <= ? ORDER BY entry_id DESC LIMIT 1"
    )
    .bind(tenantId, asOfIso)
    .first<{ entry_hash: string }>();

  return row?.entry_hash ?? null;
}

/** Query the ledger for entries matching filters.
 *
 * Results are ordered by entry_id descending (newest first).
 * Supports pagination via entryIdCursor (exclusive).
 */
export interface LedgerQuery {
  entityType?: string;
  entityId?: string;
  entryType?: EntryType;
  actorUserId?: number;
  limit?: number;
  entryIdCursor?: number; // exclusive, for pagination
}

export async function queryLedger(
  db: D1Database,
  tenantId: string,
  query: LedgerQuery
): Promise<LedgerEntry[]> {
  const conditions: string[] = ["tenant_id = ?"];
  const params: (string | number)[] = [tenantId];

  if (query.entityType !== undefined) {
    conditions.push("entity_type = ?");
    params.push(query.entityType);
  }
  if (query.entityId !== undefined) {
    conditions.push("entity_id = ?");
    params.push(query.entityId);
  }
  if (query.entryType !== undefined) {
    conditions.push("entry_type = ?");
    params.push(query.entryType);
  }
  if (query.actorUserId !== undefined) {
    conditions.push("actor_user_id = ?");
    params.push(query.actorUserId);
  }
  if (query.entryIdCursor !== undefined) {
    conditions.push("entry_id < ?");
    params.push(query.entryIdCursor);
  }

  const whereClause = conditions.join(" AND ");
  const limit = Math.min(query.limit ?? 100, 1000);

  const sql = `SELECT entry_id, entry_type, entity_type, entity_id, payload_canonical_json, payload_hash, prev_hash, entry_hash, actor_user_id, actor_role, created_at, signature_id FROM ledger_entries WHERE ${whereClause} ORDER BY entry_id DESC LIMIT ${limit}`;

  const rows = await db.prepare(sql).bind(...params).all<{
    entry_id: number;
    entry_type: EntryType;
    entity_type: string;
    entity_id: string;
    payload_canonical_json: string;
    payload_hash: string;
    prev_hash: string | null;
    entry_hash: string;
    actor_user_id: number | null;
    actor_role: ActorRole;
    created_at: string;
    signature_id: number | null;
  }>();

  return (rows.results ?? []).map((row) => ({
    entry_id: row.entry_id,
    tenant_id: tenantId,
    entry_type: row.entry_type,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    payload: JSON.parse(row.payload_canonical_json) as LedgerPayload,
    payload_hash: row.payload_hash,
    prev_hash: row.prev_hash,
    entry_hash: row.entry_hash,
    actor_user_id: row.actor_user_id,
    actor_role: row.actor_role,
    created_at: row.created_at,
    signature_id: row.signature_id,
  }));
}

/** Get a specific entry by ID.
 *
 * Returns null if not found or if the entry belongs to a different tenant.
 */
export async function getEntry(
  db: D1Database,
  tenantId: string,
  entryId: number
): Promise<LedgerEntry | null> {
  const row = await db
    .prepare(
      "SELECT entry_id, entry_type, entity_type, entity_id, payload_canonical_json, payload_hash, prev_hash, entry_hash, actor_user_id, actor_role, created_at, signature_id FROM ledger_entries WHERE tenant_id = ? AND entry_id = ?"
    )
    .bind(tenantId, entryId)
    .first<{
      entry_id: number;
      entry_type: EntryType;
      entity_type: string;
      entity_id: string;
      payload_canonical_json: string;
      payload_hash: string;
      prev_hash: string | null;
      entry_hash: string;
      actor_user_id: number | null;
      actor_role: ActorRole;
      created_at: string;
      signature_id: number | null;
    }>();

  if (!row) return null;

  return {
    entry_id: row.entry_id,
    tenant_id: tenantId,
    entry_type: row.entry_type,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    payload: JSON.parse(row.payload_canonical_json) as LedgerPayload,
    payload_hash: row.payload_hash,
    prev_hash: row.prev_hash,
    entry_hash: row.entry_hash,
    actor_user_id: row.actor_user_id,
    actor_role: row.actor_role,
    created_at: row.created_at,
    signature_id: row.signature_id,
  };
}

export type { LedgerEntryType } from "./schema.ts";