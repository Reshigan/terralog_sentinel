-- GENERATED auth schema. A user owns a tenant (signup mints a brand NEW one —
-- never client-supplied, so no signup can escalate into someone else's tenant)
-- and a role. Sessions store only a SHA-256 HASH of the bearer token, so a DB
-- read alone can never mint a live session.
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'site_supervisor',
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users (email);
-- The admin user list and the last-admin count both read "the users of ONE
-- tenant", so the index leads with tenant — without it every workspace's member
-- list scans every other workspace's rows.
CREATE INDEX IF NOT EXISTS users_tenant_idx ON users (tenant, id);

-- Invitations, and their twin: account recovery. The ONLY way a second person
-- lands in an existing tenant is an invite; signup with none always mints a brand
-- new one. The tenant is stamped here from the inviting admin's verified session,
-- so redeeming a row can never place anyone anywhere the minter could not already
-- see. Like sessions, only a SHA-256 HASH of the token is stored, and a row is
-- single-use (used_at) and expiring — a leaked table is not a pile of live
-- credentials.
--
-- reset_user_id is what makes this table carry BOTH: NULL is "join this
-- workspace", a user id is "set THAT person's password". They are the same
-- object — tenant-scoped, hashed, expiring, single-use, redeemed at
-- POST /api/auth/signup — so they are one table and one claim path rather than
-- two that can drift apart. Every lookup pins the column, so the two kinds can
-- never be spent as each other.
CREATE TABLE IF NOT EXISTS invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  invited_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  reset_user_id INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS invites_token_hash_idx ON invites (token_hash);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_hash_idx ON sessions (token_hash);

-- Append-only audit trail. No generated handler ever UPDATEs or DELETEs this
-- table, which is the whole point: a row here is evidence of a mutation, and
-- evidence you can edit is not evidence. tenant is stamped from the verified
-- session (see audit() in src/handlers/auth.ts), never from the request, so a
-- caller cannot forge a line into someone else's history.
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL,
  actor_id INTEGER NOT NULL,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,          -- create | update | delete
  entity TEXT NOT NULL,          -- table name
  row_id INTEGER,
  changes TEXT,                  -- JSON of the submitted fields, or null
  at TEXT NOT NULL
);
-- Both reads are tenant-scoped, so both indexes lead with tenant: without that
-- leading column SQLite would have to scan every other workspace's rows first.
-- (1) the trail view: newest-first for one workspace. at is ISO-8601, so its
-- lexicographic order IS its chronological order; id breaks same-millisecond ties.
CREATE INDEX IF NOT EXISTS audit_log_tenant_at_idx ON audit_log (tenant, at DESC, id DESC);
-- (2) one row's history: "what happened to consignment 41", newest first.
CREATE INDEX IF NOT EXISTS audit_log_tenant_entity_row_idx ON audit_log (tenant, entity, row_id, id DESC);
