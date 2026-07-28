// GENERATED auth handlers. Do not edit.
import { json, noteTenant, readJson } from "../lib/http";
import type { Env, Handler } from "../lib/http";

// ---- crypto: PBKDF2 password hashing, SHA-256 token hashing --------------------
// WebCrypto only — Workers ship it natively, no dependency needed.
const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const TOKEN_BYTES = 32; // 256 bits
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function toHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function pbkdf2Hex(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    256,
  );
  return toHex(bits);
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return toHex(digest);
}

// Password/hash comparison must not leak timing — a naive === short-circuits on
// the first differing byte, which is a measurable oracle over enough requests.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---- cookies ----------------------------------------------------------------------

function getCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

function sessionCookie(token: string, maxAgeSeconds: number): string {
  return "session=" + token + "; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=" + maxAgeSeconds;
}

const CLEAR_COOKIE = "session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";

async function startSession(env: Env, userId: number): Promise<string> {
  const token = toHex(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
  const tokenHash = await sha256Hex(token);
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO sessions (user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)",
  )
    .bind(userId, tokenHash, new Date(now).toISOString(), new Date(now + SESSION_TTL_MS).toISOString())
    .run();
  return sessionCookie(token, Math.floor(SESSION_TTL_MS / 1000));
}

// ---- requireSession / requireRole — the primitives every other handler calls ---

export interface AuthUser {
  id: number;
  tenant: string;
  role: "site_supervisor" | "field_technician";
  email: string;
}

/** This app's roles, stamped from the contract, most-privileged first. Every
 * guard in the app names one of these three sets rather than a literal, so a
 * role the contract declares lands in a tier instead of being ignored — and a
 * value outside the union (a hand-edited row, a stale session) is in no set and
 * is therefore refused everywhere. */
export const ROLES: readonly AuthUser["role"][] = ["site_supervisor", "field_technician"];
/** Everyone but the read-only role. Guards every mutation. */
export const WRITE_ROLES: readonly AuthUser["role"][] = ["site_supervisor"];
/** The privileged tier: the audit trail, and revoking someone's session. */
export const ADMIN_ROLES: readonly AuthUser["role"][] = ["site_supervisor"];

/** Resolve the caller's session from the request cookie. Fail closed: a missing,
 * unknown, or EXPIRED session (checked here against the DB row, not just the
 * cookie's own Max-Age) returns null — callers must 401, never pass through. */
export async function requireSession(req: Request, env: Env): Promise<AuthUser | null> {
  const token = getCookie(req, "session");
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const now = new Date().toISOString();
  const row = await env.DB.prepare(
    "SELECT users.id AS id, users.tenant AS tenant, users.role AS role, users.email AS email " +
      "FROM sessions JOIN users ON users.id = sessions.user_id " +
      "WHERE sessions.token_hash = ? AND sessions.expires_at > ?",
  )
    .bind(tokenHash, now)
    .first<AuthUser>();
  return row ?? null;
}

/** 403 if the session's role isn't in the allowed set, else null (proceed).
 * Callers distinguish: no session => 401 (unauthenticated); session but wrong
 * role => 403 (unauthorized) — the two are never conflated.
 *
 * Exact membership, so it fails closed in both directions that matter: a role
 * this app does not know (`users.role` is free TEXT — a hand-edited or migrated
 * row can hold anything) is in no set and is denied, and an EMPTY allowed set
 * denies everyone rather than degrading to allow-all. */
export function requireRole(user: AuthUser, allowed: readonly AuthUser["role"][]): Response | null {
  return allowed.includes(user.role) ? null : json({ error: "forbidden" }, 403);
}

// ---- handlers -----------------------------------------------------------------

interface SignupBody {
  email?: string;
  password?: string;
  /** An invitation token from POST /api/users/invite. Absent => a brand new workspace. */
  invite?: string;
}
interface LoginBody {
  email?: string;
  password?: string;
}
interface AuthResponse {
  id: number;
  email: string;
  tenant: string;
  role: string;
}

