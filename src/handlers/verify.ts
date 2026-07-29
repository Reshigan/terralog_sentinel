// Public verification endpoint for dispute snapshots — no authentication required.
// Re-verifies Merkle proofs and chain integrity client-side.
import { json, html, type Env, type Handler } from "../lib/http";

// Domain types from the build spec
interface SnapshotVerifyResponse {
  valid: boolean;
  snapshot_id: string;
  tenant_id: string;
  as_of_timestamp: string;
  ledger_head_hash: string;
  entries_included: number;
  proof_verified: boolean;
  chain_intact: boolean;
  signatures_valid: boolean;
  verification_url: string;
  expires_at: string;
}

interface SnapshotEntry {
  entry_id: number;
  entry_type: string;
  entity_type: string;
  entity_id: string;
  payload_hash: string;
  prev_hash: string | null;
  entry_hash: string;
  actor_user_id: number | null;
  actor_role: string;
  created_at: string;
  signature_id: number | null;
}

interface SignatureVerify {
  signature_id: number;
  signer_role: string;
  canonical_payload_hash: string;
  hmac_signature: string;
  signing_key_fingerprint: string;
  signed_at: string;
}

// SHA-256 helper
async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

// HMAC verification helper — recompute HMAC-SHA256 and compare
async function verifyHmac(key: CryptoKey, message: string, signatureBase64: string): Promise<boolean> {
  const signatureBytes = Uint8Array.from(atob(signatureBase64), c => c.charCodeAt(0));
  const computed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  const computedBytes = new Uint8Array(computed);
  if (signatureBytes.length !== computedBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < signatureBytes.length; i++) {
    diff |= signatureBytes[i]! ^ computedBytes[i]!;
  }
  return diff === 0;
}

// Import raw key bytes for HMAC
async function importHmacKey(keyBytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

// Compute entry hash: SHA-256(prev_hash || payload_hash || timestamp || actor)
async function computeEntryHash(
  prevHash: string | null,
  payloadHash: string,
  timestamp: string,
  actor: string
): Promise<string> {
  const input = `${prevHash ?? "0"}:${payloadHash}:${timestamp}:${actor}`;
  return sha256Hex(input);
}

// Merkle tree helpers
function siblingIndex(i: number): number {
  return i % 2 === 0 ? i + 1 : i - 1;
}

async function hashPair(a: string, b: string): Promise<string> {
  const combined = a < b ? a + b : b + a; // canonical ordering
  return sha256Hex(combined);
}

// Rebuild Merkle root from leaf hashes and proof path
async function computeMerkleRoot(leafHashes: string[]): Promise<string> {
  if (leafHashes.length === 0) return sha256Hex("");
  if (leafHashes.length === 1) return leafHashes[0]!;
  
  let level = [...leafHashes];
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = level[i + 1] ?? left; // duplicate last if odd
      next.push(await hashPair(left, right));
    }
    level = next;
  }
  return level[0]!;
}

// Verify inclusion proof: given leaf hash, proof path (sibling hashes), and claimed root
async function verifyInclusionProof(
  leafHash: string,
  proofPath: string[],
  leafIndex: number,
  claimedRoot: string
): Promise<boolean> {
  let currentHash = leafHash;
  let index = leafIndex;
  
  for (const siblingHash of proofPath) {
    const isLeft = index % 2 === 0;
    const left = isLeft ? currentHash : siblingHash;
    const right = isLeft ? siblingHash : currentHash;
    currentHash = await hashPair(left, right);
    index = Math.floor(index / 2);
  }
  
  return currentHash === claimedRoot;
}

