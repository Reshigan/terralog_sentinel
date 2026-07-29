// Merkle tree utilities for ledger integrity and dispute snapshot verification.
// Computes roots from LedgerEntry batches and generates inclusion proofs.
// All operations use WebCrypto SHA-256; no external dependencies.

import type { LedgerEntry } from "./schema";

const HASH_SIZE = 32; // SHA-256 output size in bytes

/** Compute SHA-256 hash of data. Accepts string or Uint8Array. */
async function sha256(data: string | Uint8Array): Promise<Uint8Array> {
  const buffer = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return new Uint8Array(await crypto.subtle.digest("SHA-256", buffer));
}

/** Concatenate two Uint8Arrays. */
function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/** Convert Uint8Array to lowercase hex string. */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Convert hex string to Uint8Array. Throws if invalid. */
export function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("Invalid hex length");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) throw new Error("Invalid hex character");
    out[i] = byte;
  }
  return out;
}

/** Build a leaf hash for a ledger entry: SHA-256(entry_hash from DB row). */
async function leafHash(entry: Pick<LedgerEntry, "entry_hash">): Promise<Uint8Array> {
  return sha256(fromHex(entry.entry_hash));
}

/** Build the Merkle root from a sorted list of ledger entries.
 *  Entries must be ordered by entry_id ascending (monotonic within tenant).
 *  Returns the root hash as a hex string (64 characters).
 */
export async function computeMerkleRoot(entries: Array<Pick<LedgerEntry, "entry_hash">>): Promise<string> {
  if (entries.length === 0) {
    // Empty tree: hash of empty string (convention for this system)
    return toHex(await sha256(""));
  }

  // Build leaf hashes
  let level: Uint8Array[] = [];
  for (const entry of entries) {
    level.push(await leafHash(entry));
  }

  // Iteratively hash pairs until single root remains
  while (level.length > 1) {
    const nextLevel: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = level[i + 1] ?? left; // Duplicate last node if odd count
      // Branch hash: SHA-256(0x01 || left || right)
      const branchPrefix = new Uint8Array([0x01]);
      const combined = concat(concat(branchPrefix, left), right);
      nextLevel.push(await sha256(combined));
    }
    level = nextLevel;
  }

  return toHex(level[0]!);
}

/** A single step in a Merkle proof: the sibling hash and whether it's on the right. */
export interface ProofStep {
  /** Hex-encoded sibling hash (64 characters). */
  siblingHash: string;
  /** True if the sibling is on the right side of the pair (current is left). */
  isRightSibling: boolean;
}

/** Generate an inclusion proof for a specific entry in a batch.
 *  Returns null if the target entry is not found in the provided entries.
 *  The proof can be verified against the Merkle root without the full entry list.
 */
export async function generateInclusionProof(
  entries: Array<Pick<LedgerEntry, "entry_id" | "entry_hash">>,
  targetEntryId: bigint,
): Promise<{ root: string; proof: ProofStep[]; leafIndex: number } | null> {
  const targetIndex = entries.findIndex((e) => e.entry_id === targetEntryId);
  if (targetIndex === -1) return null;

  // Build all leaf hashes with their original indices preserved
  const leafHashes: Uint8Array[] = [];
  for (const entry of entries) {
    leafHashes.push(await leafHash(entry));
  }

  const proof: ProofStep[] = [];
  let currentIndex = targetIndex;
  let currentLevel = leafHashes;

  while (currentLevel.length > 1) {
    const nextLevel: Uint8Array[] = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i]!;
      const right = currentLevel[i + 1] ?? left; // Duplicate last if odd

      // If this pair contains our target, record the sibling
      const pairContainsTarget = i === currentIndex || (i + 1 === currentIndex && currentLevel[i + 1] !== undefined);
      if (pairContainsTarget) {
        if (currentIndex === i) {
          // Target is left, sibling is right (or duplicated left if odd)
          proof.push({ siblingHash: toHex(right), isRightSibling: true });
        } else {
          // Target is right, sibling is left
          proof.push({ siblingHash: toHex(left), isRightSibling: false });
        }
      }

      // Branch hash for next level
      const branchPrefix = new Uint8Array([0x01]);
      const combined = concat(concat(branchPrefix, left), right);
      nextLevel.push(await sha256(combined));
    }

    // Update index for next level
    currentIndex = Math.floor(currentIndex / 2);
    currentLevel = nextLevel;
  }

  const root = toHex(currentLevel[0]!);
  return { root, proof, leafIndex: targetIndex };
}

