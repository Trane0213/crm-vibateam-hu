/**
 * Google OAuth 2.0 — saját Web Application Client használatával.
 * SEMMILYEN Lovable Connector függőség. Server-only.
 */
import { getAdminClient } from "@/lib/gmail/admin.server";

export const GOOGLE_OAUTH_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/userinfo.email",
];

function creds() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error(
      "GOOGLE_CLIENT_ID es GOOGLE_CLIENT_SECRET nincs beallitva. Add hozza a Google Cloud Console Web Application OAuth Client ertekeit.",
    );
  }
  return { id, secret };
}

export function buildRedirectUri(request: Request): string {
  const explicit = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (explicit) return explicit;
  const url = new URL(request.url);
  return `${url.origin}/api/gmail/oauth/callback`;
}

export function buildAuthorizationUrl(opts: { state: string; redirectUri: string; loginHint?: string }): string {
  const { id } = creds();
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: GOOGLE_OAUTH_SCOPES.join(" "),
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
  if (!r.ok) throw new Error(`userinfo lekeres sikertelen (HTTP ${r.status})`);
  const j = (await r.json()) as { email?: string };
  if (!j.email) throw new Error("userinfo valaszban nincs email");
  return j.email;
}

export async function getValidAccessToken(userId: string): Promise<{ accessToken: string; email: string }> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("gmail_accounts")
    .select("email,refresh_token,access_token,expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`gmail_accounts lekeres: ${error.message}`);
  if (!data) throw new Error("Nincs csatlakoztatott Gmail-fiok.");

  const exp = data.expires_at ? new Date(data.expires_at).getTime() : 0;
  if (data.access_token && exp - Date.now() > 60_000) {
    return { accessToken: data.access_token, email: data.email };
  }
  const t = await refreshAccessToken(data.refresh_token);
  const newExp = new Date(Date.now() + (t.expires_in - 30) * 1000).toISOString();
  await admin
    .from("gmail_accounts")
    .update({ access_token: t.access_token, expires_at: newExp })
    .eq("user_id", userId);
  return { accessToken: t.access_token, email: data.email };
}
