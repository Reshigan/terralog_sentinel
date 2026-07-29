/**
 * Crypto utilities for Desklog ledger integrity.
 * Web Crypto API only — Workers ship it natively, no dependency needed.
 */

const encoder = new TextEncoder();

/** Encode string to Uint8Array */
export function encode(input: string): Uint8Array {
  return encoder.encode(input);
}

/** Convert ArrayBuffer to lowercase hex string */
export function toHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Convert hex string to Uint8Array */
export function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** SHA-256 hash of input string, returns lowercase hex */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encode(input));
  return toHex(digest);
}

/** SHA-256 hash of input bytes, returns lowercase hex */
export async function sha256HexBytes(input: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", input);
  return toHex(digest);
}

/** Generate cryptographically secure random bytes */
export function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

/** Generate a random token, return { plain, hash } where hash is SHA-256 of plain */
export async function generateToken(length: number = 32): Promise<{ plain: string; hash: string }> {
  const plain = toHex(randomBytes(length));
  const hash = await sha256Hex(plain);
  return { plain, hash };
}

/** HMAC-SHA256 with provided key bytes */
export async function hmacSha256(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, message);
  return new Uint8Array(signature);
}

/** HMAC-SHA256 with key and message as strings, returns base64 */
export async function hmacSha256Base64(keyHex: string, message: string): Promise<string> {
  const key = fromHex(keyHex);
  const messageBytes = encode(message);
  const signature = await hmacSha256(key, messageBytes);
  return btoa(String.fromCharCode(...signature));
}

/**
 * Canonical JSON serialization for ledger integrity.
 * Keys are sorted alphabetically, no whitespace, no undefined values.
 * This ensures the same object always serializes to the same string.
 */
export function canonicalJson(obj: unknown): string {
  return JSON.stringify(obj, (key, value) => {
    if (value === undefined) return undefined;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return Object.keys(value).sort().reduce((sorted, k) => {
        sorted[k] = (value as Record<string, unknown>)[k];
        return sorted;
      }, {} as Record<string, unknown>);
    }
    return value;
  });
}

/**
 * Hash a canonical JSON payload for ledger entries.
 * Returns SHA-256 hex of the canonical JSON representation.
 */
export async function hashPayload(obj: unknown): Promise<string> {
  return sha256Hex(canonicalJson(obj));
}

/**
 * First 8 bytes of SHA-256 of key material, as hex string (16 chars).
 * Used for key fingerprinting in signatures.
 */
export async function keyFingerprint(keyHex: string): Promise<string> {
  const full = await sha256Hex(keyHex);
  return full.slice(0, 16);
}

/** Timing-safe equality comparison for hex strings */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * PBKDF2 key derivation for password hashing.
 * Returns hex string of derived key.
 */
export async function pbkdf2Hex(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  );
  return toHex(bits);
}

/** Default PBKDF2 parameters */
export const PBKDF2_DEFAULT_ITERATIONS = 100_000;
export const SALT_BYTES = 16;

/**
 * Derive a signing key from tenant master secret using HKDF-like construction.
 * Uses HMAC-SHA256 as the extract-and-expand primitive.
 */
export async function deriveTenantKey(masterSecretHex: string, tenantId: string): Promise<string> {
  const master = fromHex(masterSecretHex);
  const info = encode(`desklog-tenant-${tenantId}`);
  
  // HKDF extract: PRK = HMAC-SHA256(salt=zero, IKM=master)
  const salt = new Uint8Array(32);
  const prk = await hmacSha256(salt, master);
  
  // HKDF expand: OKM = HMAC-SHA256(PRK, info || 0x01)
  const okmInput = new Uint8Array(info.length + 1);
  okmInput.set(info, 0);
  okmInput[info.length] = 0x01;
  const okm = await hmacSha256(prk, okmInput);
  
  return toHex(okm);
}
