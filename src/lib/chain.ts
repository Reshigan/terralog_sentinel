/**
 * Immutable Evidence Chain — creates a cryptographic chain of custody for readings,
 * enabling third-party verification without trusting the technician or the app.
 * Critical for carbon credits or regulatory reporting.
 */

import type { Reading } from "../types";

/**
 * Represents a link in the cryptographic chain.
 */
export interface ChainLink {
  hash: string;
  prevHash: string;
}

/**
 * Creates a deterministic hash of a reading for chain inclusion.
 * @param reading - The reading to hash
 * @returns Hex-encoded SHA-256 hash of the canonical reading data
 */
async function hashReading(reading: Reading): Promise<string> {
  const encoder = new TextEncoder();

  // Build canonical string from immutable fields only
  const canonical = [
    reading.timestamp ?? "",
    reading.latitude?.toFixed(6) ?? "",
    reading.longitude?.toFixed(6) ?? "",
    reading.numeric_value?.toString() ?? "",
    reading.dedupe_id ?? "",
    reading.site_id?.toString() ?? "",
    reading.equipment_id?.toString() ?? "",
    reading.calibration_id?.toString() ?? "",
    reading.row_version?.toString() ?? "1",
  ].join("|");

  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(canonical));
  const hashArray = new Uint8Array(hashBuffer);

  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Genesis hash for the first reading in a chain (no previous hash).
 * Uses a fixed string to ensure reproducibility.
 */
const GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000";

/**
 * Creates a cryptographic chain link for a reading.
 * The hash includes the previous reading's hash, creating an immutable chain.
 *
 * @param reading - The reading to create a chain link for
 * @param previousHash - The hash of the previous reading in the chain (empty string for first)
 * @returns ChainLink with the new hash and the previous hash used
 * @throws Error if crypto.subtle operations fail
 */
export async function createChainLink(
  reading: Reading,
  previousHash: string = ""
): Promise<ChainLink> {
  if (!reading) {
    throw new Error("Reading is required");
  }

  // Use genesis hash if no previous hash provided
  const prevHash = previousHash || GENESIS_HASH;

  // Hash the current reading
  const readingHash = await hashReading(reading);

  // Create the chain hash: SHA-256(readingHash + prevHash)
  const encoder = new TextEncoder();
  const combined = readingHash + prevHash;

  let chainHashBuffer: ArrayBuffer;
  try {
    chainHashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(combined));
  } catch (cause) {
    throw new Error("Failed to compute chain hash", { cause });
  }

  const chainHashArray = new Uint8Array(chainHashBuffer);
  const hash = Array.from(chainHashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return {
    hash,
    prevHash,
  };
}

/**
 * Verifies that a reading's hash is consistent with the chain.
 *
 * @param reading - The reading to verify
 * @param expectedPrevHash - The expected previous hash
 * @param expectedHash - The expected current hash
 * @returns true if the chain link is valid
 * @throws Error if crypto.subtle operations fail
 */
export async function verifyChainLink(
  reading: Reading,
  expectedPrevHash: string,
  expectedHash: string
): Promise<boolean> {
  const computed = await createChainLink(reading, expectedPrevHash);
  return computed.hash === expectedHash;
}

/**
 * Gets the genesis hash (used for the first reading in a chain).
 */
export function getGenesisHash(): string {
  return GENESIS_HASH;
}
