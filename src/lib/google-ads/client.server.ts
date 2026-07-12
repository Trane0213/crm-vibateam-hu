/**
 * Google Ads REST kliens — server-only.
 *
 * Feladatok:
 *  - user access token beszerzése (in-memory cache 55 perc TTL, refresh token → új access token)
 *  - Google Ads REST hívás (search / searchStream) készen a login-customer-id headerrel
 *  - GAQL segéd + snapshot íróhelper
 *
 * A cache modulszintű Map. Cloudflare Worker instance élettartamára él, több
 * kérés között megosztott — a `refresh_token` DB oldalról jön, tehát rotáció
 * nem törik.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptRefreshToken } from "./token-crypto.server";
import { refreshAccessToken } from "./oauth.server";

export const GOOGLE_ADS_API_VERSION = "v21";
const API_BASE = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;

type CachedToken = { accessToken: string; expiresAt: number };
const TOKEN_CACHE = new Map<string, CachedToken>();
const SAFETY_WINDOW_MS = 5 * 60 * 1000; // 5 perc a Google 60 percéhez képest

export type GoogleAdsConnection = {
  user_id: string;
  refresh_token_cipher: string;
  refresh_token_iv: string;
  active_customer_id: string | null;
  login_customer_id: string | null;
  manager_customer_id: string | null;
  google_email: string | null;
};

export async function loadConnection(sb: SupabaseClient): Promise<GoogleAdsConnection> {
  const { data, error } = await sb
    .from("google_ads_connections")
    .select(
      "user_id, refresh_token_cipher, refresh_token_iv, active_customer_id, login_customer_id, manager_customer_id, google_email, status",
    )
    .maybeSingle();
  if (error) throw new Error(`google_ads_connections olvasás sikertelen: ${error.message}`);
  if (!data) throw new Error("Nincs mentett Google Ads kapcsolat. Csatlakozz a Beállítások → Google Ads oldalon.");
  if (!data.refresh_token_cipher || !data.refresh_token_iv) {
    throw new Error("Refresh token hiányzik a kapcsolatból — kösd újra a Google fiókot.");
  }
  return data as GoogleAdsConnection;
}

export async function getAccessToken(conn: GoogleAdsConnection): Promise<string> {
  const cached = TOKEN_CACHE.get(conn.user_id);
  if (cached && cached.expiresAt - SAFETY_WINDOW_MS > Date.now()) {
    return cached.accessToken;
  }
  const refreshToken = decryptRefreshToken(conn.refresh_token_cipher, conn.refresh_token_iv);
  const t = await refreshAccessToken(refreshToken);
  const expiresAt = Date.now() + Math.max(60, t.expires_in) * 1000;
  TOKEN_CACHE.set(conn.user_id, { accessToken: t.access_token, expiresAt });
  return t.access_token;
}

function devToken(): string {
  const d = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!d) throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN secret hiányzik.");
  return d;
}

function normalizeCustomerId(cid: string): string {
  return cid.replace(/-/g, "").trim();
}

export function resolveCustomerId(conn: GoogleAdsConnection, override?: string | null): string {
  const raw = (override && String(override).trim()) || conn.active_customer_id;
  if (!raw) throw new Error("Nincs megadott customer_id és a kapcsolathoz sincs aktív Ads fiók.");
  return normalizeCustomerId(raw);
}

function baseHeaders(accessToken: string, conn: GoogleAdsConnection): Record<string, string> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${accessToken}`,
    "developer-token": devToken(),
    "content-type": "application/json",
  };
  if (conn.login_customer_id) headers["login-customer-id"] = normalizeCustomerId(conn.login_customer_id);
  return headers;
}

export async function listAccessibleCustomers(conn: GoogleAdsConnection): Promise<string[]> {
  const at = await getAccessToken(conn);
  const r = await fetch(`${API_BASE}/customers:listAccessibleCustomers`, { headers: baseHeaders(at, conn) });
  const text = await r.text();
  if (!r.ok) throw new Error(`listAccessibleCustomers HTTP ${r.status}: ${text.slice(0, 300)}`);
  const j = JSON.parse(text) as { resourceNames?: string[] };
  return (j.resourceNames ?? []).map((n) => n.replace(/^customers\//, ""));
}

export type GaqlRow = Record<string, unknown>;

export async function gaqlSearch(
  conn: GoogleAdsConnection,
  customerId: string,
  query: string,
  opts?: { pageSize?: number },
): Promise<GaqlRow[]> {
  const at = await getAccessToken(conn);
  const cid = normalizeCustomerId(customerId);
  // Google Ads API v21+ nem engedi a pageSize paramétert (PAGE_SIZE_NOT_SUPPORTED);
  // a szerver fix 10 000 soros oldalakat ad vissza, a pageToken-t továbbra is használjuk.
  void opts;
  const body = JSON.stringify({ query });
  const rows: GaqlRow[] = [];
  let pageToken: string | undefined;
  // Egyszerű lapozás (search endpoint). Legfeljebb 5 oldalt kérünk, hogy egy tool-hívás
  // ne fusson végtelenül.
  for (let i = 0; i < 5; i++) {
    const paged = pageToken ? JSON.stringify({ query, pageToken }) : body;
    const r = await fetch(`${API_BASE}/customers/${cid}/googleAds:search`, {
      method: "POST",
      headers: baseHeaders(at, conn),
      body: paged,
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`googleAds:search HTTP ${r.status}: ${text.slice(0, 500)}`);
    const j = JSON.parse(text) as { results?: GaqlRow[]; nextPageToken?: string };
    if (j.results?.length) rows.push(...j.results);
    if (!j.nextPageToken) break;
    pageToken = j.nextPageToken;
  }
  return rows;
}

/** Egy metrika snapshot beírása. RLS: user írhatja a saját sorát. */
export async function writeSnapshot(
  sb: SupabaseClient,
  input: {
    user_id: string;
    customer_id: string;
    scope: "account" | "campaign" | "ad_group" | "keyword";
    entity_id?: string | null;
    metrics: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await sb.from("google_ads_snapshots").insert({
    user_id: input.user_id,
    customer_id: normalizeCustomerId(input.customer_id),
    scope: input.scope,
    entity_id: input.entity_id ?? null,
    metrics_json: input.metrics,
  });
  // A snapshot írás nem-kritikus — ha bukik, a tool eredménye érvényes marad.
  if (error) {
    // eslint-disable-next-line no-console
    console.warn(`[google-ads] snapshot write failed: ${error.message}`);
  }
}

/** Periódus segéd: from/to ISO dátum + grain. */
export function periodRange(daysBack: number): { from: string; to: string } {
  const today = new Date();
  const to = today.toISOString().slice(0, 10);
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - Math.max(1, daysBack) + 1);
  const from = start.toISOString().slice(0, 10);
  return { from, to };
}