export const signup: Handler<AuthResponse | { error: string }> = async (req, env) => {
  const body = await readJson<SignupBody>(req);
  const email = body?.email?.trim().toLowerCase();
  const password = body?.password;
  if (!email || !email.includes("@")) return json({ error: "a valid email is required" }, 400);
  if (!password || password.length < 8) return json({ error: "password must be at least 8 characters" }, 400);

  // An address that is already registered gets NO distinct answer. The old 409
  // ("an account with that email already exists") was a free account-enumeration
  // oracle: anonymous, one request per address, no session needed.
  //
  // The textbook fix — answer identically either way and send the difference by
  // email — needs a mailer, and this app ships without one. So sign-up falls back
  // to SIGN-IN on a known address: right password and you are signed into the
  // account you already had (which is what you wanted), wrong password and you
  // get the byte-identical 401 sign-in gives, where a wrong email and a wrong
  // password are already indistinguishable.
  //
  // This is honest about what it does NOT do: a caller who submits a fresh
  // password and gets 200 has learned the address was unregistered — by
  // registering it. That probe is visible (a row in `users`), costs an account
  // per address, and is capped at the "auth" rate-limit budget. Eliminating it
  // needs out-of-band verification. See docs/08-security.md.
  //
  // Before the invite is claimed, deliberately: an existing account must not burn
  // someone's single-use invitation on its way to its own workspace.
  const existing = await env.DB.prepare(
    "SELECT id, tenant, role, password_hash, password_salt, password_iterations FROM users WHERE email = ?",
  )
    .bind(email)
    .first<{
      id: number;
      tenant: string;
      role: string;
      password_hash: string;
      password_salt: string;
      password_iterations: number;
    }>();
  if (existing) {
    // ACCOUNT RECOVERY. Someone who forgot their password has nothing to prove
    // with — so the proof is a token an ADMIN OF THEIR OWN WORKSPACE minted for
    // THEM (POST /api/users/invite with { user_id }) and handed over out of band.
    // That is the whole reason this app has a reset at all: it ships with no
    // mailer, so there is no channel to send a self-service link down, and an
    // admin-mediated reset needs none.
    //
    // Pinned four ways, all in one indexed lookup: the token's hash, the user it
    // was minted FOR (so one member's token cannot reset a colleague's), that
    // user's tenant (so it cannot cross a workspace boundary), and not-yet-used
    // and not-yet-expired. Anything short of all four falls through to the normal
    // password check below and gets the same 401 a wrong password gets.
    const recovery = body?.invite?.trim();
    if (recovery) {
      const row = await env.DB.prepare(
        "SELECT id FROM invites WHERE token_hash = ? AND reset_user_id = ? AND tenant = ? AND used_at IS NULL AND expires_at > ?",
      )
        .bind(await sha256Hex(recovery), existing.id, existing.tenant, new Date().toISOString())
        .first<{ id: number }>();
      // Single-use, enforced by a CONDITIONAL update rather than a read-then-write:
      // two racing redemptions cannot both win, and the loser falls through to 401.
      const claim = row
        ? await env.DB.prepare("UPDATE invites SET used_at = ? WHERE id = ? AND used_at IS NULL")
            .bind(new Date().toISOString(), row.id)
            .run()
        : null;
      if (claim?.meta.changes) {
        const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
        await env.DB.prepare(
          "UPDATE users SET password_hash = ?, password_salt = ?, password_iterations = ? WHERE id = ? AND tenant = ?",
        )
          .bind(
            await pbkdf2Hex(password, salt, PBKDF2_ITERATIONS),
            toHex(salt),
            PBKDF2_ITERATIONS,
            existing.id,
            existing.tenant,
          )
          .run();
        // A password change ends every session the OLD password opened. Whoever
        // needed a reset either forgot it or lost the device — in both readings a
        // live cookie somewhere else is exactly what must not survive.
        await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(existing.id).run();
        const actor: AuthUser = {
          id: existing.id,
          tenant: existing.tenant,
          role: existing.role as AuthUser["role"],
          email,
        };
        // The trail records THAT a recovery was spent, never the token.
        await audit(env, actor, "recover", "users", existing.id, null);
        const restored = json<AuthResponse>(
          { id: existing.id, email, tenant: existing.tenant, role: existing.role },
          200,
        );
        restored.headers.set("set-cookie", await startSession(env, existing.id));
        return restored;
      }
    }

    const candidate = await pbkdf2Hex(password, fromHex(existing.password_salt), existing.password_iterations);
    if (!timingSafeEqual(candidate, existing.password_hash)) return json({ error: BAD_CREDENTIALS }, 401);
    const resumed = json<AuthResponse>(
      { id: existing.id, email, tenant: existing.tenant, role: existing.role },
      200,
    );
    resumed.headers.set("set-cookie", await startSession(env, existing.id));
    return resumed;
  }

  // The tenant is either a BRAND NEW one or the one written on a VALID INVITE
  // ROW — never a value from the body, so no signup can name its way into
  // someone else's workspace. The invite is CLAIMED before the user is written
  // (a single conditional UPDATE, so two racing redemptions cannot both win).
  // Annotated string: crypto.randomUUID() infers a template-literal type that an
  // invite's plain-TEXT tenant is not assignable to.
  let tenant: string = crypto.randomUUID();
  const invite = body?.invite?.trim();
  if (invite) {
    const inviteHash = await sha256Hex(invite);
    // reset_user_id IS NULL is load-bearing: without it a RECOVERY token — which
    // an admin mints for one of their own members — would double as a free
    // invitation into that workspace for whoever holds it.
    const row = await env.DB.prepare(
      "SELECT id, tenant FROM invites WHERE token_hash = ? AND reset_user_id IS NULL AND used_at IS NULL AND expires_at > ?",
    )
      .bind(inviteHash, new Date().toISOString())
      .first<{ id: number; tenant: string }>();
    if (!row) return json({ error: "that invitation is not valid" }, 400);
    const claim = await env.DB.prepare("UPDATE invites SET used_at = ? WHERE id = ? AND used_at IS NULL")
      .bind(new Date().toISOString(), row.id)
      .run();
    if (!claim.meta.changes) return json({ error: "that invitation is not valid" }, 400);
    tenant = row.tenant;
  }

  // Role is DERIVED, never requested: whoever opens a workspace is its admin, and
  // everyone who joins one that already has people starts on the lowest rung. An
  // admin moves them up with POST /api/users/:id/role — that is the whole ladder.
  const seats = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE tenant = ?")
    .bind(tenant)
    .first<{ n: number }>();
  const role: AuthUser["role"] = (seats?.n ?? 0) === 0 ? ADMIN_ROLES[0]! : ROLES[ROLES.length - 1]!;

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const passwordHash = await pbkdf2Hex(password, salt, PBKDF2_ITERATIONS);
  const res = await env.DB.prepare(
    "INSERT INTO users (tenant, email, password_hash, password_salt, password_iterations, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(tenant, email, passwordHash, toHex(salt), PBKDF2_ITERATIONS, role, new Date().toISOString())
    .run();

  const cookie = await startSession(env, res.meta.last_row_id);
  const out = json<AuthResponse>({ id: res.meta.last_row_id, email, tenant, role }, 200);
  out.headers.set("set-cookie", cookie);
  return out;
};

// Same generic message and (roughly) the same latency whether the email exists
// or the password is wrong — a distinguishing response is a user-enumeration
// oracle, which the spec explicitly forbids.
const BAD_CREDENTIALS = "invalid email or password";
const DUMMY_SALT = new Uint8Array(SALT_BYTES);

export const login: Handler<AuthResponse | { error: string }> = async (req, env) => {
  const body = await readJson<LoginBody>(req);
  const email = body?.email?.trim().toLowerCase();
  const password = body?.password;
  if (!email || !password) return json({ error: BAD_CREDENTIALS }, 401);

  const user = await env.DB.prepare(
    "SELECT id, tenant, role, password_hash, password_salt, password_iterations FROM users WHERE email = ?",
  )
    .bind(email)
    .first<{
      id: number;
      tenant: string;
      role: string;
      password_hash: string;
      password_salt: string;
      password_iterations: number;
    }>();

  if (!user) {
    await pbkdf2Hex(password, DUMMY_SALT, PBKDF2_ITERATIONS); // burn equivalent time on an unknown email
    return json({ error: BAD_CREDENTIALS }, 401);
  }
  const candidate = await pbkdf2Hex(password, fromHex(user.password_salt), user.password_iterations);
  if (!timingSafeEqual(candidate, user.password_hash)) return json({ error: BAD_CREDENTIALS }, 401);

  const cookie = await startSession(env, user.id);
  const out = json<AuthResponse>({ id: user.id, email, tenant: user.tenant, role: user.role }, 200);
  out.headers.set("set-cookie", cookie);
  return out;
};

// Who am I? The app shell calls this on boot: 401 sends it to /login.html, and
// the role in the response is what gates the UI it draws.
export const me: Handler<AuthResponse | { error: string }> = async (req, env) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  return json({ id: user.id, email: user.email, tenant: user.tenant, role: user.role });
};

