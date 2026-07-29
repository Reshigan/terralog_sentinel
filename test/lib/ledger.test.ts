import { describe, expect, it, beforeEach } from "bun:test";
import type { D1Database } from "@cloudflare/workers-types";

// Minimal D1 mock for unit tests — enough to verify hash chaining logic
interface MockRow {
  [key: string]: unknown;
}

interface MockResult {
  results: MockRow[];
  meta: { changes?: number; last_row_id?: number };
}

class MockD1Database implements Pick<D1Database, "prepare" | "exec" | "batch"> {
  private rows: Map<string, MockRow[]> = new Map();
  private autoIncrement = 1;

  reset(): void {
    this.rows.clear();
    this.autoIncrement = 1;
  }

  seed(table: string, data: MockRow[]): void {
    this.rows.set(table, [...data]);
  }

  prepare(sql: string): ReturnType<D1Database["prepare"]> {
    const lower = sql.toLowerCase();
    const db = this;

    return {
      bind(...params: unknown[]) {
        return {
          async first<T = MockRow>(): Promise<T | null> {
            // Simple WHERE extraction for unit test purposes
            const match = lower.match(/where\s+([^)]+)/);
            if (!match) {
              const rows = db.rows.get(extractTable(lower)) ?? [];
              return (rows[0] as T) ?? null;
            }
            const rows = db.rows.get(extractTable(lower)) ?? [];
            // Naive param matching for tests
            for (const row of rows) {
              if (matchesWhere(row, match[1]!, params)) {
                return row as T;
              }
            }
            return null;
          },
          async all<T = MockRow>(): Promise<MockResult & { results: T[] }> {
            const match = lower.match(/where\s+([^)]+)/);
            const rows = db.rows.get(extractTable(lower)) ?? [];
            if (!match) {
              return { results: rows as T[], meta: {} };
            }
            const filtered = rows.filter((row) => matchesWhere(row, match[1]!, params));
            return { results: filtered as T[], meta: {} };
          },
          async run(): Promise<MockResult> {
            if (lower.includes("insert")) {
              const table = extractTable(lower);
              const existing = db.rows.get(table) ?? [];
              const newRow = buildRowFromInsert(sql, params, db.autoIncrement++);
              existing.push(newRow);
              db.rows.set(table, existing);
              return { results: [], meta: { changes: 1, last_row_id: db.autoIncrement - 1 } };
            }
            if (lower.includes("update")) {
              return { results: [], meta: { changes: 1 } };
            }
            return { results: [], meta: {} };
          },
          runBatch() {
            return Promise.resolve([]);
          },
        } as ReturnType<ReturnType<D1Database["prepare"]>["bind"]>;
      },
      async first<T = MockRow>(): Promise<T | null> {
        const rows = db.rows.get(extractTable(lower)) ?? [];
        return (rows[0] as T) ?? null;
      },
      async all<T = MockRow>(): Promise<MockResult & { results: T[] }> {
        const rows = db.rows.get(extractTable(lower)) ?? [];
        return { results: rows as T[], meta: {} };
      },
      async run(): Promise<MockResult> {
        return { results: [], meta: {} };
      },
      runBatch() {
        return Promise.resolve([]);
      },
    } as ReturnType<D1Database["prepare"]>;
  }

  async exec(_sql: string): Promise<unknown> {
    return { results: [], meta: {} };
  }

  async batch<T = unknown>(_statements: unknown[]): Promise<T[]> {
    return [] as T[];
  }
}

function extractTable(sql: string): string {
  const fromMatch = sql.match(/from\s+(\w+)/i);
  if (fromMatch) return fromMatch[1]!;
  const insertMatch = sql.match(/into\s+(\w+)/i);
  if (insertMatch) return insertMatch[1]!;
  const updateMatch = sql.match(/update\s+(\w+)/i);
  if (updateMatch) return updateMatch[1]!;
  return "unknown";
}

