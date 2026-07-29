# Desklog

A calendar-anchored, append-only service-visit ledger for small-business office managers. Built for Cloudflare Workers, D1, and R2.

## Quick Start

Prerequisites:
- Node.js 20+ and pnpm (or Bun)
- A Cloudflare account with Workers and D1 enabled
- Wrangler CLI: `npm install -g wrangler`

### Local Development

1. **Authenticate with Cloudflare:**
   ```bash
   wrangler login
   ```

2. **Create your local D1 database:**
   ```bash
   wrangler d1 create desklog-dev
   # Copy the database ID from output
   ```

3. **Configure `wrangler.toml`:**
   ```toml
   name = "desklog"
   main = "src/index.ts"
   compatibility_date = "2024-01-01"

   [[d1_databases]]
   binding = "DB"
   database_name = "desklog-dev"
   database_id = "YOUR_DATABASE_ID_HERE"
   ```

4. **Apply migrations:**
   ```bash
   wrangler d1 migrations apply desklog-dev --local
   ```

5. **Start the dev server:**
   ```bash
   wrangler dev --local
   ```

   The app will be available at `http://localhost:8787`. Changes to `src/` are hot-reloaded.

### Database Migrations

Migrations live in `migrations/` and are applied in lexical order.

**Create a new migration:**
```bash
wrangler d1 migrations create desklog-dev add_visit_indexes
```

**Apply migrations to local dev:**
```bash
wrangler d1 migrations apply desklog-dev --local
```

**Apply migrations to production:**
```bash
wrangler d1 migrations apply desklog-dev --remote
```

Migrations must be backward-compatible (add columns, dual-write, backfill, switch reads, drop). The `ledger_head_hash` column on `Tenant` is append-only by design; no migration modifies historical entries.

### Running Tests

Tests use Vitest with the `@cloudflare/vitest-pool-workers` pool for isolated D1 per-test:

```bash
# Install dependencies
pnpm install

# Run type check
pnpm typecheck

# Run tests
pnpm test
```

Tests automatically create ephemeral D1 databases and apply `migrations/0001_init.sql`. Seed data from `0002_seed.sql` is skipped in tests.

Coverage requirements: ≥80% line coverage on `src/lib/ledger.ts`, `src/lib/merkle.ts`, and all `src/handlers/*.ts` files.

### Deployment

**Staging (auto-deployed from `main`):**
```bash
pnpm run deploy --env staging
```

**Production (manual approval):**
```bash
pnpm run deploy --env production
```

CI runs `pnpm lint`, `pnpm typecheck`, and `pnpm test` on every PR. Merges to `main` auto-deploy to staging.

## Security: Key Handling

**⚠️ CRITICAL: Never commit credentials**

- All secrets live in Cloudflare Secrets, bound via `wrangler secret put`:
  ```bash
  wrangler secret put SIGNING_KEY_KMS_ID
  wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET
  wrangler secret put SMS_PROVIDER_API_KEY
  ```
- Never use placeholder values shaped like real keys in code, tests, or fixtures
  - ❌ `sk-...`, `AKIA...`, `ghp_...`, PEM blocks with `BEGIN PRIVATE KEY`
  - ✅ Use `REPLACE_ME_KEY`, `test-key-placeholder`, or generate test keys with `crypto.subtle`
- The build scans for credential-shaped strings and fails if found
- `src/lib/crypto.ts` exports `generateTestKey()` for tests — use it, never hardcode

## Project Structure

```
├── migrations/           # D1 schema migrations
├── src/
│   ├── index.ts         # Worker entry point (fetch + scheduled)
│   ├── lib/
│   │   ├── crypto.ts    # HMAC, SHA-256, key derivation
│   │   ├── ledger.ts    # LedgerEntry append-only operations
│   │   ├── merkle.ts    # Merkle tree root computation
│   │   ├── http.ts      # Routing, middleware, error handling
│   │   ├── jobs.ts      # Queue consumers (calendar sync, etc.)
│   │   └── schema.ts    # Zod schemas for all API inputs
│   └── handlers/        # Route handlers (auth, visits, receipts, etc.)
├── public/              # Static PWA assets (no build step)
│   ├── index.html
│   ├── styles/main.css
│   └── scripts/
│       ├── app.ts
│       └── offline-queue.ts
└── test/                # Vitest test suite
```

## Key Design Decisions

- **Per-tenant D1**: Each tenant has an isolated database; the control plane only holds registry and billing
- **Append-only ledger**: `LedgerEntry` has no UPDATE path; corrections append new entries with `prev_hash` chains
- **HMAC signatures**: Office and counterparty sign canonical JSON; `Signature` rows hold `canonical_payload_hash` and `hmac_signature`
- **Merkle verification**: Nightly Merkle root stored on `Tenant.ledger_head_hash`; dispute snapshots include inclusion proofs
- **Offline-first PWA**: Start taps queue in IndexedDB; replay on reconnect with original `created_at` preserved

## Troubleshooting

**"Cannot resolve DB binding" in tests:**
- Ensure `vitest.config.ts` has `@cloudflare/vitest-pool-workers` configured
- Check that `wrangler.toml` exists and has a `[[d1_databases]]` section

**Migration fails with "table already exists":**
- Use `CREATE TABLE IF NOT EXISTS` in all migrations
- For destructive changes, follow the backward-compatible path (add, dual-write, backfill, switch, drop)

**Type errors on `@cloudflare/workers-types`:**
- Run `pnpm install` to ensure types are present
- Check `tsconfig.json` includes `"types": ["@cloudflare/workers-types"]`

## License

Proprietary — see LICENSE file for terms.