/**
 * Cryptographic utilities for Terminus field data collection.
 * Uses Web Crypto API for all operations.
 */

/**
 * Derives an encryption key from a passphrase using PBKDF2-SHA256.
 * @param passphrase - User-provided passphrase
 * @param salt - Base64-encoded salt
 * @param iterations - Number of PBKDF2 iterations (default: 100000)
 * @returns Base64-encoded derived key material
 */
export async function deriveKey(
  passphrase: string,
  salt: string,
  iterations: number = 100000
): Promise<string> {
  const encoder = new TextEncoder();
  const passphraseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const saltBytes = Uint8Array.from(atob(salt), (c) => c.charCodeAt(0));

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations,
      hash: 'SHA-256',
    },
    passphraseKey,
    256
  );

  return btoa(String.fromCharCode(...new Uint8Array(derivedBits)));
}

/**
 * Generates a random AES-GCM IV (96-bit).
 * @returns Base64-encoded IV
 */
export function generateIV(): string {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return btoa(String.fromCharCode(...iv));
}

/**
 * Encrypts data using AES-256-GCM.
 * @param data - Plaintext to encrypt
 * @param key - Base64-encoded encryption key
 * @param iv - Base64-encoded IV
 * @returns Base64-encoded ciphertext
 */
export async function encrypt(
  data: string,
  key: string,
  iv: string
): Promise<string> {
  const encoder = new TextEncoder();
  const keyBytes = Uint8Array.from(atob(key), (c) => c.charCodeAt(0));
  const ivBytes = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ivBytes },
    cryptoKey,
    encoder.encode(data)
  );

  return btoa(String.fromCharCode(...new Uint8Array(ciphertext)));
}

/**
 * Decrypts data using AES-256-GCM.
 * @param ciphertext - Base64-encoded ciphertext
 * @param key - Base64-encoded encryption key
 * @param iv - Base64-encoded IV
 * @returns Decrypted plaintext
 */
export async function decrypt(
  ciphertext: string,
  key: string,
  iv: string
): Promise<string> {
  const decoder = new TextDecoder();
  const keyBytes = Uint8Array.from(atob(key), (c) => c.charCodeAt(0));
  const ivBytes = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0));
  const ciphertextBytes = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes },
    cryptoKey,
    ciphertextBytes
  );

  return decoder.decode(plaintext);
}

/**
 * Generates a SHA-256 hash of the input string.
 * @param data - Input data to hash
 * @returns Hex-encoded hash
 */
export async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generates a UUIDv5 (name-based, SHA-1 variant) using the Terminus namespace.
 * @param namespace - UUID namespace (e.g., 'terminus-field')
 * @param name - Name to generate UUID from
 * @returns UUID string
 */
export function generateUUIDv5(namespace: string, name: string): string {
  // Terminus namespace UUID: 6ba7b810-9dad-11d1-80b4-00c04fd430c8 (placeholder)
  // For production, use a fixed namespace UUID
  const namespaceBytes = stringToBytes('6ba7b810-9dad-11d1-80b4-00c04fd430c8');
  const nameBytes = stringToBytes(name);

  // Combine namespace + name and compute SHA-1
  const combined = new Uint8Array(namespaceBytes.length + nameBytes.length);
  combined.set(namespaceBytes);
  combined.set(nameBytes, namespaceBytes.length);

  // Use Web Crypto to compute SHA-1 (via digest)
  const hash = sha1sync(combined);

  // Set version (5) and variant (RFC 4122)
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;

  const hex = Array.from(hash)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Synchronous SHA-1 implementation for UUIDv5 (since Web Crypto doesn't support SHA-1 directly).
 */
function sha1sync(data: Uint8Array): Uint8Array {
  // Simple SHA-1 implementation for UUIDv5
  const ROTL = (n: number, s: number) => (n << s) | (n >>> (32 - s));

  const h0 = 0x67452301;
  const h1 = 0xefcdab89;
  const h2 = 0x98badcfe;
  const h3 = 0x10325476;
  const h4 = 0xc3d2e1f0;

  // Pre-processing: padding
  const ml = data.length * 8;
  const padded = new Uint8Array(((data.length + 63) & ~63) + 64);
  padded.set(data);
  padded[data.length] = 0x80;

  // Write message length as big-endian 64-bit
  for (let i = 0; i < 8; i++) {
    padded[padded.length - 8 + i] = (ml >>> (56 - i * 8)) & 0xff;
  }

  let h = h0, hh1 = h1, h2 = h2, h3 = h3, hh4 = h4;

  for (let chunk = 0; chunk < padded.length / 64; chunk++) {
    const w = new Uint32Array(80);
    const offset = chunk * 64;

    for (let i = 0; i < 16; i++) {
      w[i] =
        (padded[offset + i * 4] << 24) |
        (padded[offset + i * 4 + 1] << 16) |
        (padded[offset + i * 4 + 2] << 8) |
        padded[offset + i * 4 + 3];
    }

    for (let i = 16; i < 80; i++) {
      const val = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
      w[i] = (val << 1) | (val >>> 31);
    }

    let a = h, b = hh1, c = h2, d = h3, e = hh4;

    for (let i = 0; i < 80; i++) {
      let f: number, k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }

      const temp = ((ROTL(a, 5) + f + e + k + w[i]) >>> 0);
      e = d;
      d = c;
      c = ROTL(b, 30);
      b = a;
      a = temp;
    }

    h = (h + a) >>> 0;
    hh1 = (hh1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    hh4 = (hh4 + e) >>> 0;
  }

  const result = new Uint8Array(20);
  const view = new DataView(result.buffer);
  view.setUint32(0, h, false);
  view.setUint32(4, hh1, false);
  view.setUint32(8, h2, false);
  view.setUint32(12, h3, false);
  view.setUint32(16, hh4, false);

  return result;
}

/**
 * Converts a hex UUID string to bytes.
 */
function stringToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/-/g, '');
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Signs data using HMAC-SHA256.
 * @param data - Data to sign
 * @param key - Base64-encoded secret key
 * @returns Base64-encoded signature
 */
export async function sign(data: string, key: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyBytes = Uint8Array.from(atob(key), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    encoder.encode(data)
  );

  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

/**
 * Verifies an HMAC-SHA256 signature.
 * @param data - Original data
 * @param signature - Base64-encoded signature to verify
 * @param key - Base64-encoded secret key
 * @returns True if signature is valid
 */
export async function verify(
  data: string,
  signature: string,
  key: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const keyBytes = Uint8Array.from(atob(key), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const signatureBytes = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));

  return crypto.subtle.verify(
    'HMAC',
    cryptoKey,
    signatureBytes,
    encoder.encode(data)
  );
}

/**
 * Generates a deterministic deduplication ID for readings.
 * Uses SHA-256 of timestamp + latitude + longitude.
 * @param timestamp - ISO 8601 timestamp
 * @param latitude - GPS latitude
 * @param longitude - GPS longitude
 * @returns UUIDv5 with Terminus namespace
 */
export async function generateDedupeId(
  timestamp: string,
  latitude: number,
  longitude: number
): Promise<string> {
  const input = `${timestamp}${latitude.toFixed(6)}${longitude.toFixed(6)}`;
  const hash = await sha256(input);
  return generateUUIDv5('terminus-field', hash);
}
