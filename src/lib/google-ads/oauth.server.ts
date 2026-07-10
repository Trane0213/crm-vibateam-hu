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
  const explicit = process.env.GOOGLE_ADS_OAUTH_REDIRECT_URI;
  if (explicit) return explicit;
  const url = new URL(request.url);
  return `${url.origin}/api/google-ads/oauth/callback`;
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