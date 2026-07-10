/**
 * Google Ads OAuth 2.0 — saját Web Application Client. Server-only.
 *
 * Külön kliens a Gmail integrációtól: eltérő scope (`adwords`), külön
 * consent flow. A refresh tokent AES-GCM-mel titkosítva tároljuk
 * (`google_ads_connections.refresh_token_cipher`).
 */

export const GOOGLE_ADS_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/adwords",
];

const GOOGLE_ADS_CALLBACK_PATH = "/api/google-ads/oauth/callback";

function creds() {
  const id = process.env.GOOGLE_ADS_CLIENT_ID;
  const secret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error(
      "GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET nincs beállítva. Vidd fel a Google Cloud Console Web Application OAuth Client értékeit.",
    );
  }
  return { id, secret };
}

export function buildRedirectUri(request: Request): string {
  return resolveRedirectUri(request).redirectUri;
}

export type RedirectUriResolution = {
  redirectUri: string;
  source: string;
  candidates: Array<{ source: string; value: string; accepted: boolean; reason?: string }>;
};

function firstHeaderValue(value: string | null): string | null {
  const first = value?.split(",")[0]?.trim();
  return first || null;
}

function isLocalValue(value: string): boolean {
  return /(^|\/\/|\.|:)localhost(?::|\/|$)|(^|\/\/|\.)127\.0\.0\.1(?::|\/|$)/i.test(value);
}

function normalizeOrigin(raw: string): string | null {
  const value = raw.trim().replace(/\/$/, "");
  if (!value) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const url = new URL(withProtocol);
    if (!/^https?:$/i.test(url.protocol)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function canonicalizeLovableOrigin(origin: string): string {
  const url = new URL(origin);
  const previewProjectId = url.hostname.match(/^([0-9a-f-]{36})\.lovableproject\.com$/i)?.[1];
  if (previewProjectId) {
    return `https://id-preview--${previewProjectId}.lovable.app`;
  }
  return origin;
}

function callbackForOrigin(origin: string): string {
  return `${canonicalizeLovableOrigin(origin)}${GOOGLE_ADS_CALLBACK_PATH}`;
}

export function resolveRedirectUri(request: Request): RedirectUriResolution {
  const candidates: RedirectUriResolution["candidates"] = [];

  const accept = (source: string, raw: string | null | undefined, rejectLocal = true): string | null => {
    if (!raw) {
      candidates.push({ source, value: "", accepted: false, reason: "missing" });
      return null;
    }
    const value = raw.trim();
    if (!value) {
      candidates.push({ source, value: "", accepted: false, reason: "empty" });
      return null;
    }
    if (rejectLocal && isLocalValue(value)) {
      candidates.push({ source, value, accepted: false, reason: "local/internal" });
      return null;
    }
    candidates.push({ source, value, accepted: true });
    return value;
  };

  const explicit = process.env.GOOGLE_ADS_OAUTH_REDIRECT_URI;
  const explicitRedirect = accept("GOOGLE_ADS_OAUTH_REDIRECT_URI", explicit, false);
  if (explicitRedirect) return { redirectUri: explicitRedirect, source: "GOOGLE_ADS_OAUTH_REDIRECT_URI", candidates };

  const explicitOrigin = normalizeOrigin(process.env.GOOGLE_ADS_OAUTH_PUBLIC_ORIGIN ?? "");
  const configuredOrigin = accept(
    "GOOGLE_ADS_OAUTH_PUBLIC_ORIGIN",
    explicitOrigin ? callbackForOrigin(explicitOrigin) : null,
    false,
  );
  if (configuredOrigin) return { redirectUri: configuredOrigin, source: "GOOGLE_ADS_OAUTH_PUBLIC_ORIGIN", candidates };

  // A request.url a proxy mögött `https://localhost:8080/...` lehet. Ezért először
  // a proxy által küldött publikus hostot használjuk; az Origin/Referer csak
  // másodlagos fallback, mert iframe/editor környezetben nem mindig az app hostja.
  const h = request.headers;
  const fwdProto = firstHeaderValue(h.get("x-forwarded-proto")) ?? "https";
  const fwdHost = firstHeaderValue(h.get("x-forwarded-host"));
  const fwdOrigin = fwdHost ? normalizeOrigin(`${fwdProto}://${fwdHost}`) : null;
  const forwardedRedirect = accept("x-forwarded-host", fwdOrigin ? callbackForOrigin(fwdOrigin) : null);
  if (forwardedRedirect) return { redirectUri: forwardedRedirect, source: "x-forwarded-host", candidates };

  const host = firstHeaderValue(h.get("host"));
  const hostOrigin = host ? normalizeOrigin(`${fwdProto}://${host}`) : null;
  const hostRedirect = accept("host", hostOrigin ? callbackForOrigin(hostOrigin) : null);
  if (hostRedirect) return { redirectUri: hostRedirect, source: "host", candidates };

  const requestOrigin = normalizeOrigin(new URL(request.url).origin);
  const requestRedirect = accept("request.url", requestOrigin ? callbackForOrigin(requestOrigin) : null);
  if (requestRedirect) return { redirectUri: requestRedirect, source: "request.url", candidates };

  const origin = normalizeOrigin(firstHeaderValue(h.get("origin")) ?? "");
  const originRedirect = accept("origin", origin ? callbackForOrigin(origin) : null);
  if (originRedirect) return { redirectUri: originRedirect, source: "origin", candidates };

  const referer = firstHeaderValue(h.get("referer"));
  let refererOrigin: string | null = null;
  if (referer) {
    try { refererOrigin = new URL(referer).origin; } catch { /* ignore */ }
  }
  const refererRedirect = accept("referer", refererOrigin ? callbackForOrigin(refererOrigin) : null);
  if (refererRedirect) return { redirectUri: refererRedirect, source: "referer", candidates };

  const localFallback = callbackForOrigin(new URL(request.url).origin);
  candidates.push({ source: "local fallback", value: localFallback, accepted: true, reason: "no public origin found" });
  return { redirectUri: localFallback, source: "local fallback", candidates };
}

export function buildAuthorizationUrl(opts: { state: string; redirectUri: string; loginHint?: string }): string {
  const { id } = creds();
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: GOOGLE_ADS_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: opts.state,
  });
  if (opts.loginHint) params.set("login_hint", opts.loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function describeAuthorizationUrl(authorizationUrl: string) {
  const url = new URL(authorizationUrl);
  return {
    authorize_url: authorizationUrl,
    client_id: url.searchParams.get("client_id") ?? "",
    redirect_uri: url.searchParams.get("redirect_uri") ?? "",
    scope: url.searchParams.get("scope") ?? "",
    state: url.searchParams.get("state") ?? "",
    state_length: url.searchParams.get("state")?.length ?? 0,
  };
}

export type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
  id_token?: string;
};

export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<GoogleTokenResponse> {
  const { id, secret } = creds();
  const body = new URLSearchParams({
    code,
    client_id: id,
    client_secret: secret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Google token exchange (HTTP ${r.status}): ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const { id, secret } = creds();
  const body = new URLSearchParams({
    client_id: id,
    client_secret: secret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Google token refresh (HTTP ${r.status}): ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

export async function fetchUserEmail(accessToken: string): Promise<string> {
  const r = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) throw new Error(`userinfo lekérés sikertelen (HTTP ${r.status})`);
  const j = (await r.json()) as { email?: string };
  if (!j.email) throw new Error("userinfo válaszban nincs email");
  return j.email;
}