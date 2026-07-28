// FROZEN — Sentinel golden template. Shared HTTP plumbing for every handler.
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

export type Params = Record<string, string>;

/** A Response that also carries, at the type level only, the JSON body it was
 * built from. json<T>() stamps it; a handler typed Handler<T> must return it.
 * This is the ONE place TypeScript can see the API's JSON shape — a bare
 * Response erases it, and every cross-file drift the fix loop used to thrash on
 * lived in that blind spot. Phantom field: never present at runtime. */
export type Json<T> = Response & { readonly __body?: T };

export type Handler<R = unknown> = (
  request: Request,
  env: Env,
  params: Params,
) => Json<R> | Promise<Json<R>>;

export interface Route {
  /** Uppercase HTTP method: "GET", "POST", ... */
  method: string;
  /** Path pattern; ":name" segments capture into params. e.g. "/api/meters/:id" */
  path: string;
  handler: Handler;
}

/** JSON response with correct content-type. The return type remembers T, so a
 * handler declared Handler<Foo> that json()s the wrong shape fails typecheck. */
export function json<T>(data: T, status = 200): Json<T> {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  }) as Json<T>;
}

/** Parse a JSON request body; returns null on missing/invalid JSON. */
export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

/** Resolve the tenant for a request — every generated app is multi-tenant:
 * reads filter by this, writes stamp it. Order: ?tenant= query, X-Tenant
 * header, else "default". */
export function tenantOf(request: Request): string {
  const q = new URL(request.url).searchParams.get("tenant");
  return q || request.headers.get("x-tenant") || "default";
}

/** Match method + pathname against the route table. First match wins. */
export function matchRoute(
  routes: readonly Route[],
  method: string,
  pathname: string,
): { route: Route; params: Params } | null {
  const parts = pathname.split("/").filter(Boolean);
  for (const route of routes) {
    if (route.method !== method) continue;
    const pattern = route.path.split("/").filter(Boolean);
    if (pattern.length !== parts.length) continue;
    const params: Params = {};
    let ok = true;
    for (let i = 0; i < pattern.length; i++) {
      const p = pattern[i]!;
      if (p.startsWith(":")) params[p.slice(1)] = decodeURIComponent(parts[i]!);
      else if (p !== parts[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { route, params };
  }
  return null;
}

// ---- observability -------------------------------------------------------------
// One JSON line per API request on stdout, so `wrangler tail | grep` IS the
// operator story. Costs the app nothing: console and crypto are both in the
// Workers runtime, no dependency, no vendor.

/** Per-request scratch, keyed by the Request object itself — so the request id and
 * tenant never have to be threaded through the Handler signature every handler in
 * the tree is typed against. Garbage-collects with the request. */
const CTX = new WeakMap<Request, { id: string; tenant: string }>();

function ctxOf(request: Request): { id: string; tenant: string } {
  let ctx = CTX.get(request);
  if (!ctx) {
    ctx = { id: crypto.randomUUID(), tenant: "-" };
    CTX.set(request, ctx);
  }
  return ctx;
}

/** This request's id — minted once, echoed as the `x-request-id` response header
 * and included in the 500 body, so a user can paste the id from a failure and the
 * operator can grep one log line out of the tail. */
export function requestId(request: Request): string {
  return ctxOf(request).id;
}

/** Attach the caller's workspace to this request's log line. The tenant comes from
 * the verified SESSION and nowhere else — never a header, query param or body
 * field, all of which a caller can forge. Call it right after the session check. */
export function noteTenant(request: Request, tenant: string): void {
  ctxOf(request).tenant = tenant;
}

/** The access log line. The key set is fixed and built ONLY from the method, the
 * pathname (never url.search — tokens hide in query strings), the status, the
 * elapsed ms, the session tenant and the request id. Headers, cookies and bodies
 * are never read here, so no secret can reach the log by construction. */
function logRequest(request: Request, path: string, status: number, ms: number, err?: unknown): void {
  const ctx = ctxOf(request);
  const line: Record<string, unknown> = {
    t: new Date().toISOString(),
    level: err === undefined ? "info" : "error",
    msg: "request",
    id: ctx.id,
    method: request.method,
    path,
    status,
    ms,
    tenant: ctx.tenant,
  };
  if (err !== undefined) {
    line.error = err instanceof Error ? err.message : String(err);
    line.stack = err instanceof Error ? err.stack ?? "" : "";
  }
  console.log(JSON.stringify(line));
}

/** Route one request: match, run, log, stamp the request id on the way out.
 * An unhandled throw becomes a 500 carrying the same { error } envelope as every
 * other failure in the app — the stack goes to the log, NEVER to the client.
 * src/index.ts calls exactly this, so a handler gets observability without opting
 * in and cannot forget to. */
export async function handle(
  routes: readonly Route[],
  request: Request,
  env: Env,
): Promise<Response> {
  const started = Date.now();
  const url = new URL(request.url);
  const hit = matchRoute(routes, request.method, url.pathname);
  // Static assets stream straight through the assets binding — they aren't the
  // app, and logging them buries the API lines in the tail.
  // ponytail: no asset logging; add it if asset-level latency ever matters.
  if (!hit && !url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
  let res: Response;
  let thrown: unknown;
  try {
    res = hit ? await hit.route.handler(request, env, hit.params) : json({ error: "not found" }, 404);
  } catch (err) {
    thrown = err;
    res = json({ error: "internal error", requestId: ctxOf(request).id }, 500);
  }
  logRequest(request, url.pathname, res.status, Date.now() - started, thrown);
  try {
    res.headers.set("x-request-id", ctxOf(request).id);
  } catch {
    // A Response that came back from another fetch() has immutable headers; copy
    // it rather than 500 on the correlation header.
    res = new Response(res.body, res);
    res.headers.set("x-request-id", ctxOf(request).id);
  }
  return res;
}
