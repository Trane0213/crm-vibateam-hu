/**
 * Google Ads Michael — end-to-end diagnostika (Owner-only).
 *
 * Ellenőrzi:
 *  1) van-e tárolt kapcsolat sor,
 *  2) sikerül-e a refresh_token AES-GCM visszafejtése,
 *  3) sikerül-e új access_token-t kérni a Google-tól,
 *  4) van-e Developer Token secret,
 *  5) elérhető-e a Google Ads API (`customers:listAccessibleCustomers`),
 *  6) van-e legalább egy hozzáférhető Customer ID.
 *
 * Csak diagnosztika — semmit nem módosít Google Adsben.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/middleware";

export type HealthCheck = { key: string; label: string; ok: boolean; detail?: string };
export type HealthReport = {
  checked_at: string;
  overall_ok: boolean;
  checks: HealthCheck[];
};

export const runGoogleAdsHealthCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HealthReport> => {
    const checks: HealthCheck[] = [];
    const add = (c: HealthCheck) => checks.push(c);
    const now = () => new Date().toISOString();

    // 1) Kapcsolat sor
    const { data: conn, error: connErr } = await context.supabase
      .from("google_ads_connections")
      .select("refresh_token_cipher, refresh_token_iv, google_email, active_customer_id, login_customer_id, status")
      .maybeSingle();
    if (connErr || !conn) {
      add({ key: "connection", label: "OAuth kapcsolat tárolva", ok: false, detail: connErr?.message ?? "Nincs mentett kapcsolat." });
      return { checked_at: now(), overall_ok: false, checks };
    }
    add({ key: "connection", label: "OAuth kapcsolat tárolva", ok: true, detail: conn.google_email ?? undefined });

    // 2) Refresh token decrypt
    let refreshToken: string;
    try {
      const { decryptRefreshToken } = await import("@/lib/google-ads/token-crypto.server");
      if (!conn.refresh_token_cipher || !conn.refresh_token_iv) throw new Error("Hiányzó cipher/iv.");
      refreshToken = decryptRefreshToken(conn.refresh_token_cipher, conn.refresh_token_iv);
      add({ key: "decrypt", label: "Refresh token visszafejthető", ok: !!refreshToken });
    } catch (e: any) {
      add({ key: "decrypt", label: "Refresh token visszafejthető", ok: false, detail: e?.message ?? String(e) });
      return { checked_at: now(), overall_ok: false, checks };
    }

    // 3) Access token frissítés
    let accessToken: string;
    try {
      const { refreshAccessToken } = await import("@/lib/google-ads/oauth.server");
      const t = await refreshAccessToken(refreshToken);
      accessToken = t.access_token;
      add({ key: "refresh", label: "Access token frissíthető", ok: !!accessToken });
    } catch (e: any) {
      add({ key: "refresh", label: "Access token frissíthető", ok: false, detail: e?.message ?? String(e) });
      return { checked_at: now(), overall_ok: false, checks };
    }

    // 4) Developer token
    const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    add({
      key: "dev_token",
      label: "Developer Token beállítva",
      ok: !!devToken,
      detail: devToken ? undefined : "GOOGLE_ADS_DEVELOPER_TOKEN secret hiányzik.",
    });

    // 5) API elérhetőség — listAccessibleCustomers
    if (devToken) {
      try {
        const headers: Record<string, string> = {
          authorization: `Bearer ${accessToken}`,
          "developer-token": devToken,
          "content-type": "application/json",
        };
        if (conn.login_customer_id) headers["login-customer-id"] = conn.login_customer_id.replace(/-/g, "");
        const r = await fetch("https://googleads.googleapis.com/v17/customers:listAccessibleCustomers", { headers });
        const text = await r.text();
        if (!r.ok) {
          add({ key: "api", label: "Google Ads API kapcsolat", ok: false, detail: `HTTP ${r.status}: ${text.slice(0, 300)}` });
          return { checked_at: now(), overall_ok: false, checks };
        }
        const j = JSON.parse(text) as { resourceNames?: string[] };
        const ids = (j.resourceNames ?? []).map((n) => n.replace(/^customers\//, ""));
        add({ key: "api", label: "Google Ads API kapcsolat", ok: true, detail: `${ids.length} elérhető Customer` });
        add({
          key: "customer",
          label: "Elérhető Customer ID",
          ok: ids.length > 0,
          detail: ids.length > 0 ? ids.slice(0, 5).join(", ") : "Nincs hozzáférhető Ads fiók ehhez a Google userhez.",
        });
      } catch (e: any) {
        add({ key: "api", label: "Google Ads API kapcsolat", ok: false, detail: e?.message ?? String(e) });
      }
    }

    const overall_ok = checks.every((c) => c.ok);
    return { checked_at: now(), overall_ok, checks };
  });