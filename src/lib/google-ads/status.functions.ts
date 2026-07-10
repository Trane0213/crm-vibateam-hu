/**
 * Google Ads Michael — státusz és Constitution szerkesztő server function-ök.
 * Owner-only: az RLS-t az `is_owner_role` a DB-ben érvényesíti, itt is
 * kifejezetten ellenőrizzük a bejövő user szerepét.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/middleware";

export type GoogleAdsStatus = {
  connected: boolean;
  status: "pending" | "connected" | "revoked" | "expired" | "error" | "disconnected";
  google_email: string | null;
  active_customer_id: string | null;
  login_customer_id: string | null;
  connected_at: string | null;
  last_error: string | null;
  last_snapshot_at: string | null;
};

export type ConstitutionRule = {
  id: string;
  rule_key: string;
  rule_text: string;
  severity: "hard" | "soft";
  enabled: boolean;
  sort_order: number;
};

export const getGoogleAdsStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GoogleAdsStatus> => {
    const { supabase } = context;
    const [{ data: conn }, { data: snap }] = await Promise.all([
      supabase
        .from("google_ads_connections")
        .select("google_email, active_customer_id, login_customer_id, manager_customer_id, status, connected_at, last_error")
        .maybeSingle(),
      supabase
        .from("google_ads_snapshots")
        .select("snapshotted_at")
        .order("snapshotted_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (!conn) {
      return {
        connected: false,
        status: "disconnected",
        google_email: null,
        active_customer_id: null,
        login_customer_id: null,
        connected_at: null,
        last_error: null,
        last_snapshot_at: null,
      };
    }
    return {
      connected: conn.status === "connected",
      status: conn.status as GoogleAdsStatus["status"],
      google_email: conn.google_email,
      active_customer_id: conn.active_customer_id,
      login_customer_id: conn.login_customer_id,
      connected_at: conn.connected_at,
      last_error: conn.last_error,
      last_snapshot_at: snap?.snapshotted_at ?? null,
    };
  });

export const disconnectGoogleAds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("google_ads_connections").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listConstitutionRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ConstitutionRule[]> => {
    const { data, error } = await context.supabase
      .from("google_ads_constitution")
      .select("id, rule_key, rule_text, severity, enabled, sort_order")
      .order("sort_order")
      .order("rule_key");
    if (error) throw new Error(error.message);
    return (data ?? []) as ConstitutionRule[];
  });

export const upsertConstitutionRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const r = input as Partial<ConstitutionRule>;
    if (!r?.rule_key || !r?.rule_text) throw new Error("rule_key és rule_text kötelező.");
    return {
      id: r.id,
      rule_key: String(r.rule_key).slice(0, 120),
      rule_text: String(r.rule_text).slice(0, 2000),
      severity: r.severity === "soft" ? "soft" : "hard",
      enabled: r.enabled !== false,
      sort_order: Number.isFinite(r.sort_order) ? Number(r.sort_order) : 0,
    };
  })
  .handler(async ({ context, data }) => {
    const row = { ...data, user_id: context.userId };
    const { error } = await context.supabase
      .from("google_ads_constitution")
      .upsert(row, { onConflict: "user_id,rule_key" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteConstitutionRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const id = (input as { id?: string })?.id;
    if (!id) throw new Error("id kötelező.");
    return { id };
  })
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("google_ads_constitution")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });