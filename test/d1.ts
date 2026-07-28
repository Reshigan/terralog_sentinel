// FROZEN — Sentinel golden template. Real-runtime truth for tests: a D1-shaped
// wrapper over bun:sqlite, so handler tests exercise real SQL against the real
// migrations instead of mocks.
import { Database } from "bun:sqlite";

type Row = Record<string, unknown>;

class Statement {
  constructor(
    private db: Database,
    private sql: string,
    private params: unknown[] = [],
  ) {}
  bind(...params: unknown[]): Statement {
    return new Statement(this.db, this.sql, params);
  }
  async all<T = Row>(): Promise<{ results: T[]; success: true; meta: Record<string, unknown> }> {
    const results = this.db.query(this.sql).all(...(this.params as never[])) as T[];
    return { results, success: true, meta: {} };
  }
  async first<T = Row>(): Promise<T | null> {
    return (this.db.query(this.sql).get(...(this.params as never[])) as T) ?? null;
  }
  async run(): Promise<{ success: true; meta: { changes: number; last_row_id: number } }> {
    this.db.query(this.sql).run(...(this.params as never[]));
    const meta = this.db.query("SELECT changes() AS c, last_insert_rowid() AS id").get() as {
      c: number;
      id: number;
    };
    return { success: true, meta: { changes: meta.c, last_row_id: meta.id } };
  }
  async raw<T = unknown[]>(): Promise<T[]> {
    return this.db.query(this.sql).values(...(this.params as never[])) as T[];
  }
}

export class D1Shim {
  readonly db: Database;
  constructor() {
    this.db = new Database(":memory:");
  }
  prepare(sql: string): Statement {
    return new Statement(this.db, sql);
  }
  async exec(sql: string): Promise<{ count: number; duration: number }> {
    this.db.exec(sql);
    return { count: 1, duration: 0 };
  }
  async batch(statements: Statement[]): Promise<unknown[]> {
    const out: unknown[] = [];
    for (const s of statements) out.push(await s.all());
    return out;
  }
}
