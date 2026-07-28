/**
 * Regulatory Submission Bundle — packages readings into a signed, timestamped ZIP
 * for direct upload to government portals or registry APIs.
 */

import { sign } from "./crypto";

/**
 * Reading record structure for export.
 */
export interface Reading {
  id: number;
  tenant: string;
  photo?: string | null;
  latitude: number | null;
  longitude: number | null;
  numeric_value: number | null;
  timestamp: string;
  encrypted_blob?: string | null;
  sync_status: string;
  sync_attempts: number;
  dedupe_id?: string | null;
  site_id?: number | null;
  device_id?: number | null;
  equipment_id?: number | null;
  calibration_id?: number | null;
  created_at?: string | null;
  row_version: number;
}

/**
 * Export manifest included in the bundle.
 */
interface ExportManifest {
  generated_at: string;
  reading_count: number;
  signature_algorithm: "HMAC-SHA256";
  bundle_id: string;
}

/**
 * Creates a regulatory submission bundle ZIP containing all readings.
 * @param readings Array of reading records to include in the bundle
 * @param secretKey Secret key for HMAC-SHA256 signing
 * @returns Promise<Blob> containing the signed ZIP file
 * @throws Error on compression or encoding failures
 */
export async function createSubmissionBundle(
  readings: Reading[],
  secretKey: string
): Promise<Blob> {
  if (!secretKey) {
    throw new Error("Secret key is required for signing");
  }

  const bundleId = generateBundleId();
  const timestamp = new Date().toISOString();

  // Prepare readings as JSON
  const readingsJson = JSON.stringify(readings, null, 2);
  const readingsBytes = new TextEncoder().encode(readingsJson);

  // Prepare CSV for spreadsheet compatibility
  const csv = readingsToCsv(readings);
  const csvBytes = new TextEncoder().encode(csv);

  // Prepare manifest
  const manifest: ExportManifest = {
    generated_at: timestamp,
    reading_count: readings.length,
    signature_algorithm: "HMAC-SHA256",
    bundle_id: bundleId,
  };
  const manifestJson = JSON.stringify(manifest, null, 2);
  const manifestBytes = new TextEncoder().encode(manifestJson);

  // Create signature over readings JSON content
  const signature = await sign(readingsJson, secretKey);
  const signatureBytes = new TextEncoder().encode(signature);

  // Build ZIP file
  const zipParts: Uint8Array[] = [];

  // Local file header for readings.json
  zipParts.push(
    createLocalFileHeader("readings.json", readingsBytes.length)
  );
  zipParts.push(readingsBytes);
  zipParts.push(createDataDescriptor(readingsBytes.length));

  // Local file header for readings.csv
  zipParts.push(createLocalFileHeader("readings.csv", csvBytes.length));
  zipParts.push(csvBytes);
  zipParts.push(createDataDescriptor(csvBytes.length));

  // Local file header for manifest.json
  zipParts.push(
    createLocalFileHeader("manifest.json", manifestBytes.length)
  );
  zipParts.push(manifestBytes);
  zipParts.push(createDataDescriptor(manifestBytes.length));

  // Local file header for signature.sig
  zipParts.push(
    createLocalFileHeader("signature.sig", signatureBytes.length)
  );
  zipParts.push(signatureBytes);
  zipParts.push(createDataDescriptor(signatureBytes.length));

  // Central directory
  const centralDir = createCentralDirectory([
    { name: "readings.json", size: readingsBytes.length },
    { name: "readings.csv", size: csvBytes.length },
    { name: "manifest.json", size: manifestBytes.length },
    { name: "signature.sig", size: signatureBytes.length },
  ]);
  zipParts.push(centralDir);

  // End of central directory
  zipParts.push(createEndOfCentralDirectory(4, centralDir.length));

  // Combine all parts
  const totalLength = zipParts.reduce((acc, part) => acc + part.length, 0);
  const zipData = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of zipParts) {
    zipData.set(part, offset);
    offset += part.length;
  }

  return new Blob([zipData], { type: "application/zip" });
}

/**
 * Generates a unique bundle identifier.
 */
function generateBundleId(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "BUNDLE-";
  const randomValues = new Uint8Array(12);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(randomValues[i] % chars.length);
  }
  return result;
}

/**
 * Converts readings array to CSV format.
 */
