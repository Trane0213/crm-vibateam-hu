import { createFileRoute } from "@tanstack/react-router";
import { verifyState } from "@/lib/gmail/auth.server";
import { exchangeCodeForTokens, fetchUserEmail, buildRedirectUri } from "@/lib/gmail/oauth.server";
import { getAdminClient } from "@/lib/gmail/admin.server";

function htmlResult(ok: boolean, message: string): Response {
  const safe = message.replace(/</g, "&lt;");
  const body = `<!doctype html><html><head><meta charset="utf-8"><title>Gmail kapcsolat</title>
    <meta http-equiv="refresh" content="2;url=/settings/gmail"></head>
    <body style="font:14px system-ui;padding:24px;max-width:520px;margin:auto">
    <h2 style="margin-top:0">${ok ? "Gmail csatlakoztatva" : "Gmail csatlakozás sikertelen"}</h2>
    <p>${safe}</p><p><a href="/settings/gmail">Vissza a beállításokhoz</a></p>
    </body></html>`;
  return new Response(body, { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8" } });
}

export const Route = createFileRoute("/api/gmail/oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const error = url.searchParams.get("error");
        if (error) return htmlResult(false, `Google hibakód: ${error}`);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (!code || !state) return htmlResult(false, "Hiányzó code vagy state paraméter.");
        try {
          const userId = verifyState(state);
          const redirectUri = buildRedirectUri(request);
          const tokens = await exchangeCodeForTokens(code, redirectUri);
          if (!tokens.refresh_token) {
            return htmlResult(false, "A Google nem adott vissza refresh_token-t. Vond vissza az alkalmazás hozzáférését a Google-fiókban, majd próbáld újra.");
          }
          const email = await fetchUserEmail(tokens.access_token);
          const expiresAt = new Date(Date.now() + (tokens.expires_in - 30) * 1000).toISOString();
          const admin = getAdminClient();
          const { error: upErr } = await admin.from("gmail_accounts").upsert({
            user_id: userId,
            email,
            refresh_token: tokens.refresh_token,
            access_token: tokens.access_token,
            expires_at: expiresAt,
            scope: tokens.scope,
          });
          if (upErr) return htmlResult(false, `DB hiba: ${upErr.message}`);
          return htmlResult(true, `Sikeres csatlakozás: ${email}`);
        } catch (e: any) {
          return htmlResult(false, e?.message ?? String(e));
        }
      },
    },
  },
});
