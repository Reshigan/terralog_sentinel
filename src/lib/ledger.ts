interface Env {
  DB: {
    prepare(query: string): {
      bind(...values: unknown[]): {
        run(): Promise<unknown>;
      };
    };
  };
}

export async function hashCanonical(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

interface LedgerEntry {
  entry_type: string;
  entity_type: string;
  entity_id: string;
  payload_canonical_json: string;
  actor_user_id: number;
  actor_role: string;
}

export async function ledgerAppend(
  env: Env,
  tenantId: string,
  entry: LedgerEntry
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO ledger (
      tenant_id, entry_type, entity_type, entity_id,
      payload_canonical_json, actor_user_id, actor_role, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      tenantId,
      entry.entry_type,
      entry.entity_type,
      entry.entity_id,
      entry.payload_canonical_json,
      entry.actor_user_id,
      entry.actor_role,
      new Date().toISOString()
    )
    .run();
}