// GENERATED rate limiter. Do not edit. Counters live in D1
// (migrations/0008_ratelimit.sql); src/routes.ts stamps EVERY route through
// limited(), so the check runs before the handler and before it can touch a row.
import { json } from "../lib/http";
import type { Env, Handler } from "../lib/http";
import { requireSession } from "./auth";

// src/lib/http.ts is FROZEN template code and cannot know about a var that only
// exists once the limiter is generated — so it is declared here by augmentation,
// exactly as the uploads bucket is. Optional: an unset var (the default
// deployment, and every test) falls back to DEFAULTS below.
declare module "../lib/http" {
  interface Env {
    /** Per-deployment override, e.g. "read=600,write=120,auth=10" — requests per
     * key per 60s window. Any subset; a missing or unparseable entry keeps its
     * default. Set it in wrangler.jsonc `vars`, or `wrangler secret put`. */
    RATE_LIMITS?: string;
  }
}

export type Budget = "read" | "write" | "auth";

/** Requests per key per window. One dashboard view costs ~10 reads, so 600/min
 * is a tab refreshing every second and no human reaches it; writes get a fifth
 * of that because a person cannot type faster than that and a runaway client
 * loop is exactly what this is for; auth is tiny and keyed by IP, so credential
 * stuffing gets 10 guesses a minute instead of thousands. */
const DEFAULTS: Record<Budget, number> = { read: 600, write: 120, auth: 10 };

/** Fixed window, not sliding: one row and one statement per request. The worst
 * case is a caller landing 2x the budget across a window boundary, which is a
 * fair-share limiter doing its job — it is not a security control. */
const WINDOW_MS = 60000;

function budgetOf(env: Env, budget: Budget): number {
  for (const part of (env.RATE_LIMITS || "").split(",")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== budget) continue;
    const n = Number(part.slice(eq + 1).trim());
    if (Number.isFinite(n) && n > 0) return Math.trunc(n);
  }
  return DEFAULTS[budget];
}

/** Who is being metered. The TENANT whenever the caller has a session — fair
 * share is per workspace, so one tenant's burst cannot starve another's — else
 * the client IP, which is all an unauthenticated caller has. Auth endpoints skip
 * the session read on purpose: a login attempt has no session by definition, and
 * the unit that matters for credential stuffing is the source address.
 * ponytail: for the other budgets this costs one extra indexed session lookup per
 * API request (the handler resolves the same session again a moment later). The
 * upgrade is a request-scoped memo inside requireSession, not a second copy of
 * that query here. */
async function keyOf(req: Request, env: Env, budget: Budget): Promise<string> {
  if (budget !== "auth") {
    const user = await requireSession(req, env);
    if (user) return budget + ":t:" + user.tenant;
  }
  return budget + ":ip:" + (req.headers.get("cf-connecting-ip") || "unknown");
}

/** Count this request in the current window and return the running total. */
async function count(env: Env, key: string, now: number): Promise<number> {
  const windowStart = now - (now % WINDOW_MS);
  const row = await env.DB.prepare(
    "INSERT INTO rate_limits (key, window_start, hits) VALUES (?, ?, 1) " +
      "ON CONFLICT (key) DO UPDATE SET " +
      "hits = CASE WHEN rate_limits.window_start = excluded.window_start THEN rate_limits.hits + 1 ELSE 1 END, " +
      "window_start = excluded.window_start " +
      "RETURNING hits",
  )
    .bind(key, windowStart)
    .first<{ hits: number }>();
  const hits = row ? row.hits : 1;
  // Opportunistic prune, on a key's FIRST hit of a new window only — so it runs
  // at most once per key per window instead of on every request. It sweeps EVERY
  // rolled-over row, not just this key's, so a caller that goes quiet for ever is
  // still cleaned up by the next request anyone makes.
  // CEILING: one row per distinct key (tenant or IP, per budget) seen inside one
  // 60s window, plus at most one window's worth waiting to be swept. Thousands of
  // rows at worst, and it drains to empty on the first request after a quiet spell.
  if (hits === 1)
    await env.DB.prepare("DELETE FROM rate_limits WHERE window_start < ?").bind(windowStart).run();
  return hits;
}

/**
 * Meter one route. Applied in src/routes.ts to every entry in the table, so the
 * budget is checked BEFORE the handler runs.
 *
 * Exempt: static assets and everything outside /api/ never enter the route table
 * at all (handle() sends them straight to the ASSETS binding), and the liveness
 * probe is exempted explicitly under either spelling — an uptime checker polling
 * every few seconds must never be told 429.
 */
export function limited(handler: Handler, budget: Budget): Handler {
  return async (req, env, params) => {
    const path = new URL(req.url).pathname;
    if (!path.startsWith("/api/") || path === "/health" || path === "/api/health")
      return handler(req, env, params);
    const now = Date.now();
    let hits: number;
    try {
      hits = await count(env, await keyOf(req, env, budget), now);
    } catch {
      // FAIL OPEN, deliberately. A limiter that 500s when D1 hiccups takes the
      // entire API down for every tenant at once — strictly worse than the abuse
      // it exists to contain. A storage failure drops the meter, never the request.
      return handler(req, env, params);
    }
    if (hits > budgetOf(env, budget)) {
      // The app's standard { error } envelope — same shape as every other failure
      // — plus the seconds left in this window, so a well-behaved client backs off
      // exactly as long as it needs to instead of guessing.
      const res = json({ error: "rate limit exceeded — too many requests" }, 429);
      res.headers.set("retry-after", String(Math.ceil((WINDOW_MS - (now % WINDOW_MS)) / 1000)));
      return res;
    }
    return handler(req, env, params);
  };
}
