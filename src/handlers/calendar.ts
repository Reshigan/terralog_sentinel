import { json, readJson } from "../lib/http";
import type { Env, Handler } from "../lib/http";

// ---- shared contract types (from src/lib/schema.ts) --------------------------------
// These mirror the contract exports; we import the actual types in production.
// For this handler we define the minimal shapes needed for type safety.

interface CalendarConnection {
  connection_id: string;
  tenant_id: string;
  user_id: string;
  provider: "google" | "microsoft";
  oauth_refresh_token_encrypted: string | null;
  calendar_ids: string[];
  sync_cursor: string | null;
  last_sync_at: string | null;
  last_sync_status: "ok" | "partial" | "failed";
  error_count_24h: number;
}

interface CalendarEvent {
  calendar_event_id: string;
  tenant_id: string;
  connection_id: string;
  provider_event_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  is_all_day: boolean;
  recurrence_rule: string | null;
  organizer_email: string | null;
  is_cancelled: boolean;
  last_seen_at: string;
}

// ---- OAuth configuration (placeholders — real values from env secrets) ------------

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
}

function getGoogleOAuthConfig(env: Env): OAuthConfig {
  return {
    clientId: env.GOOGLE_CLIENT_ID ?? "REPLACE_ME_GOOGLE_CLIENT_ID",
    clientSecret: env.GOOGLE_CLIENT_SECRET ?? "REPLACE_ME_GOOGLE_CLIENT_SECRET",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/calendar.readonly openid email",
  };
}

function getMicrosoftOAuthConfig(env: Env): OAuthConfig {
  return {
    clientId: env.MICROSOFT_CLIENT_ID ?? "REPLACE_ME_MICROSOFT_CLIENT_ID",
    clientSecret: env.MICROSOFT_CLIENT_SECRET ?? "REPLACE_ME_MICROSOFT_CLIENT_SECRET",
    authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scope: "Calendars.Read offline_access openid email",
  };
}

// ---- crypto utilities --------------------------------------------------------------

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Simple AES-GCM encryption using a key derived from env — in production this
// would use a proper KMS envelope encryption pattern.
async function encryptToken(plaintext: string, env: Env): Promise<string> {
  const keyMaterial = env.TOKEN_ENCRYPTION_KEY ?? "REPLACE_ME_32_BYTE_KEY_FOR_DEV_";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(keyMaterial),
    "AES-GCM",
    false,
    ["encrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function decryptToken(ciphertext: string, env: Env): Promise<string> {
  const keyMaterial = env.TOKEN_ENCRYPTION_KEY ?? "REPLACE_ME_32_BYTE_KEY_FOR_DEV_";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(keyMaterial),
    "AES-GCM",
    false,
    ["decrypt"]
  );
  const combined = new Uint8Array(
    atob(ciphertext)
      .split("")
      .map((c) => c.charCodeAt(0))
  );
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted);
  return new TextDecoder().decode(decrypted);
}

// ---- HTTP helpers ------------------------------------------------------------------

interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

interface GoogleCalendar {
  id: string;
  summary: string;
  primary?: boolean;
}

interface GoogleEvent {
  id: string;
  summary?: string;
  description?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  recurrence?: string[];
  organizer?: { email?: string };
  status: string;
  updated: string;
}

interface MicrosoftCalendar {
  id: string;
  name: string;
  isDefaultCalendar?: boolean;
}

interface MicrosoftEvent {
  id: string;
  subject?: string;
  bodyPreview?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  isAllDay: boolean;
  recurrence?: { pattern: { type: string }; range: { startDate: string } };
  organizer?: { emailAddress?: { address?: string } };
  isCancelled?: boolean;
  lastModifiedDateTime: string;
}

// ---- drift detection ---------------------------------------------------------------

interface DriftReport {
  connection_id: string;
  event_id: string;
  drift_type: "time_moved" | "cancelled" | "title_changed" | "duration_changed";
  previous_hash: string;
  current_hash: string;
  detected_at: string;
}