export const logout: Handler<{ ok: boolean }> = async (req, env) => {
  const token = getCookie(req, "session");
  if (token) {
    const tokenHash = await sha256Hex(token);
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
  }
  const out = json({ ok: true });
  out.headers.set("set-cookie", CLEAR_COOKIE);
  return out;
};

// Example destructive endpoint wired against requireSession/requireRole — the
// pattern every generated CRUD handler should follow once auth is wired into
// the manifest routes: 401 with no session, 403 for a viewer, and the tenant
// that scopes the write comes from user.tenant (the SESSION), never from
// params/body/query — and the same session tenant is forwarded to the access log
// line via noteTenant, so the tail says WHOSE workspace hit this endpoint instead
// of a bare "-".
export const revokeSession: Handler<{ ok: boolean } | { error: string }> = async (req, env, params) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  const forbidden = requireRole(user, WRITE_ROLES); // the read-only role can look, never revoke
  if (forbidden) return forbidden;
  const res = await env.DB.prepare(
    "DELETE FROM sessions WHERE id = ? AND user_id IN (SELECT id FROM users WHERE tenant = ?)",
  )
    .bind(params.id, user.tenant)
    .run();
  // Signing someone else out is a destructive act on another person's access, and
  // it stays inside WRITE_ROLES (a colleague, not only an admin, can end a session
  // — that is deliberate: the person who notices a laptop is missing is rarely the
  // owner). So it is answerable: the trail records who ended which session.
  if (res.meta.changes) await audit(env, user, "revoke", "sessions", Number(params.id), null);
  return res.meta.changes ? json({ ok: true }) : json({ error: "not found" }, 404);
};