/** Micros → HUF (Google Ads pénzösszegek 1_000_000 = 1 fiók-pénznem egység). */
export function fromMicros(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  if (!Number.isFinite(n)) return 0;
  return n / 1_000_000;
}

export function safeNum(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Generikus Google Ads REST mutate hívás. `resourcePath` pl. `campaigns:mutate`,
 * `campaignBudgets:mutate`, `campaignCriteria:mutate`. Az egész body-t a hívó adja.
 * Sikeres válasznál a parsed JSON-t adja vissza; hiba esetén dob (üzenettel).
 */
export async function adsMutate(
  conn: GoogleAdsConnection,
  customerId: string,
  resourcePath: string,
  body: Record<string, unknown>,
): Promise<any> {
  const at = await getAccessToken(conn);
  const cid = normalizeCustomerId(customerId);
  const r = await fetch(`${API_BASE}/customers/${cid}/${resourcePath}`, {
    method: "POST",
    headers: baseHeaders(at, conn),
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Google Ads ${resourcePath} HTTP ${r.status}: ${text.slice(0, 600)}`);
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

/** Change-log bejegyzés írása. Nem kritikus — hiba esetén csak warning. */
export async function writeChangeLog(
  sb: SupabaseClient,
  input: {
    user_id: string;
    customer_id: string;
    entity: string;
    entity_id?: string | null;
    field: string;
    old_value?: string | null;
    new_value?: string | null;
    reason?: string | null;
    changed_by?: string;
    dry_run_ref?: string | null;
  },
): Promise<void> {
  const { error } = await sb.from("google_ads_change_log").insert({
    user_id: input.user_id,
    customer_id: normalizeCustomerId(input.customer_id),
    entity: input.entity,
    entity_id: input.entity_id ?? null,
    field: input.field,
    old_value: input.old_value ?? null,
    new_value: input.new_value ?? null,
    reason: input.reason ?? null,
    changed_by: input.changed_by ?? "michael",
    dry_run_ref: input.dry_run_ref ?? null,
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn(`[google-ads] change_log write failed: ${error.message}`);
  }
}