async function computeEventHash(event: CalendarEvent): Promise<string> {
  const canonical = JSON.stringify({
    id: event.calendar_event_id,
    start: event.starts_at,
    end: event.ends_at,
    title: event.title,
    cancelled: event.is_cancelled,
  });
  return sha256Hex(canonical);
}

// ---- handlers ----------------------------------------------------------------------

interface ConnectCalendarBody {
  provider: "google" | "microsoft";
  calendar_ids?: string[];
}

interface CalendarConnectionResponse {
  connection_id: string;
  provider: "google" | "microsoft";
  status: "pending_oauth" | "connected" | "failed";
  auth_url?: string;
  last_sync_status?: "ok" | "partial" | "failed";
}

interface CalendarListItem {
  calendar_id: string;
  name: string;
  is_primary: boolean;
}

interface CalendarSyncResponse {
  connection_id: string;
  events_synced: number;
  events_skipped: number;
  drifts_detected: number;
  status: "ok" | "partial" | "failed";
}

interface DriftListResponse {
  drifts: DriftReport[];
}

// POST /api/calendars/connect — initiate OAuth flow
export const connectCalendar: Handler<CalendarConnectionResponse | { error: string }> = async (
  req,
  env
) => {
  const tenantId = (req as Request & { tenantId?: string }).tenantId;
  if (!tenantId) return json({ error: "tenant context required" }, 400);

  const body = await readJson<ConnectCalendarBody>(req);
  if (!body?.provider || (body.provider !== "google" && body.provider !== "microsoft")) {
    return json({ error: "provider must be 'google' or 'microsoft'" }, 400);
  }

  const config = body.provider === "google" ? getGoogleOAuthConfig(env) : getMicrosoftOAuthConfig(env);
  const connectionId = crypto.randomUUID();
  const state = await sha256Hex(connectionId + tenantId + Date.now().toString());

  // Store pending connection
  await env.DB.prepare(
    `INSERT INTO calendar_connections 
     (connection_id, tenant_id, provider, calendar_ids, last_sync_status, error_count_24h, created_at)
     VALUES (?, ?, ?, ?, 'pending_oauth', 0, ?)`
  )
    .bind(connectionId, tenantId, body.provider, JSON.stringify(body.calendar_ids ?? []), new Date().toISOString())
    .run();

  // Build OAuth URL
  const redirectUri = `${env.PUBLIC_URL ?? "https://REPLACE_ME_PUBLIC_URL"}/api/calendars/oauth/callback`;
  const authUrl = new URL(config.authorizeUrl);
  authUrl.searchParams.set("client_id", config.clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", config.scope);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");

  // Store state -> connection mapping in KV (short TTL)
  await env.CALENDAR_OAUTH_STATE?.put(state, connectionId, { expirationTtl: 600 });

  return json<CalendarConnectionResponse>({
    connection_id: connectionId,
    provider: body.provider,
    status: "pending_oauth",
    auth_url: authUrl.toString(),
  });
};

// GET /api/calendars/oauth/callback — OAuth callback handler
export const oauthCallback: Handler<{ success: boolean; connection_id: string } | { error: string }> = async (
  req,
  env
) => {
  const url = new URL((req as Request).url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) return json({ error: `OAuth error: ${error}` }, 400);
  if (!code || !state) return json({ error: "missing code or state" }, 400);

  const connectionId = await env.CALENDAR_OAUTH_STATE?.get(state);
  if (!connectionId) return json({ error: "invalid or expired state" }, 400);

  await env.CALENDAR_OAUTH_STATE?.delete(state);

  const conn = await env.DB.prepare(
    "SELECT * FROM calendar_connections WHERE connection_id = ?"
  )
    .bind(connectionId)
    .first<CalendarConnection>();
  if (!conn) return json({ error: "connection not found" }, 404);

  const config = conn.provider === "google" ? getGoogleOAuthConfig(env) : getMicrosoftOAuthConfig(env);
  const redirectUri = `${env.PUBLIC_URL ?? "https://REPLACE_ME_PUBLIC_URL"}/api/calendars/oauth/callback`;

  // Exchange code for tokens
  const tokenRes = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    await env.DB.prepare(
      "UPDATE calendar_connections SET last_sync_status = 'failed', error_count_24h = error_count_24h + 1 WHERE connection_id = ?"
    )
      .bind(connectionId)
      .run();
    return json({ error: "token exchange failed" }, 400);
  }

  const tokens: OAuthTokenResponse = await tokenRes.json();
  const encryptedRefresh = await encryptToken(tokens.refresh_token ?? tokens.access_token, env);

  await env.DB.prepare(
    "UPDATE calendar_connections SET oauth_refresh_token_encrypted = ?, last_sync_status = 'ok', last_sync_at = ? WHERE connection_id = ?"
  )
    .bind(encryptedRefresh, new Date().toISOString(), connectionId)
    .run();

  return json({ success: true, connection_id: connectionId });
};