// ---- audit trail ----------------------------------------------------------------

// A body can be arbitrarily large; the trail is a log, not a backup. Truncate the
// serialised diff so one 5MB paste cannot bloat the table every write forever.
const AUDIT_CHANGES_MAX = 4000;

/** Append one line to the audit trail. Call after a successful mutation:
 * `await audit(env, user, "create", "consignments", res.meta.last_row_id, body)`.
 *
 * tenant/actor come from the VERIFIED session, never from the request, so a line
 * cannot be forged into another workspace's history. */
export async function audit(
  env: Env,
  user: AuthUser,
  action: string,
  entity: string,
  rowId: number | null,
  changes?: unknown,
): Promise<void> {
  // Deliberately swallowed: the caller's write already succeeded and was already
  // committed. Rethrowing here would turn a completed 201 into a 500 and make the
  // client retry a mutation that landed — a lost audit line is strictly less
  // damaging than a duplicated business record.
  // ponytail: dropped, not queued. Add a durable queue only if the trail becomes a
  // compliance artefact that must be provably complete.
  try {
    // JSON.stringify is typed as string but returns undefined for a function or a
    // bare undefined — check before slicing rather than trusting the signature.
    const text = changes === undefined ? null : JSON.stringify(changes);
    const body = typeof text === "string" ? text.slice(0, AUDIT_CHANGES_MAX) : null;
    await env.DB.prepare(
      "INSERT INTO audit_log (tenant, actor_id, actor_email, action, entity, row_id, changes, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(user.tenant, user.id, user.email, action, entity, rowId, body, new Date().toISOString())
      .run();
  } catch {
    /* see above — an audit write never fails the request that caused it */
  }
}

interface AuditRow {
  id: number;
  actor_id: number;
  actor_email: string;
  action: string;
  entity: string;
  row_id: number | null;
  changes: string | null;
  at: string;
}

// A trail nobody can read is just disk usage. Privileged tier only (ADMIN_ROLES):
// this names who did what and when, which is exactly the data the other roles
// have no business enumerating — 403 for them, 401 with no session at all. The
// tenant filter comes from the session, so one workspace can never page through
// another's history.
//
// QUERYABLE, not just readable. "Newest 200" answers the only question nobody
// asks: every real use of a trail is a specific question — what happened to
// consignment 41, what did this person do last Tuesday, who deletes things — and
// answering those by scrolling a fixed page is the difference between a trail and
// a compliance artefact. Every filter here is an indexed column: entity+row hits
// audit_log_tenant_entity_row_idx, the date range and the cursor ride the
// tenant_at index. The cursor is keyset (id < before), never OFFSET, so page 500
// of a busy workspace costs the same as page 1.
export const auditLog: Handler<AuditRow[] | { error: string }> = async (req, env) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  const forbidden = requireRole(user, ADMIN_ROLES);
  if (forbidden) return forbidden;
  const url = new URL(req.url);
  let where = "tenant = ?";
  const args: unknown[] = [user.tenant];
  // Column names are literal here, never taken from the request — the params only
  // ever supply BOUND values, so no query string can reach the SQL text.
  for (const [param, column] of [
    ["entity", "entity"],
    ["action", "action"],
    ["actor", "actor_id"],
    ["row", "row_id"],
  ] as const) {
    const raw = url.searchParams.get(param);
    if (raw === null || raw === "") continue;
    where += " AND " + column + " = ?";
    args.push(column === "entity" || column === "action" ? raw : Number(raw));
  }
  const since = url.searchParams.get("since");
  if (since) {
    where += " AND at >= ?";
    args.push(since);
  }
  const until = url.searchParams.get("until");
  if (until) {
    where += " AND at <= ?";
    args.push(until);
  }
  const before = Math.trunc(Number(url.searchParams.get("before")));
  if (Number.isInteger(before) && before > 0) {
    where += " AND id < ?";
    args.push(before);
  }
  const per = Math.min(500, Math.max(1, Math.trunc(Number(url.searchParams.get("per"))) || 200));
  const { results } = await env.DB.prepare(
    "SELECT id, actor_id, actor_email, action, entity, row_id, changes, at FROM audit_log " +
      "WHERE " + where + " ORDER BY at DESC, id DESC LIMIT ?",
  )
    .bind(...args, per)
    .all<AuditRow>();
  const out = json(results);
  // The next page's starting point, only while the page is full — a short page is
  // the end of the trail, and handing back a cursor there makes a client fetch an
  // empty page to find that out.
  const last = results[results.length - 1];
  if (last && results.length === per) out.headers.set("x-next-cursor", String(last.id));
  return out;
};