function readingsToCsv(readings: Reading[]): string {
  const headers = [
    "id",
    "timestamp",
    "latitude",
    "longitude",
    "numeric_value",
    "sync_status",
    "site_id",
    "device_id",
    "equipment_id",
    "calibration_id",
    "dedupe_id",
    "created_at",
  ];

  const rows = readings.map((r) =>
    headers
      .map((h) => {
        const val = r[h as keyof Reading];
        if (val === null || val === undefined) return "";
        const str = String(val);
        // Escape quotes and wrap in quotes if contains comma, quote, or newline
        if (str.includes(',') || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      })
      .join(",")
  );

  return [headers.join(","), ...rows].join("\n");
}

/**
 * Creates a ZIP local file header.
 */
function createLocalFileHeader(name: string, size: number): Uint8Array {
  const encoder = new TextEncoder();
  const nameBytes = encoder.encode(name);
  const header = new Uint8Array(30 + nameBytes.length);
  const view = new DataView(header.buffer);

  // Local file header signature
  view.setUint32(0, 0x04034b50, true);
  // Version needed to extract (2.0)
  view.setUint16(4, 20);
  // General purpose bit flag
  view.setUint16(6, 0);
  // Compression method (0 = stored)
  view.setUint16(8, 0);
  // File last modification time
  view.setUint16(10, 0);
  // File last modification date
  view.setUint16(12, 0);
  // CRC-32 (placeholder, will be updated in data descriptor)
  view.setUint32(16, 0);
  // Compressed size
  view.setUint32(20, size, true);
  // Uncompressed size
  view.setUint24(24, size, true);
  // File name length
  view.setUint16(26, nameBytes.length, true);
  // Extra field length
  view.setUint18(28, 0);

  // File name
  header.set(nameBytes, 30);

  return header;
}

/**
 * Creates a ZIP data descriptor (used when CRC/sizes are unknown upfront).
 */
function createDataDescriptor(size: number): Uint8Array {
  const descriptor = new Uint8Array(16);
  const view = new DataView(descriptor.buffer);

  // Data descriptor signature
  view.setUint32(0, 0x08074b50, true);
  // CRC-32 (of empty content since we store without compression)
  view.setUint32(4, crc32(new Uint8Array(0)), true);
  // Compressed size
  view.setUint32(8, size, true);
  // Uncompressed size
  view.setUint32(12, size, true);

  return descriptor;
}

/**
 * Creates the central directory structure.
 */
function createCentralDirectory(
  files: { name: string; size: number }[]
): Uint8Array {
  const entries: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const encoder = new TextEncoder();
    const nameBytes = encoder.encode(file.name);
    const entry = new Uint8Array(46 + nameBytes.length);
    const view = new DataView(entry.buffer);

    // Central directory file header signature
    view.setUint32(0, 0x02014b50, true);
    // Version made by
    view.setUint16(4, 20);
    // Version needed to extract
    view.setUint16(6, 20);
    // General purpose bit flag
    view.setUint16(8, 0);
    // Compression method
    view.setUint16(10, 0);
    // File last modification time
    view.setUint16(12, 0);
    // File last modification date
    view.setUint16(14, 0);
    // CRC-32
    view.setUint32(16, 0, true);
    // Compressed size
    view.setUint32(20, file.size, true);
    // Uncompressed size
    view.setUint24(24, file.size, true);
    // File name length
    view.setUint16(26, nameBytes.length, true);
    // Extra field length
    view.setUint16(28, 0);
    // File comment length
    view.setUint16(30, 0);
    // Disk number start
    view.setUint16(32, 0);
    // Internal file attributes
    view.setUint16(34, 0);
    // External file attributes
    view.setUint32(36, 0, true);
    // Relative offset of local header
    view.setUint32(40, offset, true);

    // File name
    entry.set(nameBytes, 46);

    entries.push(entry);
    offset += 30 + nameBytes.length + file.size + 16; // header + name + data + descriptor
  }

  return concatUint8Arrays(entries);
}

/**
 * Creates the end of central directory record.
 */
function createEndOfCentralDirectory(
  fileCount: number,
  centralDirSize: number
): Uint8Array {
  const eocd = new Uint8Array(22);
  const view = new DataView(eocd.buffer);

  // End of central dir signature
  view.setUint32(0, 0x06054b50, true);
  // Number of this disk
  view.setUint16(4, 0);
  // Number of the disk with the start of the central directory
  view.setUint16(6, 0);
  // Total number of entries in the central directory on this disk
  view.setUint16(8, fileCount, true);
  // Total number of entries in the central directory
  view.setUint16(10, fileCount, true);
  // Size of the central directory
  view.setUint32(12, centralDirSize, true);
  // Offset of start of central directory
  view.setUint16(16, 0);
  // .ZIP file comment length
  view.setUint18(20, 0);

  return eocd;
}

/**
 * Concatenates multiple Uint8Arrays.
 */
function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/**
 * CRC-32 lookup table implementation.
 */
const crc32Table = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  return table;
})();

/**
 * Computes CRC-32 checksum.
 */
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = crc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Helper to set Uint24 (since DataView doesn't have setUint24).
 */
function setUint24(view: DataView, offset: number, value: number): void {
  view.setUint8(offset, value & 0xff);
  view.setUint8(offset + 1, (value >> 8) & 0xff);
  view.setUint8(offset + 2, (value >> 16) & 0xff);
}

// Patch DataView to support Uint24
DataView.prototype.setUint24 = function (
  byteOffset: number,
  value: number,
  littleEndian?: boolean
): void {
  if (littleEndian) {
    this.setUint8(byteOffset, value & 0xff);
    this.setUint8(byteOffset + 1, (value >> 8) & 0xff);
    this.setUint8(byteOffset + 2, (value >> 16) & 0xff);
  } else {
    this.setUint8(byteOffset, (value >> 16) & 0xff);
    this.setUint8(byteOffset + 1, (value >> 8) & 0xff);
    this.setUint8(byteOffset + 2, value & 0xff);
  }
};