/** Verify an inclusion proof.
 *  Recomputes the root from the leaf hash and proof steps, compares to expected root.
 *  Returns true if the proof is valid for the given leaf data and root.
 */
export async function verifyInclusionProof(
  leafEntryHash: string,
  proof: ProofStep[],
  expectedRoot: string,
): Promise<boolean> {
  // Compute leaf hash from entry_hash
  let currentHash = await sha256(fromHex(leafEntryHash));

  for (const step of proof) {
    const sibling = fromHex(step.siblingHash);
    let combined: Uint8Array;
    const branchPrefix = new Uint8Array([0x01]);

    if (step.isRightSibling) {
      // Sibling is on the right: hash(left=current, right=sibling)
      combined = concat(concat(branchPrefix, currentHash), sibling);
    } else {
      // Sibling is on the left: hash(left=sibling, right=current)
      combined = concat(concat(branchPrefix, sibling), currentHash);
    }

    currentHash = await sha256(combined);
  }

  return toHex(currentHash) === expectedRoot;
}

/** Compute the Merkle root for a batch of ledger entries and return
 *  the root along with per-entry metadata needed for snapshots.
 *  Used by the nightly job that updates Tenant.ledger_head_hash.
 */
export async function computeLedgerRoot(
  entries: Array<Pick<LedgerEntry, "entry_id" | "entry_hash" | "created_at">>,
): Promise<{
  root: string;
  entryCount: number;
  firstEntryId: bigint | null;
  lastEntryId: bigint | null;
  firstCreatedAt: string | null;
  lastCreatedAt: string | null;
}> {
  const root = await computeMerkleRoot(entries);

  if (entries.length === 0) {
    return {
      root,
      entryCount: 0,
      firstEntryId: null,
      lastEntryId: null,
      firstCreatedAt: null,
      lastCreatedAt: null,
    };
  }

  return {
    root,
    entryCount: entries.length,
    firstEntryId: entries[0]!.entry_id,
    lastEntryId: entries[entries.length - 1]!.entry_id,
    firstCreatedAt: entries[0]!.created_at,
    lastCreatedAt: entries[entries.length - 1]!.created_at,
  };
}

/** Format a proof for inclusion in a dispute snapshot JSON.
 *  Returns a compact, verifiable representation.
 */
export function formatProofForSnapshot(proof: ProofStep[]): Array<{
  sibling: string;
  side: "left" | "right";
}> {
  return proof.map((step) => ({
    sibling: step.siblingHash,
    side: step.isRightSibling ? "right" : "left",
  }));
}

/** Parse a proof from snapshot format back to ProofStep array. */
export function parseProofFromSnapshot(
  formatted: Array<{ sibling: string; side: "left" | "right" }>,
): ProofStep[] {
  return formatted.map((f) => ({
    siblingHash: f.sibling,
    isRightSibling: f.side === "right",
  }));
}

/** Create a canonical string representation of ledger entry data
 *  for external verification tools. This matches the canonical JSON
 *  stored in LedgerEntry.payload_canonical_json but with deterministic
 *  key ordering for hashing.
 */
export function canonicalizeLedgerPayload(payload: unknown): string {
  // Deep sort keys for deterministic serialization
  const sortKeys = (obj: unknown): unknown => {
    if (obj === null || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map(sortKeys);
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
      sorted[key] = sortKeys((obj as Record<string, unknown>)[key]);
    }
    return sorted;
  };
  return JSON.stringify(sortKeys(payload));
}

/** Verify that a ledger entry's entry_hash matches its content.
 *  Recomputes the hash from prev_hash, payload_hash, timestamp, and actor.
 *  Used by auditors to validate chain integrity.
 */
export async function verifyEntryHash(
  entry: Pick<LedgerEntry, "prev_hash" | "payload_hash" | "created_at" | "actor_user_id" | "entry_hash">,
): Promise<boolean> {
  const parts = [
    entry.prev_hash ?? "",
    entry.payload_hash,
    entry.created_at,
    String(entry.actor_user_id ?? "system"),
  ];
  const canonical = parts.join("||");
  const computed = toHex(await sha256(canonical));
  return computed === entry.entry_hash;
}