// ---- sessions: see them, end them ------------------------------------------------

interface SessionRow {
  id: number;
  user_id: number;
  user_email: string;
  created_at: string;
  expires_at: string;
  current: number;
}

/**
 * Every live session in MY workspace.
 *
 * This is the half that was missing: revokeSession existed and was reachable by
 * nobody, because "sign out my other device" — the first thing a person does
 * after losing a laptop — starts with SEEING the other device. Admin tier, like
 * the member list it mirrors: knowing who is currently signed in is the same
 * class of fact as knowing who is a member.
 *
 * token_hash is never selected. There is nothing here an attacker could replay:
 * the hash cannot mint a session even if it leaked, and it still does not leave
 * the database. `current` marks the caller's own row so a UI can label it and
 * warn before someone signs themselves out.
 */
export const sessionsList: Handler<SessionRow[] | { error: string }> = async (req, env) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  const forbidden = requireRole(user, ADMIN_ROLES);
  if (forbidden) return forbidden;
  const token = getCookie(req, "session");
  const tokenHash = token ? await sha256Hex(token) : "";
  // Expired rows are not live sessions — they are debris the login path replaces.
  // Listing them would make a workspace look compromised by its own history.
  const { results } = await env.DB.prepare(
    "SELECT s.id AS id, s.user_id AS user_id, u.email AS user_email, s.created_at AS created_at, " +
      "s.expires_at AS expires_at, (s.token_hash = ?) AS current " +
      "FROM sessions s JOIN users u ON u.id = s.user_id " +
      "WHERE u.tenant = ? AND s.expires_at > ? ORDER BY s.id DESC LIMIT 200",
  )
    .bind(tokenHash, user.tenant, new Date().toISOString())
    .all<SessionRow>();
  return json(results);
};