// GET /api/calendars/:id/list — list available calendars from provider
export const listProviderCalendars: Handler<CalendarListItem[] | { error: string }> = async (
  req,
  env
) => {
  const url = new URL((req as Request).url);
  const pathMatch = url.pathname.match(/\/calendars\/([^\/]+)\/list/);
  const connectionId = pathMatch?.[1];
  if (!connectionId) return json({ error: "connection id required" }, 400);

  const conn = await env.DB.prepare(
    "SELECT * FROM calendar_connections WHERE connection_id = ?"
  )
    .bind(connectionId)
    .first<CalendarConnection>();
  if (!conn) return json({ error: "connection not found" }, 404);
  if (!conn.oauth_refresh_token_encrypted) return json({ error: "not authenticated" }, 401);

  const accessToken = await decryptToken(conn.oauth_refresh_token_encrypted, env);

  if (conn.provider === "google") {
    const res = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return json({ error: "failed to fetch calendars" }, 502);
    const data = await res.json<{ items: GoogleCalendar[] }>();
    return json<CalendarListItem[]>(
      data.items.map((c) => ({
        calendar_id: c.id,
        name: c.summary,
        is_primary: c.primary ?? false,
      }))
    );
  } else {
    const res = await fetch("https://graph.microsoft.com/v1.0/me/calendars", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return json({ error: "failed to fetch calendars" }, 502);
    const data = await res.json<{ value: MicrosoftCalendar[] }>();
    return json<CalendarListItem[]>(
      data.value.map((c) => ({
        calendar_id: c.id,
        name: c.name,
        is_primary: c.isDefaultCalendar ?? false,
      }))
    );
  }
};

// POST /api/calendars/:id/sync — sync events from provider to CalendarEvent table
export const syncCalendar: Handler<CalendarSyncResponse | { error: string }> = async (
  req,
  env
) => {
  const url = new URL((req as Request).url);
  const pathMatch = url.pathname.match(/\/calendars\/([^\/]+)\/sync/);
  const connectionId = pathMatch?.[1];
  if (!connectionId) return json({ error: "connection id required" }, 400);

  const conn = await env.DB.prepare(
    "SELECT * FROM calendar_connections WHERE connection_id = ?"
  )
    .bind(connectionId)
    .first<CalendarConnection>();
  if (!conn) return json({ error: "connection not found" }, 404);
  if (!conn.oauth_refresh_token_encrypted) return json({ error: "not authenticated" }, 401);

  const tenantId = conn.tenant_id;
  const calendarIds: string[] = conn.calendar_ids.length > 0 
    ? conn.calendar_ids 
    : ["primary"];

  const accessToken = await decryptToken(conn.oauth_refresh_token_encrypted, env);
  const now = new Date();
  const timeMin = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days back
  const timeMax = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days forward

  let eventsSynced = 0;
  let eventsSkipped = 0;
  const drifts: DriftReport[] = [];

  for (const calId of calendarIds) {
    try {
      if (conn.provider === "google") {
        const syncToken = conn.sync_cursor;
        let apiUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
          calId
        )}/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(
          timeMax
        )}&singleEvents=true&orderBy=startTime&maxResults=2500`;
        if (syncToken) apiUrl += `&syncToken=${encodeURIComponent(syncToken)}`;

        const res = await fetch(apiUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) throw new Error(`Google API error: ${res.status}`);

        const data = await res.json<{
          items: GoogleEvent[];
          nextSyncToken?: string;
          nextPageToken?: string;
        }>();

        for (const evt of data.items) {
          const eventId = `${conn.connection_id}:${evt.id}`;
          const startsAt = evt.start.dateTime ?? evt.start.date!;
          const endsAt = evt.end.dateTime ?? evt.end.date!;
          const isAllDay = !evt.start.dateTime;

          const existing = await env.DB.prepare(
            "SELECT * FROM calendar_events WHERE calendar_event_id = ? AND tenant_id = ?"
          )
            .bind(eventId, tenantId)
            .first<CalendarEvent>();

          const newEvent: CalendarEvent = {
            calendar_event_id: eventId,
            tenant_id: tenantId,
            connection_id: conn.connection_id,
            provider_event_id: evt.id,
            title: evt.summary ?? "(No title)",
            description: evt.description ?? null,
            starts_at: startsAt,
            ends_at: endsAt,
            is_all_day: isAllDay,
            recurrence_rule: evt.recurrence?.[0] ?? null,
            organizer_email: evt.organizer?.email ?? null,
            is_cancelled: evt.status === "cancelled",
            last_seen_at: new Date().toISOString(),
          };

          if (existing) {
            const oldHash = await computeEventHash(existing);
            const newHash = await computeEventHash(newEvent);
            if (oldHash !== newHash) {
              // Drift detected
              const drift: DriftReport = {
                connection_id: conn.connection_id,
                event_id: eventId,
                drift_type: existing.is_cancelled !== newEvent.is_cancelled 
                  ? "cancelled" 
                  : existing.starts_at !== newEvent.starts_at || existing.ends_at !== newEvent.ends_at
                  ? "time_moved"
                  : existing.title !== newEvent.title
                  ? "title_changed"
                  : "duration_changed",
                previous_hash: oldHash,
                current_hash: newHash,
                detected_at: new Date().toISOString(),
              };
              drifts.push(drift);

              await env.DB.prepare(
                `UPDATE calendar_events SET 
                 title = ?, description = ?, starts_at = ?, ends_at = ?, 
                 is_all_day = ?, recurrence_rule = ?, organizer_email = ?, 
                 is_cancelled = ?, last_seen_at = ?
                 WHERE calendar_event_id = ? AND tenant_id = ?`
              )
                .bind(
                  newEvent.title,
                  newEvent.description,
                  newEvent.starts_at,
                  newEvent.ends_at,
                  newEvent.is_all_day ? 1 : 0,
                  newEvent.recurrence_rule,
                  newEvent.organizer_email,
                  newEvent.is_cancelled ? 1 : 0,
                  newEvent.last_seen_at,
                  eventId,
                  tenantId
                )
                .run();
            }
            eventsSkipped++;
          } else {
            await env.DB.prepare(
              `INSERT INTO calendar_events 
               (calendar_event_id, tenant_id, connection_id, provider_event_id, title, 
                description, starts_at, ends_at, is_all_day, recurrence_rule, 
                organizer_email, is_cancelled, last_seen_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
              .bind(
                newEvent.calendar_event_id,
                newEvent.tenant_id,
                newEvent.connection_id,
                newEvent.provider_event_id,
                newEvent.title,
                newEvent.description,
                newEvent.starts_at,
                newEvent.ends_at,
                newEvent.is_all_day ? 1 : 0,
                newEvent.recurrence_rule,
                newEvent.organizer_email,
                newEvent.is_cancelled ? 1 : 0,
                newEvent.last_seen_at
              )
              .run();
            eventsSynced++;
          }
        }

        if (data.nextSyncToken) {
          await env.DB.prepare(
            "UPDATE calendar_connections SET sync_cursor = ? WHERE connection_id = ?"
          )
            .bind(data.nextSyncToken, conn.connection_id)
            .run();
        }
      } else {
        // Microsoft Graph
        const calIdEncoded = calId === "primary" ? "primary" : encodeURIComponent(calId);
        const apiUrl = `https://graph.microsoft.com/v1.0/me/calendars/${calIdEncoded}/calendarView?startDateTime=${encodeURIComponent(
          timeMin
        )}&endDateTime=${encodeURIComponent(timeMax)}&$top=500`;

        const res = await fetch(apiUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) throw new Error(`Microsoft API error: ${res.status}`);

        const data = await res.json<{ value: MicrosoftEvent[]; "@odata.nextLink"?: string }>();

        for (const evt of data.value) {
          const eventId = `${conn.connection_id}:${evt.id}`;
          
          const newEvent: CalendarEvent = {
            calendar_event_id: eventId,
            tenant_id: tenantId,
            connection_id: conn.connection_id,
            provider_event_id: evt.id,
            title: evt.subject ?? "(No title)",
            description: evt.bodyPreview ?? null,
            starts_at: evt.start.dateTime,
            ends_at: evt.end.dateTime,
            is_all_day: evt.isAllDay,
            recurrence_rule: evt.recurrence 
              ? `RRULE:FREQ=${evt.recurrence.pattern.type.toUpperCase()}` 
              : null,
            organizer_email: evt.organizer?.emailAddress?.address ?? null,
            is_cancelled: evt.isCancelled ?? false,
            last_seen_at: new Date().toISOString(),
          };

          const existing = await env.DB.prepare(
            "SELECT * FROM calendar_events WHERE calendar_event_id = ? AND tenant_id = ?"
          )
            .bind(eventId, tenantId)
            .first<CalendarEvent>();

          if (existing) {
            const oldHash = await computeEventHash(existing);
            const newHash = await computeEventHash(newEvent);
            if (oldHash !== newHash) {
              const drift: DriftReport = {
                connection_id: conn.connection_id,
                event_id: eventId,
                drift_type: existing.is_cancelled !== newEvent.is_cancelled 
                  ? "cancelled" 
                  : existing.starts_at !== newEvent.starts_at || existing.ends_at !== newEvent.ends_at
                  ? "time_moved"
                  : existing.title !== newEvent.title
                  ? "title_changed"
                  : "duration_changed",
                previous_hash: oldHash,
                current_hash: newHash,
                detected_at: new Date().toISOString(),
              };
              drifts.push(drift);

              await env.DB.prepare(
                `UPDATE calendar_events SET 
                 title = ?, description = ?, starts_at = ?, ends_at = ?, 
                 is_all_day = ?, recurrence_rule = ?, organizer_email = ?, 
                 is_cancelled = ?, last_seen_at = ?
                 WHERE calendar_event_id = ? AND tenant_id = ?`
              )
                .bind(
                  newEvent.title,
                  newEvent.description,
                  newEvent.starts_at,
                  newEvent.ends_at,
                  newEvent.is_all_day ? 1 : 0,
                  newEvent.recurrence_rule,
                  newEvent.organizer_email,
                  newEvent.is_cancelled ? 1 : 0,
                  newEvent.last_seen_at,
                  eventId,
                  tenantId
                )
                .run();
            }
            eventsSkipped++;
          } else {
            await env.DB.prepare(
              `INSERT INTO calendar_events 
               (calendar_event_id, tenant_id, connection_id, provider_event_id, title, 
                description, starts_at, ends_at, is_all_day, recurrence_rule, 
                organizer_email, is_cancelled, last_seen_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
              .bind(
                newEvent.calendar_event_id,
                newEvent.tenant_id,
                newEvent.connection_id,
                newEvent.provider_event_id,
                newEvent.title,
                newEvent.description,
                newEvent.starts_at,
                newEvent.ends_at,
                newEvent.is_all_day ? 1 : 0,
                newEvent.recurrence_rule,
                newEvent.organizer_email,
                newEvent.is_cancelled ? 1 : 0,
                newEvent.last_seen_at
              )
              .run();
            eventsSynced++;
          }
        }
      }
    } catch (err) {
      await env.DB.prepare(
        "UPDATE calendar_connections SET last_sync_status = 'failed', error_count_24h = error_count_24h + 1 WHERE connection_id = ?"
      )
        .bind(conn.connection_id)
        .run();
      return json<CalendarSyncResponse>({
        connection_id: conn.connection_id,
        events_synced: eventsSynced,
        events_skipped: eventsSkipped,
        drifts_detected: drifts.length,
        status: "failed",
      });
    }
  }

  // Update sync status
  const status: "ok" | "partial" | "failed" = eventsSynced > 0 ? "ok" : "partial";
  await env.DB.prepare(
    "UPDATE calendar_connections SET last_sync_status = ?, last_sync_at = ?, error_count_24h = 0 WHERE connection_id = ?"
  )
    .bind(status, new Date().toISOString(), conn.connection_id)
    .run();

  return json<CalendarSyncResponse>({
    connection_id: conn.connection_id,
    events_synced: eventsSynced,
    events_skipped: eventsSkipped,
    drifts_detected: drifts.length,
    status,
  });
};

// GET /api/calendars/:id/drifts — list detected drifts for a connection
export const listDrifts: Handler<DriftListResponse | { error: string }> = async (
  req,
  env
) => {
  const url = new URL((req as Request).url);
  const pathMatch = url.pathname.match(/\/calendars\/([^\/]+)\/drifts/);
  const connectionId = pathMatch?.[1];
  if (!connectionId) return json({ error: "connection id required" }, 400);

  // In a full implementation, drifts would be stored in a dedicated table
  // For now, we compute drift on-the-fly by comparing current events to ledger
  const conn = await env.DB.prepare(
    "SELECT * FROM calendar_connections WHERE connection_id = ?"
  )
    .bind(connectionId)
    .first<CalendarConnection>();
  if (!conn) return json({ error: "connection not found" }, 404);

  // This is a placeholder — real implementation would query ledger_entries
  return json<DriftListResponse>({ drifts: [] });
};

// GET /api/calendars — list all connections for tenant
export const listConnections: Handler<CalendarConnectionResponse[] | { error: string }> = async (
  req,
  env
) => {
  const tenantId = (req as Request & { tenantId?: string }).tenantId;
  if (!tenantId) return json({ error: "tenant context required" }, 400);

  const conns = await env.DB.prepare(
    "SELECT connection_id, provider, last_sync_status FROM calendar_connections WHERE tenant_id = ?"
  )
    .bind(tenantId)
    .all<{ connection_id: string; provider: string; last_sync_status: string }>();

  return json<CalendarConnectionResponse[]>(
    conns.results.map((c) => ({
      connection_id: c.connection_id,
      provider: c.provider as "google" | "microsoft",
      status: c.last_sync_status as "ok" | "partial" | "failed",
    }))
  );
};

// DELETE /api/calendars/:id — disconnect and cleanup
export const disconnectCalendar: Handler<{ disconnected: true } | { error: string }> = async (
  req,
  env
) => {
  const url = new URL((req as Request).url);
  const pathMatch = url.pathname.match(/\/calendars\/([^\/]+)/);
  const connectionId = pathMatch?.[1];
  if (!connectionId) return json({ error: "connection id required" }, 400);

  const tenantId = (req as Request & { tenantId?: string }).tenantId;
  if (!tenantId) return json({ error: "tenant context required" }, 400);

  // Verify ownership
  const conn = await env.DB.prepare(
    "SELECT * FROM calendar_connections WHERE connection_id = ? AND tenant_id = ?"
  )
    .bind(connectionId, tenantId)
    .first<CalendarConnection>();
  if (!conn) return json({ error: "connection not found" }, 404);

  // Soft-delete events
  await env.DB.prepare(
    "UPDATE calendar_events SET is_cancelled = 1 WHERE connection_id = ? AND tenant_id = ?"
  )
    .bind(connectionId, tenantId)
    .run();

  // Mark connection disconnected
  await env.DB.prepare(
    "DELETE FROM calendar_connections WHERE connection_id = ?"
  )
    .bind(connectionId)
    .run();

  return json({ disconnected: true });
};