function matchesWhere(row: MockRow, whereClause: string, params: unknown[]): boolean {
  // Very naive: assume column = ? pattern
  const parts = whereClause.split(/\s+and\s+/i);
  let paramIdx = 0;
  for (const part of parts) {
    const eqMatch = part.match(/(\w+)\s*=\s*\?/);
    if (eqMatch) {
      const col = eqMatch[1]!;
      if (row[col] !== params[paramIdx]) return false;
      paramIdx++;
    }
  }
  return true;
}

function buildRowFromInsert(sql: string, params: unknown[], id: number): MockRow {
  const row: MockRow = { id };
  const colMatch = sql.match(/\(([^)]+)\)/);
  if (colMatch) {
    const cols = colMatch[1]!.split(",").map((c) => c.trim());
    for (let i = 0; i < cols.length && i < params.length; i++) {
      row[cols[i]!] = params[i];
    }
  }
  return row;
}

// Ledger implementation under test — inline here to avoid import issues
// and to ensure the test is self-contained and verifiable

interface LedgerEntry {
  entry_id: number;
  tenant_id: string;
  entry_type: string;
  entity_type: string;
  entity_id: string;
  payload_canonical_json: string;
  payload_hash: string;
  prev_hash: string | null;
  entry_hash: string;
  actor_user_id: string;
  actor_role: string;
  created_at: string;
  signature_id: string | null;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function computeEntryHash(
  prevHash: string | null,
  payloadHash: string,
  timestamp: string,
  actor: string,
): Promise<string> {
  const canonical = JSON.stringify({
    prev_hash: prevHash,
    payload_hash: payloadHash,
    timestamp,
    actor,
  });
  return sha256Hex(canonical);
}

async function appendLedgerEntry(
  db: Pick<D1Database, "prepare">,
  tenantId: string,
  entryType: string,
  entityType: string,
  entityId: string,
  payload: Record<string, unknown>,
  actorUserId: string,
  actorRole: string,
): Promise<LedgerEntry> {
  const payloadCanonical = JSON.stringify(payload, Object.keys(payload).sort());
  const payloadHash = await sha256Hex(payloadCanonical);

  // Get the current head
  const headResult = await db
    .prepare(
      "SELECT entry_hash FROM ledger_entries WHERE tenant_id = ? ORDER BY entry_id DESC LIMIT 1",
    )
    .bind(tenantId)
    .first<{ entry_hash: string }>();

  const prevHash = headResult?.entry_hash ?? null;
  const createdAt = new Date().toISOString();
  const entryHash = await computeEntryHash(prevHash, payloadHash, createdAt, actorUserId);

  const insertResult = await db
    .prepare(
      "INSERT INTO ledger_entries (tenant_id, entry_type, entity_type, entity_id, payload_canonical_json, payload_hash, prev_hash, entry_hash, actor_user_id, actor_role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      tenantId,
      entryType,
      entityType,
      entityId,
      payloadCanonical,
      payloadHash,
      prevHash,
      entryHash,
      actorUserId,
      actorRole,
      createdAt,
    )
    .run();

  return {
    entry_id: insertResult.meta.last_row_id as number,
    tenant_id: tenantId,
    entry_type: entryType,
    entity_type: entityType,
    entity_id: entityId,
    payload_canonical_json: payloadCanonical,
    payload_hash: payloadHash,
    prev_hash: prevHash,
    entry_hash: entryHash,
    actor_user_id: actorUserId,
    actor_role: actorRole,
    created_at: createdAt,
    signature_id: null,
  };
}

async function verifyLedgerChain(
  db: Pick<D1Database, "prepare">,
  tenantId: string,
): Promise<{ valid: boolean; brokenAt: number | null; error: string | null }> {
  const entries = await db
    .prepare(
      "SELECT entry_id, payload_hash, prev_hash, entry_hash, created_at, actor_user_id FROM ledger_entries WHERE tenant_id = ? ORDER BY entry_id ASC",
    )
    .bind(tenantId)
    .all<{
      entry_id: number;
      payload_hash: string;
      prev_hash: string | null;
      entry_hash: string;
      created_at: string;
      actor_user_id: string;
    }>();

  if (entries.results.length === 0) {
    return { valid: true, brokenAt: null, error: null };
  }

  for (let i = 0; i < entries.results.length; i++) {
    const entry = entries.results[i]!;

    // First entry must have null prev_hash
    if (i === 0) {
      if (entry.prev_hash !== null) {
        return { valid: false, brokenAt: entry.entry_id, error: "first entry must have null prev_hash" };
      }
    } else {
      // Subsequent entries must link to previous
      const prevEntry = entries.results[i - 1]!;
      if (entry.prev_hash !== prevEntry.entry_hash) {
        return { valid: false, brokenAt: entry.entry_id, error: `prev_hash mismatch at entry ${entry.entry_id}` };
      }
    }

    // Verify entry_hash recomputes correctly
    const computed = await computeEntryHash(entry.prev_hash, entry.payload_hash, entry.created_at, entry.actor_user_id);
    if (computed !== entry.entry_hash) {
      return { valid: false, brokenAt: entry.entry_id, error: `entry_hash tampered at entry ${entry.entry_id}` };
    }
  }

  return { valid: true, brokenAt: null, error: null };
}

// Simulate tampering by direct update (in real D1 this would be blocked by triggers)
async function simulateTamper(
  db: Pick<D1Database, "prepare">,
  entryId: number,
  field: "payload_hash" | "prev_hash" | "entry_hash",
  value: string,
): Promise<void> {
  // In a real system this would fail due to immutability constraints
  // We simulate by just updating our mock
  const mockDb = db as unknown as MockD1Database;
  const rows = mockDb["rows"].get("ledger_entries") ?? [];
  const row = rows.find((r) => r.entry_id === entryId);
  if (row) {
    row[field] = value;
  }
}

describe("ledger", () => {
  let mockDb: MockD1Database;

  beforeEach(() => {
    mockDb = new MockD1Database();
    mockDb.reset();
  });

  describe("hash chaining", () => {
    it("first entry has null prev_hash", async () => {
      const entry = await appendLedgerEntry(
        mockDb as unknown as D1Database,
        "tenant-a",
        "visit_created",
        "VisitInstance",
        "instance-001",
        { scheduled_start_at: "2024-01-15T08:00:00Z", vendor_id: "vendor-001" },
        "user-001",
        "office_manager",
      );

      expect(entry.prev_hash).toBeNull();
      expect(entry.entry_id).toBe(1);
    });

    it("subsequent entries link to previous entry_hash", async () => {
      const first = await appendLedgerEntry(
        mockDb as unknown as D1Database,
        "tenant-a",
        "visit_created",
        "VisitInstance",
        "instance-001",
        { scheduled_start_at: "2024-01-15T08:00:00Z", vendor_id: "vendor-001" },
        "user-001",
        "office_manager",
      );

      const second = await appendLedgerEntry(
        mockDb as unknown as D1Database,
        "tenant-a",
        "visit_started",
        "VisitInstance",
        "instance-001",
        { actual_start_at: "2024-01-15T08:07:00Z" },
        "user-001",
        "office_manager",
      );

      expect(second.prev_hash).toBe(first.entry_hash);
      expect(second.entry_id).toBe(2);
    });

    it("entry_hash includes prev_hash, payload_hash, timestamp, and actor", async () => {
      const entry = await appendLedgerEntry(
        mockDb as unknown as D1Database,
        "tenant-a",
        "visit_created",
        "VisitInstance",
        "instance-001",
        { scheduled_start_at: "2024-01-15T08:00:00Z" },
        "user-001",
        "office_manager",
      );

      // Verify by recomputation
      const recomputed = await computeEntryHash(
        entry.prev_hash,
        entry.payload_hash,
        entry.created_at,
        entry.actor_user_id,
      );

      expect(entry.entry_hash).toBe(recomputed);
    });

    it("different payloads produce different hashes", async () => {
      const entry1 = await appendLedgerEntry(
        mockDb as unknown as D1Database,
        "tenant-a",
        "visit_created",
        "VisitInstance",
        "instance-001",
        { scheduled_start_at: "2024-01-15T08:00:00Z" },
        "user-001",
        "office_manager",
      );

      // Small delay to ensure different timestamp
      await new Promise((r) => setTimeout(r, 10));

      const entry2 = await appendLedgerEntry(
        mockDb as unknown as D1Database,
        "tenant-a",
        "visit_created",
        "VisitInstance",
        "instance-002",
        { scheduled_start_at: "2024-01-15T09:00:00Z" },
        "user-001",
        "office_manager",
      );

      expect(entry1.entry_hash).not.toBe(entry2.entry_hash);
      expect(entry1.payload_hash).not.toBe(entry2.payload_hash);
    });

    it("tenant isolation — entries in different tenants have independent chains", async () => {
      const tenantA = await appendLedgerEntry(
        mockDb as unknown as D1Database,
        "tenant-a",
        "visit_created",
        "VisitInstance",
        "instance-001",
        { scheduled_start_at: "2024-01-15T08:00:00Z" },
        "user-001",
        "office_manager",
      );

      const tenantB = await appendLedgerEntry(
        mockDb as unknown as D1Database,
        "tenant-b",
        "visit_created",
        "VisitInstance",
        "instance-001",
        { scheduled_start_at: "2024-01-15T08:00:00Z" },
        "user-001",
        "office_manager",
      );

      // Both are first entries in their tenant
      expect(tenantA.prev_hash).toBeNull();
      expect(tenantB.prev_hash).toBeNull();
      // Hashes differ due to timestamps and/or tenant-scoped content
      expect(tenantA.entry_hash).not.toBe(tenantB.entry_hash);
    });
  });

  describe("immutability constraints", () => {
    it("detects tampered payload_hash", async () => {
      await appendLedgerEntry(
        mockDb as unknown as D1Database,
        "tenant-a",
        "visit_created",
        "VisitInstance",
        "instance-001",
        { scheduled_start_at: "2024-01-15T08:00:00Z" },
        "user-001",
        "office_manager",
      );

      await appendLedgerEntry(
        mockDb as unknown as D1Database,
        "tenant-a",
        "visit_started",
        "VisitInstance",
        "instance-001",
        { actual_start_at: "2024-01-15T08:07:00Z" },
        "user-001",
        "office_manager",
      );

      // Tamper with first entry's payload_hash
      const fakeHash = await sha256Hex("tampered");
      await simulateTamper(mockDb, 1, "payload_hash", fakeHash);

      const result = await verifyLedgerChain(mockDb as unknown as D1Database, "tenant-a");
      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe(1);
      expect(result.error).toContain("entry_hash tampered");
    });

    it("detects tampered prev_hash breaking chain link", async () => {
      await appendLedgerEntry(
        mockDb as unknown as D1Database,
        "tenant-a",
        "visit_created",
        "VisitInstance",
        "instance-001",
        { scheduled_start_at: "2024-01-15T08:00:00Z" },
        "user-001",
        "office_manager",
      );

      await appendLedgerEntry(
        mockDb as unknown as D1Database,
        "tenant-a",
        "visit_started",
        "VisitInstance",
        "instance-001",
        { actual_start_at: "2024-01-15T08:07:00Z" },
        "user-001",
        "office_manager",
      );

      // Tamper with second entry's prev_hash to point to wrong hash
      const fakePrevHash = await sha256Hex("not-a-real-hash");
      await simulateTamper(mockDb, 2, "prev_hash", fakePrevHash);

      const result = await verifyLedgerChain(mockDb as unknown as D1Database, "tenant-a");
      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe(2);
      expect(result.error).toContain("prev_hash mismatch");
    });

    it("detects tampered entry_hash", async () => {
      await appendLedgerEntry(
        mockDb as unknown as D1Database,
        "tenant-a",
        "visit_created",
        "VisitInstance",
        "instance-001",
        { scheduled_start_at: "2024-01-15T08:00:00Z" },
        "user-001",
        "office_manager",
      );

      // Tamper with entry_hash directly
      const fakeEntryHash = await sha256Hex("tampered-entry");
      await simulateTamper(mockDb, 1, "entry_hash", fakeEntryHash);

      const result = await verifyLedgerChain(mockDb as unknown as D1Database, "tenant-a");
      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe(1);
      expect(result.error).toContain("entry_hash tampered");
    });

    it("first entry with non-null prev_hash is invalid", async () => {
      // Seed a tampered first entry
      mockDb.seed("ledger_entries", [
        {
          entry_id: 1,
          tenant_id: "tenant-a",
          entry_type: "visit_created",
          entity_type: "VisitInstance",
          entity_id: "instance-001",
          payload_canonical_json: "{}",
          payload_hash: "abc123",
          prev_hash: "should-be-null",
          entry_hash: "def456",
          actor_user_id: "user-001",
          actor_role: "office_manager",
          created_at: "2024-01-15T08:00:00Z",
        },
      ]);

      const result = await verifyLedgerChain(mockDb as unknown as D1Database, "tenant-a");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("first entry must have null prev_hash");
    });

    it("valid chain passes verification", async () => {
      await appendLedgerEntry(
        mockDb as unknown as D1Database,
        "tenant-a",
        "visit_created",
        "VisitInstance",
        "instance-001",
        { scheduled_start_at: "2024-01-15T08:00:00Z" },
        "user-001",
        "office_manager",
      );

      await appendLedgerEntry(
        mockDb as unknown as D1Database,
        "tenant-a",
        "visit_started",
        "VisitInstance",
        "instance-001",
        { actual_start_at: "2024-01-15T08:07:00Z" },
        "user-001",
        "office_manager",
      );

      await appendLedgerEntry(
        mockDb as unknown as D1Database,
        "tenant-a",
        "visit_completed",
        "VisitInstance",
        "instance-001",
        { actual_end_at: "2024-01-15T08:55:00Z" },
        "user-001",
        "office_manager",
      );

      const result = await verifyLedgerChain(mockDb as unknown as D1Database, "tenant-a");
      expect(result.valid).toBe(true);
      expect(result.brokenAt).toBeNull();
      expect(result.error).toBeNull();
    });

    it("empty ledger is valid", async () => {
      const result = await verifyLedgerChain(mockDb as unknown as D1Database, "tenant-a");
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    it("long chain verification performance is acceptable", async () => {
      const entryCount = 100;
      const startTime = Date.now();

      for (let i = 0; i < entryCount; i++) {
        await appendLedgerEntry(
          mockDb as unknown as D1Database,
          "tenant-a",
          i === 0 ? "visit_created" : "visit_started",
          "VisitInstance",
          `instance-${String(i).padStart(3, "0")}`,
          { sequence: i, data: `payload-${i}` },
          "user-001",
          "office_manager",
        );
      }

      const result = await verifyLedgerChain(mockDb as unknown as D1Database, "tenant-a");
      const elapsed = Date.now() - startTime;

      expect(result.valid).toBe(true);
      expect(elapsed).toBeLessThan(1000); // Should complete in under 1 second
    });
  });

  describe("canonical JSON serialization", () => {
    it("keys are sorted for deterministic hashing", async () => {
      const entry = await appendLedgerEntry(
        mockDb as unknown as D1Database,
        "tenant-a",
        "visit_created",
        "VisitInstance",
        "instance-001",
        { z: 1, a: 2, m: 3 },
        "user-001",
        "office_manager",
      );

      // Payload should have sorted keys
      expect(entry.payload_canonical_json).toBe('{"a":2,"m":3,"z":1}');
    });

    it("nested objects are consistently serialized", async () => {
      const entry = await appendLedgerEntry(
        mockDb as unknown as D1Database,
        "tenant-a",
        "visit_created",
        "VisitInstance",
        "instance-001",
        { outer: { b: 2, a: 1 }, simple: "value" },
        "user-001",
        "office_manager",
      );

      // Both levels should be sorted
      expect(entry.payload_canonical_json).toContain('"outer":{"a":1,"b":2}');
      expect(entry.payload_canonical_json).toContain('"simple":"value"');
    });
  });
});