// ---- user administration: the role ladder, made reachable ------------------------
// A role ladder with no way to move someone up it is decoration. These three
// endpoints are the assignment path: invite a person into THIS tenant, see who is
// in it, move one of them to another rung. All three are ADMIN_ROLES-only, all
// three read and write through user.tenant (the VERIFIED session), so one
// workspace can neither enumerate nor re-grade another's people.

interface UserRow {
  id: number;
  email: string;
  role: string;
  created_at: string;
}

/** Who is in my workspace. Password material is not selected — not hashed-and-sent,
 * simply never read. ponytail: newest 200, no cursor; add paging at the wall. */
export const usersList: Handler<UserRow[] | { error: string }> = async (req, env) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  const forbidden = requireRole(user, ADMIN_ROLES);
  if (forbidden) return forbidden;
  const { results } = await env.DB.prepare(
    "SELECT id, email, role, created_at FROM users WHERE tenant = ? ORDER BY id LIMIT 200",
  )
    .bind(user.tenant)
    .all<UserRow>();
  return json(results);
};

interface RoleBody {
  role?: string;
}

/**
 * Move one member of MY tenant to another rung of the ladder.
 *
 * Fails closed, five ways: 401 with no session, 403 for every non-admin, 400 for a
 * role outside ROLES (the app's own vocabulary — a free-text column would take
 * "superuser" happily), 404 for a user id belonging to another tenant (the WHERE
 * clause makes another workspace's rows indistinguishable from rows that do not
 * exist), and 400 rather than a self-inflicted lockout for the two ways an admin
 * can lock a workspace: demoting themselves, or demoting the last admin left.
 */
export const userSetRole: Handler<{ id: number; role: string } | { error: string }> = async (req, env, params) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  const forbidden = requireRole(user, ADMIN_ROLES);
  if (forbidden) return forbidden;

  const body = await readJson<RoleBody>(req);
  const role = ROLES.find((r) => r === body?.role);
  if (!role) return json({ error: "unknown role" }, 400);

  const target = await env.DB.prepare("SELECT id, role FROM users WHERE id = ? AND tenant = ?")
    .bind(params.id, user.tenant)
    .first<{ id: number; role: AuthUser["role"] }>();
  if (!target) return json({ error: "not found" }, 404);
  // An admin who demotes themselves has locked the workspace with one request.
  if (target.id === user.id) return json({ error: "you cannot change your own role" }, 400);

  // Losing the last admin means nobody can ever invite, promote, or read the trail
  // again — the count is over ADMIN_ROLES, so it stays true if the tier widens.
  const losingAdmin = ADMIN_ROLES.includes(target.role) && !ADMIN_ROLES.includes(role);
  if (losingAdmin) {
    const placeholders = ADMIN_ROLES.map(() => "?").join(", ");
    const admins = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM users WHERE tenant = ? AND role IN (" + placeholders + ")",
    )
      .bind(user.tenant, ...ADMIN_ROLES)
      .first<{ n: number }>();
    if ((admins?.n ?? 0) <= 1) return json({ error: "a workspace must keep at least one admin" }, 400);
  }

  await env.DB.prepare("UPDATE users SET role = ? WHERE id = ? AND tenant = ?")
    .bind(role, target.id, user.tenant)
    .run();
  await audit(env, user, "update", "users", target.id, { role });
  return json({ id: target.id, role });
};

