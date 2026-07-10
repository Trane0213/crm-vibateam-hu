import { createFileRoute } from "@tanstack/react-router";
import { verifyState } from "@/lib/google-ads/auth.server";
import {
  exchangeCodeForTokens,
  fetchUserEmail,
  buildRedirectUri,
} from "@/lib/google-ads/oauth.server";
import { encryptRefreshToken } from "@/lib/google-ads/token-crypto.server";
import { getAdminClient } from "@/integrations/supabase/server";

function htmlResult(ok: boolean, message: string): Response {
  const safe = message.replace(/</g, "&lt;");
  const body = `<!doctype html><html><head><meta charset="utf-8"><title>Google Ads kapcsolat</title>
    <meta http-equiv="refresh" content="2;url=/settings/google-ads"></head>
    <body style="font:14px system-ui;padding:24px;max-width:520px;margin:auto">
    <h2 style="margin-top:0">${ok ? "Google Ads csatlakoztatva" : "Google Ads csatlakozás sikertelen"}</h2>
    <p>${safe}</p><p><a href="/settings/google-ads">Vissza a beállításokhoz</a></p>
    </body></html>`;
  return new Response(body, { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8" } });
}

export const Route = createFileRoute("/api/google-ads/oauth/callback")({
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
            return htmlResult(
              false,
              "A Google nem adott vissza refresh_token-t. Vond vissza a Google-fiókban az alkalmazás hozzáférését, majd próbáld újra.",
            );
          }
          const email = await fetchUserEmail(tokens.access_token);
          const enc = encryptRefreshToken(tokens.refresh_token);
          const admin = getAdminClient();
          const { error: upErr } = await admin
            .from("google_ads_connections")
            .upsert(
              {
                user_id: userId,
                google_email: email,
                refresh_token_cipher: enc.cipher,
                refresh_token_iv: enc.iv,
                scope: tokens.scope,
                status: "connected",
                last_error: null,
                connected_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              { onConflict: "user_id" },
            );
          if (upErr) return htmlResult(false, `DB hiba: ${upErr.message}`);
          return htmlResult(true, `Sikeres csatlakozás: ${email}`);
        } catch (e: any) {
          return htmlResult(false, e?.message ?? String(e));
        }
      },
    },
  },
});