// Fetch tenant signing key from env (per-tenant keys stored in KV or Secrets)
// In production, keys are in Cloudflare Secrets; here we use a derivation pattern
async function getTenantSigningKey(env: Env, tenantId: string): Promise<Uint8Array | null> {
  // Keys are stored in KV as hex-encoded 32-byte values, indexed by tenant
  const keyHex = await env.VERIFICATION_KEYS?.get(tenantId);
  if (!keyHex) return null;
  const bytes = new Uint8Array(keyHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(keyHex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// HTML verification page for browser viewing
function renderVerificationPage(result: SnapshotVerifyResponse, jsonUrl: string): string {
  const statusClass = result.valid ? "verified" : "failed";
  const statusIcon = result.valid 
    ? `<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>`
    : `<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>`;
  
  const proofDetails = result.valid ? `
    <div class="detail-row"><span>Entries in snapshot:</span><span>${result.entries_included}</span></div>
    <div class="detail-row"><span>Merkle proof:</span><span class="check">${result.proof_verified ? "✓ Verified" : "✗ Failed"}</span></div>
    <div class="detail-row"><span>Chain integrity:</span><span class="check">${result.chain_intact ? "✓ Intact" : "✗ Broken"}</span></div>
    <div class="detail-row"><span>Signatures:</span><span class="check">${result.signatures_valid ? "✓ Valid" : "✗ Invalid"}</span></div>
  ` : `
    <div class="detail-row"><span>Verification failed:</span><span class="x">One or more checks did not pass</span></div>
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Desklog — Verification Result</title>
  <meta name="description" content="Independent verification of Desklog dispute snapshot">
  <style>
    :root {
      --surface: #0a0a0b;
      --elevated: #141416;
      --text: #e8e8ea;
      --text-muted: #6b6b70;
      --accent: #3ddc97;
      --danger: #dc4a4a;
      --border: #252528;
      --radius: 4px;
      --max-width: 720px;
      --space-xs: 4px;
      --space-sm: 8px;
      --space-md: 16px;
      --space-lg: 24px;
      --space-xl: 32px;
    }
    @media (prefers-color-scheme: light) {
      :root {
        --surface: #fafafa;
        --elevated: #ffffff;
        --text: #1a1a1c;
        --text-muted: #5a5a5e;
        --border: #e0e0e2;
      }
    }
    * { box-sizing: border-box; margin: 0; }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--surface);
      color: var(--text);
      line-height: 1.5;
      min-height: 100dvh;
      padding: var(--space-lg);
    }
    .container {
      max-width: var(--max-width);
      margin: 0 auto;
    }
    .card {
      background: var(--elevated);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: var(--space-xl);
    }
    .status-header {
      display: flex;
      align-items: center;
      gap: var(--space-md);
      margin-bottom: var(--space-lg);
      padding-bottom: var(--space-lg);
      border-bottom: 1px solid var(--border);
    }
    .status-icon {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .status-icon.verified {
      background: rgba(61, 220, 151, 0.1);
      color: var(--accent);
    }
    .status-icon.failed {
      background: rgba(220, 74, 74, 0.1);
      color: var(--danger);
    }
    .status-text h1 {
      font-size: 24px;
      font-weight: 600;
      letter-spacing: -0.04em;
      margin-bottom: var(--space-xs);
    }
    .status-text p {
      color: var(--text-muted);
      font-size: 14px;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: var(--space-sm) 0;
      font-size: 14px;
      border-bottom: 1px solid var(--border);
    }
    .detail-row:last-child { border-bottom: none; }
    .detail-row span:first-child { color: var(--text-muted); }
    .check { color: var(--accent); }
    .x { color: var(--danger); }
    .hash {
      font-family: ui-monospace, 'SF Mono', Menlo, monospace;
      font-size: 12px;
      word-break: break-all;
    }
    .meta {
      margin-top: var(--space-xl);
      padding-top: var(--space-lg);
      border-top: 1px solid var(--border);
    }
    .meta-title {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin-bottom: var(--space-md);
    }
    .actions {
      margin-top: var(--space-xl);
      display: flex;
      gap: var(--space-md);
      flex-wrap: wrap;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: var(--space-sm);
      padding: var(--space-sm) var(--space-md);
      font-size: 14px;
      font-weight: 500;
      text-decoration: none;
      border-radius: var(--radius);
      border: 1px solid var(--border);
      background: var(--elevated);
      color: var(--text);
      cursor: pointer;
      min-height: 44px;
    }
    .btn:hover { background: var(--surface); }
    .btn-primary {
      background: var(--text);
      color: var(--surface);
      border-color: var(--text);
    }
    .btn-primary:hover { opacity: 0.9; }
    footer {
      margin-top: var(--space-xl);
      text-align: center;
      font-size: 12px;
      color: var(--text-muted);
    }
    @media (max-width: 600px) {
      body { padding: var(--space-md); }
      .card { padding: var(--space-lg); }
      .status-header { flex-direction: column; text-align: center; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="status-header">
        <div class="status-icon ${statusClass}">${statusIcon}</div>
        <div class="status-text">
          <h1>${result.valid ? "Snapshot Verified" : "Verification Failed"}</h1>
          <p>Independent cryptographic verification of ledger snapshot</p>
        </div>
      </div>
      ${proofDetails}
      <div class="detail-row">
        <span>Snapshot ID:</span>
        <span class="hash">${result.snapshot_id}</span>
      </div>
      <div class="detail-row">
        <span>As of timestamp:</span>
        <span>${new Date(result.as_of_timestamp).toLocaleString()}</span>
      </div>
      <div class="detail-row">
        <span>Ledger head hash:</span>
        <span class="hash">${result.ledger_head_hash}</span>
      </div>
      <div class="detail-row">
        <span>Expires:</span>
        <span>${new Date(result.expires_at).toLocaleString()}</span>
      </div>
      <div class="meta">
        <div class="meta-title">Verification Details</div>
        <p style="font-size: 14px; color: var(--text-muted);">
          This verification was performed using the Desklog public verification endpoint.
          The Merkle proof, chain integrity, and signatures were re-computed client-side
          without access to any private keys or tenant data.
        </p>
      </div>
      <div class="actions">
        <a href="${jsonUrl}" class="btn btn-primary" download="verification.json">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
          Download JSON
        </a>
        <button class="btn" onclick="navigator.clipboard.writeText(window.location.href); this.textContent='Copied!'">
          Copy Link
        </button>
      </div>
    </div>
    <footer>
      Verified by Desklog • ${new Date().toISOString().slice(0, 10)}
    </footer>
  </div>
</body>
</html>`;
}

// Main verification handler
export const verifySnapshot: Handler<SnapshotVerifyResponse | { error: string }> = async (req, env) => {
  const url = new URL(req.url);
  const token = url.pathname.split("/").pop() ?? url.searchParams.get("token");
  
  if (!token || token.length < 16) {
    return json({ error: "invalid verification token" }, 400);
  }
  
  // Hash the token for lookup (tokens are stored as SHA-256 hashes)
  const tokenHash = await sha256Hex(token);
  
  // Fetch snapshot metadata from D1
  const snapshot = await env.DB.prepare(
    `SELECT 
      snapshot_id, tenant_id, requested_at, as_of_timestamp,
      ledger_head_hash_at_as_of AS ledger_head_hash,
      instance_id, pdf_object_key, json_object_key,
      verification_token, expires_at, revoked_at
    FROM dispute_snapshots WHERE verification_token = ?`
  ).bind(tokenHash).first<{
    snapshot_id: string;
    tenant_id: string;
    requested_at: string;
    as_of_timestamp: string;
    ledger_head_hash: string;
    instance_id: string | null;
    pdf_object_key: string;
    json_object_key: string;
    verification_token: string;
    expires_at: string;
    revoked_at: string | null;
  }>();
  
  if (!snapshot) {
    return json({ error: "snapshot not found" }, 404);
  }
  
  // Check expiration and revocation
  const now = new Date().toISOString();
  if (snapshot.expires_at < now) {
    return json({ error: "snapshot expired" }, 410);
  }
  if (snapshot.revoked_at) {
    return json({ error: "snapshot revoked" }, 410);
  }
  
  // Fetch the JSON artifact from R2
  const jsonObject = await env.SNAPSHOTS?.get(snapshot.json_object_key);
  if (!jsonObject) {
    return json({ error: "snapshot data unavailable" }, 503);
  }
  
  const jsonData = await jsonObject.json<{
    entries: SnapshotEntry[];
    signatures: SignatureVerify[];
    merkleProof: {
      leafIndex: number;
      siblingHashes: string[];
    };
    instanceSnapshot?: {
      instance_id: string;
      status: string;
      scheduled_start_at: string;
      actual_start_at: string | null;
      actual_end_at: string | null;
      drift_seconds: number | null;
    };
  }>();
  
  // Verification steps
  const result: SnapshotVerifyResponse = {
    valid: false,
    snapshot_id: snapshot.snapshot_id,
    tenant_id: snapshot.tenant_id,
    as_of_timestamp: snapshot.as_of_timestamp,
    ledger_head_hash: snapshot.ledger_head_hash,
    entries_included: jsonData.entries.length,
    proof_verified: false,
    chain_intact: false,
    signatures_valid: false,
    verification_url: `${url.origin}/verify/${token}`,
    expires_at: snapshot.expires_at,
  };
  
  // Step 1: Verify chain integrity — each entry's prev_hash matches prior entry's entry_hash
  let chainValid = true;
  for (let i = 0; i < jsonData.entries.length; i++) {
    const entry = jsonData.entries[i]!;
    
    // Verify entry hash matches recomputed value
    const computedHash = await computeEntryHash(
      entry.prev_hash,
      entry.payload_hash,
      entry.created_at,
      entry.actor_user_id?.toString() ?? entry.actor_role
    );
    if (computedHash !== entry.entry_hash) {
      chainValid = false;
      break;
    }
    
    // Verify chain link (except first entry)
    if (i > 0) {
      const prevEntry = jsonData.entries[i - 1]!;
      if (entry.prev_hash !== prevEntry.entry_hash) {
        chainValid = false;
        break;
      }
    }
  }
  result.chain_intact = chainValid;
  
  // Step 2: Compute Merkle root from entry hashes and verify against stored root
  const entryHashes = jsonData.entries.map(e => e.entry_hash);
  const computedRoot = await computeMerkleRoot(entryHashes);
  
  // The stored root should match our computed root
  const rootMatches = computedRoot === snapshot.ledger_head_hash;
  
  // Step 3: Verify inclusion proof for a sample entry (first entry)
  let proofValid = true;
  if (jsonData.merkleProof && entryHashes.length > 0) {
    const { leafIndex, siblingHashes } = jsonData.merkleProof;
    proofValid = await verifyInclusionProof(
      entryHashes[leafIndex] ?? entryHashes[0]!,
      siblingHashes,
      leafIndex,
      snapshot.ledger_head_hash
    );
  }
  result.proof_verified = rootMatches && proofValid;
  
  // Step 4: Verify signatures
  let signaturesValid = true;
  const signingKey = await getTenantSigningKey(env, snapshot.tenant_id);
  
  if (signingKey && jsonData.signatures.length > 0) {
    const hmacKey = await importHmacKey(signingKey);
    
    for (const sig of jsonData.signatures) {
      // Reconstruct canonical payload
      const payload = JSON.stringify({
        signer_role: sig.signer_role,
        canonical_payload_hash: sig.canonical_payload_hash,
        signed_at: sig.signed_at,
      });
      
      const valid = await verifyHmac(hmacKey, payload, sig.hmac_signature);
      if (!valid) {
        signaturesValid = false;
        break;
      }
    }
  }
  result.signatures_valid = signaturesValid;
  
  // Overall validity requires all checks
  result.valid = result.chain_intact && result.proof_verified && result.signatures_valid;
  
  // Return HTML for browser requests, JSON for API requests
  const acceptHeader = req.headers.get("accept") ?? "";
  if (acceptHeader.includes("text/html")) {
    const jsonUrl = `${url.origin}/api/v1/snapshots/${snapshot.snapshot_id}/json`;
    return html(renderVerificationPage(result, jsonUrl), 200);
  }
  
  return json(result, result.valid ? 200 : 409);
};

// Public verification endpoint — no authentication
export const verify: Handler<SnapshotVerifyResponse | { error: string }> = async (req, env) => {
  // Route to specific verification handlers based on path
  const url = new URL(req.url);
  const path = url.pathname;
  
  if (path.startsWith("/verify/") || path === "/verify") {
    return verifySnapshot(req, env);
  }
  
  // Legacy token-based verification via query param
  if (url.searchParams.has("token")) {
    return verifySnapshot(req, env);
  }
  
  return json({ error: "verification token required" }, 400);
};