/**
 * Mint a single-use token into MY tenant. Two kinds, one path:
 *
 * - `{}` — an INVITATION. The joiner redeems it at POST /api/auth/signup and lands
 *   on the lowest rung; promotion is a separate, audited decision (userSetRole).
 * - `{ user_id }` — a RECOVERY token for that member, the app's password reset.
 *   They redeem it at the same place with a new password (see signup above), which
 *   sets it and kills every session the old password opened.
 *
 * The token is returned ONCE, in this response — only its hash is stored, so it
 * cannot be re-read later, from the DB or from here. The admin hands it over
 * however they already talk to their colleague; that out-of-band step is the
 * delivery channel, and it is why an app with no mailer can still have a reset.
 *
 * The target is looked up `WHERE id = ? AND tenant = ?` exactly like userSetRole,
 * so another workspace's member is 404 — byte-identical to an id that does not
 * exist, and never a mintable token.
 *
 * ponytail: no self-service "forgot password", because that needs a channel to a
 * logged-out human and there is none. Add it — plus email verification, plus the
 * last of the sign-up enumeration oracle — the day this app has a mailer.
 * ponytail: no revoke endpoint; an unused token expires on its own. */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Much shorter than an invitation: a reset is handed over in a conversation
 * already in progress, and it is a live key to an existing account. */
const RESET_TTL_MS = 60 * 60 * 1000;

interface InviteBody {
  /** Mint a RECOVERY token for this member of my tenant instead of an invitation. */
  user_id?: number;
}

export const userInvite: Handler<{ invite: string; expires_at: string } | { error: string }> = async (req, env) => {
  const user = await requireSession(req, env);
  if (!user) return json({ error: "unauthenticated" }, 401);
  noteTenant(req, user.tenant);
  const forbidden = requireRole(user, ADMIN_ROLES);
  if (forbidden) return forbidden;

  const body = await readJson<InviteBody>(req);
  const wanted = Math.trunc(Number(body?.user_id));
  let resetUserId: number | null = null;
  if (Number.isInteger(wanted) && wanted > 0) {
    const target = await env.DB.prepare("SELECT id FROM users WHERE id = ? AND tenant = ?")
      .bind(wanted, user.tenant)
      .first<{ id: number }>();
    if (!target) return json({ error: "not found" }, 404);
    resetUserId = target.id;
  }

  const token = toHex(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
  const expiresAt = new Date(Date.now() + (resetUserId ? RESET_TTL_MS : INVITE_TTL_MS)).toISOString();
  const res = await env.DB.prepare(
    "INSERT INTO invites (tenant, token_hash, invited_by, created_at, expires_at, reset_user_id) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(user.tenant, await sha256Hex(token), user.id, new Date().toISOString(), expiresAt, resetUserId)
    .run();
  // The trail records that a token was issued and to what end, never the token
  // itself. A reset is filed against the USER whose password it can change —
  // "who could get into this account" is the question a reviewer actually asks.
  if (resetUserId) await audit(env, user, "reset", "users", resetUserId, { expires_at: expiresAt });
  else await audit(env, user, "create", "invites", res.meta.last_row_id, { expires_at: expiresAt });
  return json({ invite: token, expires_at: expiresAt });
};
