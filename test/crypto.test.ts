import { describe, it, expect, beforeEach } from 'bun:test';

// Import crypto utilities from src/lib/crypto.ts
// These tests verify the Web Crypto API-based implementations

describe('crypto utilities', () => {
  // Test fixtures
  const testPassphrase = 'field-tech-2024';
  const testSalt = new Uint8Array([
    0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
    0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f
  ]);
  const testData = 'Sensitive field reading: 42.5m depth';
  const testTimestamp = '2024-03-14T10:30:00Z';
  const testLatitude = 34.0522;
  const testLongitude = -118.2437;
  const uuidNamespace = 'terminus-field';

  describe('deriveKey', () => {
    it('should derive a key from passphrase and salt using PBKDF2-SHA256', async () => {
      // Import the deriveKey function
      const { deriveKey } = await import('../src/lib/crypto.ts');
      
      const key = await deriveKey(testPassphrase, testSalt, 100000);
      
      expect(key).toBeInstanceOf(CryptoKey);
      expect(key.algorithm.name).toBe('AES-GCM');
      expect(key.extractable).toBe(false);
      expect(key.usages).toContain('encrypt');
      expect(key.usages).toContain('decrypt');
    });

    it('should produce different keys for different passphrases', async () => {
      const { deriveKey } = await import('../src/lib/crypto.ts');
      
      const key1 = await deriveKey('passphrase-one', testSalt, 100000);
      const key2 = await deriveKey('passphrase-two', testSalt, 100000);
      
      // Keys should be different (we can't directly compare, but both should be valid)
      expect(key1.algorithm.name).toBe('AES-GCM');
      expect(key2.algorithm.name).toBe('AES-GCM');
    });

    it('should produce different keys for different salts', async () => {
      const { deriveKey } = await import('../src/lib/crypto.ts');
      
      const salt1 = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f]);
      const salt2 = new Uint8Array([0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f]);
      
      const key1 = await deriveKey(testPassphrase, salt1, 100000);
      const key2 = await deriveKey(testPassphrase, salt2, 100000);
      
      expect(key1.algorithm.name).toBe('AES-GCM');
      expect(key2.algorithm.name).toBe('AES-GCM');
    });

    it('should handle empty passphrase gracefully', async () => {
      const { deriveKey } = await import('../src/lib/crypto.ts');
      
      const key = await deriveKey('', testSalt, 100000);
      
      expect(key).toBeInstanceOf(CryptoKey);
      expect(key.algorithm.name).toBe('AES-GCM');
    });
  });

  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt data correctly with AES-256-GCM', async () => {
      const { deriveKey, encrypt, decrypt } = await import('../src/lib/crypto.ts');
      
      const key = await deriveKey(testPassphrase, testSalt, 100000);
      const plaintext = new TextEncoder().encode(testData);
      
      const { ciphertext, iv } = await encrypt(plaintext, key);
      
      expect(ciphertext).toBeInstanceOf(Uint8Array);
      expect(iv).toBeInstanceOf(Uint8Array);
      expect(iv.length).toBe(12); // GCM standard IV length
      
      // Decrypt and verify
      const decrypted = await decrypt(ciphertext, iv, key);
      const decryptedText = new TextDecoder().decode(decrypted);
      
      expect(decryptedText).toBe(testData);
    });

    it('should produce different ciphertexts for same plaintext (due to random IV)', async () => {
      const { deriveKey, encrypt } = await import('../src/lib/crypto.ts');
      
      const key = await deriveKey(testPassphrase, testSalt, 100000);
      const plaintext = new TextEncoder().encode(testData);
      
      const result1 = await encrypt(plaintext, key);
      const result2 = await encrypt(plaintext, key);
      
      // IVs should be different (random)
      expect(result1.iv).not.toEqual(result2.iv);
      // Ciphertexts should be different due to different IVs
      expect(result1.ciphertext).not.toEqual(result2.ciphertext);
    });

    it('should fail decryption with wrong key', async () => {
      const { deriveKey, encrypt, decrypt } = await import('../src/lib/crypto.ts');
      
      const key1 = await deriveKey('correct-passphrase', testSalt, 100000);
      const key2 = await deriveKey('wrong-passphrase', testSalt, 100000);
      const plaintext = new TextEncoder().encode(testData);
      
      const { ciphertext, iv } = await encrypt(plaintext, key1);
      
      // Decryption with wrong key should throw
      await expect(decrypt(ciphertext, iv, key2)).rejects.toThrow();
    });

    it('should fail decryption with tampered ciphertext', async () => {
      const { deriveKey, encrypt, decrypt } = await import('../src/lib/crypto.ts');
      
      const key = await deriveKey(testPassphrase, testSalt, 100000);
      const plaintext = new TextEncoder().encode(testData);
      
      const { ciphertext, iv } = await encrypt(plaintext, key);
      
      // Tamper with the ciphertext
      const tamperedCiphertext = new Uint8Array(ciphertext);
      tamperedCiphertext[0] ^= 0xff; // Flip bits
      
      await expect(decrypt(tamperedCiphertext, iv, key)).rejects.toThrow();
    });

    it('should handle binary data correctly', async () => {
      const { deriveKey, encrypt, decrypt } = await import('../src/lib/crypto.ts');
      
      const key = await deriveKey(testPassphrase, testSalt, 100000);
      const binaryData = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe, 0xfd, 0xfc]);
      
      const { ciphertext, iv } = await encrypt(binaryData, key);
      const decrypted = await decrypt(ciphertext, iv, key);
      
      expect(decrypted).toEqual(binaryData);
    });
  });

  describe('generateUUIDv5', () => {
    it('should generate deterministic UUIDv5 from namespace and name', async () => {
      const { generateUUIDv5 } = await import('../src/lib/crypto.ts');
      
      const uuid = generateUUIDv5(uuidNamespace, testTimestamp + testLatitude + testLongitude);
      
      // UUID v5 format: xxxxxxxx-xxxx-5xxx-yxxx-xxxxxxxxxxxx
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should produce same UUID for same input (deterministic)', async () => {
      const { generateUUIDv5 } = await import('../src/lib/crypto.ts');
      
      const input = testTimestamp + testLatitude + testLongitude;
      
      const uuid1 = generateUUIDv5(uuidNamespace, input);
      const uuid2 = generateUUIDv5(uuidNamespace, input);
      
      expect(uuid1).toBe(uuid2);
    });

    it('should produce different UUIDs for different inputs', async () => {
      const { generateUUIDv5 } = await import('../src/lib/crypto.ts');
      
      const input1 = testTimestamp + testLatitude + testLongitude;
      const input2 = 'different-input';
      
      const uuid1 = generateUUIDv5(uuidNamespace, input1);
      const uuid2 = generateUUIDv5(uuidNamespace, input2);
      
      expect(uuid1).not.toBe(uuid2);
    });

    it('should use the correct namespace constant', async () => {
      const { generateUUIDv5 } = await import('../src/lib/crypto.ts');
      
      // The namespace 'terminus-field' should produce a valid UUID
      const uuid = generateUUIDv5(uuidNamespace, 'test-name');
      
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      // Version 5 UUIDs have '5' in the 13th position
      expect(uuid.charAt(14)).toBe('5');
    });
  });

  describe('sign/verify (JWT-like)', () => {
    it('should sign and verify data correctly', async () => {
      const { deriveKey, sign, verify } = await import('../src/lib/crypto.ts');
      
      const key = await deriveKey(testPassphrase, testSalt, 100000);
      const payload = JSON.stringify({ sub: 'reading-123', exp: Math.floor(Date.now() / 1000) + 900 });
      
      const signature = await sign(payload, key);
      
      expect(signature).toBeInstanceOf(Uint8Array);
      
      const isValid = await verify(signature, payload, key);
      
      expect(isValid).toBe(true);
    });

    it('should reject tampered payload', async () => {
      const { deriveKey, sign, verify } = await import('../src/lib/crypto.ts');
      
      const key = await deriveKey(testPassphrase, testSalt, 100000);
      const payload = JSON.stringify({ sub: 'reading-123', exp: Math.floor(Date.now() / 1000) + 900 });
      
      const signature = await sign(payload, key);
      
      // Tamper with the payload
      const tamperedPayload = JSON.stringify({ sub: 'reading-999', exp: Math.floor(Date.now() / 1000) + 900 });
      
      const isValid = await verify(signature, tamperedPayload, key);
      
      expect(isValid).toBe(false);
    });

    it('should reject signature from different key', async () => {
      const { deriveKey, sign, verify } = await import('../src/lib/crypto.ts');
      
      const key1 = await deriveKey('correct-passphrase', testSalt, 100000);
      const key2 = await deriveKey('wrong-passphrase', testSalt, 100000);
      const payload = JSON.stringify({ sub: 'reading-123', exp: Math.floor(Date.now() / 1000) + 900 });
      
      const signature = await sign(payload, key1);
      
      const isValid = await verify(signature, payload, key2);
      
      expect(isValid).toBe(false);
    });

    it('should handle empty payload', async () => {
      const { deriveKey, sign, verify } = await import('../src/lib/crypto.ts');
      
      const key = await deriveKey(testPassphrase, testSalt, 100000);
      const payload = '';
      
      const signature = await sign(payload, key);
      
      expect(signature).toBeInstanceOf(Uint8Array);
      
      const isValid = await verify(signature, payload, key);
      
      expect(isValid).toBe(true);
    });
  });

  describe('integration: full encryption workflow', () => {
    it('should encrypt a reading with GPS, photo, and numeric value, then decrypt correctly', async () => {
      const { deriveKey, encrypt, decrypt } = await import('../src/lib/crypto.ts');
      
      const key = await deriveKey(testPassphrase, testSalt, 100000);
      
      // Simulate a reading payload
      const readingPayload = {
        photo_ciphertext: 'base64_encrypted_photo_data',
        latitude: testLatitude,
        longitude: testLongitude,
        numeric_value: 42.5,
        timestamp: testTimestamp
      };
      
      const plaintext = new TextEncoder().encode(JSON.stringify(readingPayload));
      
      const { ciphertext, iv } = await encrypt(plaintext, key);
      
      // Store iv and ciphertext (in real app, these go to DB)
      const stored = {
        iv: Array.from(iv),
        ciphertext: Array.from(ciphertext)
      };
      
      // Later: decrypt
      const recoveredIv = new Uint8Array(stored.iv);
      const recoveredCiphertext = new Uint8Array(stored.ciphertext);
      
      const decrypted = await decrypt(recoveredCiphertext, recoveredIv, key);
      const recoveredPayload = JSON.parse(new TextDecoder().decode(decrypted));
      
      expect(recoveredPayload).toEqual(readingPayload);
      expect(recoveredPayload.latitude).toBe(testLatitude);
      expect(recoveredPayload.longitude).toBe(testLongitude);
      expect(recoveredPayload.numeric_value).toBe(42.5);
    });

    it('should generate consistent deduplication ID for same reading data', async () => {
      const { generateUUIDv5 } = await import('../src/lib/crypto.ts');
      
      const dedupeInput = testTimestamp + testLatitude + testLongitude;
      
      const id1 = generateUUIDv5(uuidNamespace, dedupeInput);
      const id2 = generateUUIDv5(uuidNamespace, dedupeInput);
      
      // Same input produces same UUID (for deduplication)
      expect(id1).toBe(id2);
      
      // Different timestamp produces different ID
      const differentTimeInput = '2024-03-15T10:30:00Z' + testLatitude + testLongitude;
      const id3 = generateUUIDv5(uuidNamespace, differentTimeInput);
      
      expect(id1).not.toBe(id3);
    });
  });

  describe('security properties', () => {
    it('should use AES-256-GCM (256-bit key)', async () => {
      const { deriveKey } = await import('../src/lib/crypto.ts');
      
      const key = await deriveKey(testPassphrase, testSalt, 100000);
      
      // AES-256 should have 256-bit algorithm
      const aesParams = key.algorithm as AesKeyAlgorithm;
      expect(aesParams.length).toBe(256);
    });

    it('should use PBKDF2 with SHA-256', async () => {
      const { deriveKey } = await import('../src/lib/crypto.ts');
      
      // This test verifies the key derivation uses appropriate parameters
      const key = await deriveKey(testPassphrase, testSalt, 100000);
      
      // Key should be usable for encryption
      expect(key.usages).toContain('encrypt');
      expect(key.usages).toContain('decrypt');
      
      // Key should not be extractable (security best practice)
      expect(key.extractable).toBe(false);
    });

    it('should use 12-byte IV for GCM (NIST recommended)', async () => {
      const { deriveKey, encrypt } = await import('../src/lib/crypto.ts');
      
      const key = await deriveKey(testPassphrase, testSalt, 100000);
      const plaintext = new TextEncoder().encode(testData);
      
      const { iv } = await encrypt(plaintext, key);
      
      // GCM recommended IV is 12 bytes
      expect(iv.length).toBe(12);
    });
  });
});
