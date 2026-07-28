# Terminus — Field Data Collection

**Offline-first PWA for off-grid technicians.**

Terminus captures field readings (photos, GPS, numeric values) with AES-256-GCM encryption, queues them for sync when connectivity returns, and provides a supervisor dashboard for monitoring sync health and aggregates.

---

## Quick Start

```bash
# Install dependencies
bun install

# Run local development server (wrangler dev)
bun run dev

# Run tests
bun test

# Deploy to Cloudflare Workers
bun run deploy
```

---

## Architecture

| Layer | Technology | Purpose |
|-------|------------|---------|
| Runtime | Cloudflare Workers | Edge API serving <50ms latency globally |
| Storage | D1 (SQLite) | Tenant-scoped persistence at the edge |
| Frontend | Vanilla TS/JS PWA | Works offline, no framework overhead |
| Encryption | Web Crypto API | AES-256-GCM, PBKDF2-SHA256 key derivation |
| Sync | Service Worker | Opportunistic background sync with exponential backoff |

### Tenant Isolation

Every database row includes a `tenant` column (default: `'default'`). All queries filter by tenant — there is no cross-tenant data access. The tenant is derived from the request (e.g., `?tenant=acme-corp`) or defaults to `'default'` for single-tenant deployments.

### Encryption Flow

1. **Device fingerprint**: On first run, the device computes a salt from `SHA-256(navigator.userAgent + screen.width + screen.height + hardwareConcurrency)`.
2. **Key derivation**: User enters a passphrase. PBKDF2-SHA256 derives a key (100,000 iterations) from the passphrase + device salt.
3. **Capture**: When saving a reading:
   - Photo is encrypted with AES-256-GCM
   - GPS + numeric value are stored alongside the encrypted blob
   - A UUIDv5 is generated from `SHA-256(timestamp + latitude + longitude)` — deterministic deduplication prevents duplicates on sync retry
4. **Key erasure**: After 5 failed sync attempts, the encryption key is erased and the user must re-enter the passphrase.

The passphrase is **never stored**. Only the salt and encrypted key material persist.

### Sync Flow

1. **Capture** (offline): Reading is saved locally with `sync_status = 'pending'`.
2. **Queue**: Service worker listens for `visibilitychange` and `focus` events.
3. **Retry**: On connectivity, pending readings are POSTed to `/api/sync` with exponential backoff (1s, 2s, 4s, 8s, 16s).
4. **Confirmation**: On 200 OK from the sync endpoint, status updates to `'synced'`. On failure after 5 attempts, status becomes `'failed'` and key erasure triggers.

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/readings` | Capture a new reading (photo, GPS, numeric value) |
| GET | `/api/readings` | List readings for tenant (filter by `sync_status`) |
| POST | `/api/sync` | Trigger sync of pending readings |
| GET | `/api/sync/status` | Get sync status (pending count, last sync time) |
| POST | `/api/keys` | Derive encryption key from passphrase |
| GET | `/api/keys/status` | Check if encryption key exists |

---

## Design System

### Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--color-surface` | `#0d0f11` | Page background |
| `--color-surface-muted` | `#1a1e24` | Borders, dividers |
| `--color-amber` | `#f5a623` | Primary accent, buttons, status indicators |
| `--color-amber-dim` | `#a67518` | Hover states, secondary accent |
| `--color-text` | `#e8eaed` | Primary text (WCAG AAA 7:1 contrast) |
| `--color-text-muted` | `#8b9099` | Secondary text |

### Typography

| Element | Font | Weight | Size |
|---------|------|--------|------|
| Headings | Rajdhani | 600 | 1.2rem |
| Body / Data | IBM Plex Mono | 400 | 1rem |
| Labels | IBM Plex Mono | 500 | 0.875rem |

### Layout

- Mobile-first single column
- 8px base grid
- 48px minimum touch targets
- Asymmetric split-view capture screen (40% camera / 60% inputs)
- No cards — flat planes separated by 1px borders
- No animations — instant state changes

### Accessibility

- WCAG AAA: 7:1 contrast ratio (amber on dark)
- Touch targets ≥48px
- Screen reader labels on all interactive elements
- No reliance on color alone (status uses icons + color)

---

## Features

### Calibration Trail

Every reading can be linked to an equipment record and its calibration history. The `calibration_logs` table tracks when equipment was calibrated, by whom, and when the next calibration is due. Readings taken with uncalibrated or overdue equipment are flagged in the dashboard.

### Chain of Custody

The `reading_history` table records every modification to a reading: who changed it, when, and what field changed. Combined with `audit_trail`, this provides a complete custody chain for regulatory compliance.

### Regulatory Export

Export endpoints support regulatory reporting requirements:

- **Daily aggregates**: `GET /api/daily_aggregates` — total readings, sync success rate, average numeric value per site/zone
- **Outliers**: `GET /api/outliers` — detected anomalies with z-scores, resolution status
- **Equipment status**: `GET /api/site_equipment_status` — warranty expiry, calibration due dates
- **Connectivity zones**: `GET /api/low_sync_zones` — zones where sync success rate drops below threshold

All exports include tenant filtering and can be filtered by date range.

---

## Project Structure

```
terminus/
├── src/
│   ├── index.ts           # Worker entry point
│   ├── routes.ts          # API route definitions
│   ├── types.ts           # Shared TypeScript contracts
│   ├── handlers/          # API endpoint handlers
│   │   ├── readings.ts
│   │   ├── sync.ts
│   │   ├── keys.ts
│   │   ├── calibrations.ts
│   │   ├── custody.ts
│   │   └── exports.ts
│   └── lib/               # Utilities
│       ├── crypto.ts      # AES-256-GCM, PBKDF2
│       ├── device.ts      # Device fingerprinting
│       └── regulatory.ts # Export helpers
├── public/
│   ├── index.html         # PWA entry
│   ├── capture.js         # Frontend capture logic
│   ├── styles.css         # Design system
│   ├── manifest.json      # PWA manifest
│   └── sw.js              # Service worker
├── migrations/
│   ├── 0001_init.sql      # Schema
│   └── 0002_seed.sql      # Demo data
├── test/                  # Integration tests
├── wrangler.toml          # Cloudflare config
└── package.json
```

---

## Configuration

All secrets and config come from `env` (Cloudflare Bindings). Key variables:

| Binding | Type | Purpose |
|---------|------|---------|
| `DB` | D1 | SQLite database |
| `ASSETS` | KV | Static frontend files |

Environment-specific settings (e.g., sync threshold, retry interval) are stored in the `sync_policys` and `sync_thresholds` tables.

---

## Troubleshooting

### "No encryption key"

User must enter passphrase at `/api/keys` before capturing readings. The UI prompts for passphrase if `GET /api/keys/status` returns `exists: false`.

### Sync stuck on "pending"

Check:
1. Network connectivity (service worker requires online)
2. Encryption key is valid (expired key = failed sync)
3. Sync threshold not exceeded (default: 5 attempts)

### High sync failure rate

- **Low battery**: Sync policy requires minimum battery level (`min_battery_level` in `sync_policys`)
- **Poor connectivity**: Check `connectivity_zones` table for signal strength per zone

---

## License

Proprietary — All rights reserved.
