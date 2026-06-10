import { createFileRoute } from "@tanstack/react-router";

/**
 * Gmail per-user OAuth indítása.
 * Body: { appUserId: string, targetOrigin: string, returnUrl: string, scopes?: string[] }
 * Válasz: { authorizationUrl: string } vagy { error }.
 *
 * Server-side, a LOVABLE_API_KEY és GOOGLE_APP_USER_CONNECTOR_CLIENT_ID
 * env-változókat olvassa. Web-message módban válaszol, hogy a Lovable
 * preview iframe-ben is működjön (popup + postMessage).
 */
export const Route = createFileRoute("/api/gmail/start")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.LOVABLE_API_KEY;
        const clientId = process.env.GOOGLE_APP_USER_CONNECTOR_CLIENT_ID;
        if (!apiKey) {
          return Response.json(
            { error: "LOVABLE_API_KEY nincs beállítva a szerveren." },
            { status: 500 },
          );
        }
        if (!clientId) {
          return Response.json(
            {
              error:
                "GOOGLE_APP_USER_CONNECTOR_CLIENT_ID nincs beállítva. Add hozzá a Lovable secrets-hez (Google Cloud OAuth Client ID).",
            },
            { status: 500 },
          );
        }

        let body: any;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Hibás JSON body." }, { status: 400 });
        }
        const appUserId = String(body?.appUserId ?? "");
        const targetOrigin = String(body?.targetOrigin ?? "");
        const returnUrl = String(body?.returnUrl ?? "");
        const scopes: string[] = Array.isArray(body?.scopes)
          ? body.scopes
          : [
              "https://www.googleapis.com/auth/gmail.readonly",
              "https://www.googleapis.com/auth/gmail.send",
              "https://www.googleapis.com/auth/gmail.modify",
              "https://www.googleapis.com/auth/userinfo.email",
            ];
        if (!appUserId || !targetOrigin || !returnUrl) {
          return Response.json(
            { error: "appUserId, targetOrigin és returnUrl kötelező." },
            { status: 400 },
          );
        }

        const res = await fetch(
          "https://connector-gateway.lovable.dev/api/v1/app-users/oauth2/authorize",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              connector_id: "google",
              app_user_id: appUserId,
              connector_client_id: clientId,
              return_url: returnUrl,
              response_mode: "web_message",
              web_message_target_origin: targetOrigin,
              credentials_configuration: { scopes },
            }),
          },
        );
        const text = await res.text();
        if (!res.ok) {
          // Részletes szerver-oldali log a debughoz
          console.error("[gmail/start] gateway error", {
            status: res.status,
            clientIdPreview: clientId.slice(0, 8) + "…(" + clientId.length + ")",
            clientIdLooksLikeGoogle: clientId.endsWith(".apps.googleusercontent.com"),
            returnUrl,
            targetOrigin,
            response: text.slice(0, 800),
          });
          // Tipikus hiba felismerése és user-friendly üzenet
          let hint = "";
          if (text.includes("app-user-connector-client_not_found")) {
            hint =
              " — A GOOGLE_APP_USER_CONNECTOR_CLIENT_ID értéke NEM a Google Cloud OAuth Client ID-t várja (…apps.googleusercontent.com), hanem egy Lovable App User Connector Client azonosítót (auccli_…). " +
              "A Google OAuth Client-et először regisztrálni kell a Lovable connector gateway-en, és az ott kapott ID kerül a secret-be. " +
              "Részletek a chatben.";
            if (clientId.endsWith(".apps.googleusercontent.com")) {
              hint +=
                " (A jelenlegi érték Google Cloud Client ID-nek tűnik — ezt kell becserélni a Lovable-tól kapott auccli_… ID-re.)";
            }
          }
          return Response.json(
            {
              error: `Gmail OAuth indítás sikertelen (HTTP ${res.status}): ${text.slice(0, 400)}${hint}`,
              gatewayStatus: res.status,
              gatewayBody: text.slice(0, 800),
            },
            { status: 502 },
          );
        }
        try {
          const parsed = JSON.parse(text);
          if (!parsed?.authorization_url) {
            return Response.json(
              { error: "A connector gateway nem adott vissza authorization_url-t." },
              { status: 502 },
            );
          }
          return Response.json({ authorizationUrl: parsed.authorization_url });
        } catch {
          return Response.json(
            { error: "Érvénytelen JSON válasz a connector gateway-től." },
            { status: 502 },
          );
        }
      },
    },
  },
});