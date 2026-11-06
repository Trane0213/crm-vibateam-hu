import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { EligibilityStatus } from "./campaign-eligibility";

/**
 * Kampánytervezetek (Owner/Marketing). Kampány-írás a felhasználó klienssel (RLS + guard trigger),
 * címzett és "prechecked" állapot csak szerveroldali ellenőrzés után, service role-lal.
 * Küldés, jóváhagyás nincs.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ELIG: EligibilityStatus[] = ["ready", "contacted", "replied", "uncertain", "invalid"];
const PAGE = 50;

async function requireCampaignRole(supabase: any, userId: string) {
  const { data: role, error } = await supabase.rpc("crm_role_of", { _auth_user: userId });
  if (error || (role !== "owner" && role !== "marketing")) throw new Error("Csak tulajdonos vagy marketing szerepkör használhatja.");
  return role as "owner" | "marketing";
}
const cleanText = (s: unknown, max: number) => (typeof s === "string" ? s.trim().slice(0, max) : "");

export const listCampaignDrafts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const role = await requireCampaignRole(context.supabase, context.userId);
    const { data, error } = await context.supabase.from("email_campaigns").select("id,name,target_group,status,created_by,created_at,updated_at,prechecked_at").order("updated_at", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return { role, userId: context.userId, campaigns: data ?? [] };
  });

export const saveCampaignDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id?: string | null; name: string; target_group?: string | null }) => {
    const name = cleanText(i.name, 200);
    if (!name) throw new Error("A kampány neve kötelező.");
    if (i.id && !UUID.test(i.id)) throw new Error("Hibás kampányazonosító.");
    return { id: i.id ?? null, name, target_group: cleanText(i.target_group, 500) || null };
  })
  .handler(async ({ data, context }) => {
    await requireCampaignRole(context.supabase, context.userId);
    if (!data.id) {
      const { data: row, error } = await context.supabase.from("email_campaigns").insert({ name: data.name, target_group: data.target_group }).select("id,status").single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: rows, error } = await context.supabase.from("email_campaigns").update({ name: data.name, target_group: data.target_group }).eq("id", data.id).neq("status", "archived").select("id,status");
    if (error) throw new Error(error.message);
    if (rows?.length !== 1) throw new Error("A kampány nem található, archivált, vagy nincs jogosultságod.");
    return rows[0]!;
  });

export const setCampaignArchived = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; archived: boolean }) => {
    if (!UUID.test(i.id)) throw new Error("Hibás kampányazonosító.");
    return { id: i.id, archived: !!i.archived };
  })
  .handler(async ({ data, context }) => {
    await requireCampaignRole(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase.from("email_campaigns").update({ status: data.archived ? "archived" : "draft" }).eq("id", data.id).select("id,status");
    if (error) throw new Error(error.message);
    if (rows?.length !== 1) throw new Error("A kampány nem található vagy nincs jogosultságod.");
    return rows[0]!;
  });

/** Címzettek újraellenőrzése és tárolása. A kampány láthatóságát/írhatóságát a user-RLS dönti el. */
export const precheckAndStoreCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; companyIds: string[] }) => {
    if (!UUID.test(i.id)) throw new Error("Hibás kampányazonosító.");
    const ids = [...new Set((i.companyIds ?? []).filter(x => UUID.test(x)))];
    if (!ids.length || ids.length > 2000) throw new Error("1–2000 cég választható.");
    return { id: i.id, companyIds: ids };
  })
  .handler(async ({ data, context }) => {
    await requireCampaignRole(context.supabase, context.userId);
    // Jogosultság-bizonyítás: a felhasználó a saját kliensével tudja-e módosítani (no-op update).
    const { data: own, error: ownErr } = await context.supabase.from("email_campaigns").update({ status: "draft" }).eq("id", data.id).neq("status", "archived").select("id");
    if (ownErr) throw new Error(ownErr.message);
    if (own?.length !== 1) throw new Error("A kampány nem található, archivált, vagy nincs jogosultságod.");
    const { runCampaignPrecheck } = await import("./campaign-precheck.server");
    const res = await runCampaignPrecheck(context.supabase, data.companyIds);
    // Kampányon belüli duplikátum: csak az első példány tárolható.
    const seen = new Set<string>();
    const rows = res.rows.filter(r => { const k = r.norm || `contact:${r.contact_id}`; if (seen.has(k)) return false; seen.add(k); return true; })
      .map(r => ({ campaign_id: data.id, contact_id: r.contact_id, email_norm: r.norm || null, eligibility: r.status, reasons: r.reasons, last_history_at: r.last_at }));
    const skipped = res.rows.length - rows.length;
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { error: delErr } = await db.from("email_campaign_recipients").delete().eq("campaign_id", data.id);
    if (delErr) throw new Error(delErr.message);
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db.from("email_campaign_recipients").insert(rows.slice(i, i + 500));
      if (error) throw new Error(`Címzettek mentése sikertelen, a kampány tervezet maradt: ${error.message}`);
    }
    // Hiányos előzményvizsgálatnál nem lehet "prechecked".
    if (res.historyComplete) {
      const { error } = await db.from("email_campaigns").update({ status: "prechecked", prechecked_at: new Date().toISOString() }).eq("id", data.id);
      if (error) throw new Error(error.message);
    }
    return { stored: rows.length, skippedDuplicates: skipped, historyComplete: res.historyComplete, status: res.historyComplete ? "prechecked" : "draft" };
  });

export const getCampaignDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; eligibility: EligibilityStatus | "all"; page: number }) => {
    if (!UUID.test(i.id)) throw new Error("Hibás kampányazonosító.");
    if (i.eligibility !== "all" && !ELIG.includes(i.eligibility)) throw new Error("Ismeretlen állapot.");
    return { id: i.id, eligibility: i.eligibility, page: Math.max(1, Math.floor(i.page || 1)) };
  })
  .handler(async ({ data, context }) => {
    await requireCampaignRole(context.supabase, context.userId);
    const { data: camp, error } = await context.supabase.from("email_campaigns").select("id,name,target_group,status,created_by,prechecked_at,updated_at").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!camp) throw new Error("A kampány nem található vagy nincs jogosultságod.");
    // Összes tárolt címzett (lapozva, 1000 felett is) a számlálókhoz és az elavulás-vizsgálathoz.
    const all: { contact_id: string; email_norm: string | null; eligibility: string }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data: r, error: e } = await context.supabase.from("email_campaign_recipients").select("contact_id,email_norm,eligibility").eq("campaign_id", data.id).order("id").range(from, from + 999);
      if (e) throw new Error(e.message);
      all.push(...(r ?? []));
      if (!r || r.length < 1000) break;
    }
    const counts = Object.fromEntries(ELIG.map(s => [s, all.filter(r => r.eligibility === s).length])) as Record<EligibilityStatus, number>;
    let q = context.supabase.from("email_campaign_recipients").select("contact_id,email_norm,eligibility,reasons,last_history_at,checked_at,contacts(name,company_id,companies(name))", { count: "exact" }).eq("campaign_id", data.id);
    if (data.eligibility !== "all") q = q.eq("eligibility", data.eligibility);
    const { data: page, count, error: pe } = await q.order("email_norm").range((data.page - 1) * PAGE, data.page * PAGE - 1);
    if (pe) throw new Error(pe.message);
    const { campaignStaleness } = await import("./campaign-precheck.server");
    const staleness = await campaignStaleness(all, camp.prechecked_at);
    return {
      campaign: camp, counts, total: count ?? 0, page: data.page, pageSize: PAGE, staleness,
      rows: (page ?? []).map((r: any) => ({ contact_id: r.contact_id, email: r.email_norm, eligibility: r.eligibility as EligibilityStatus, reasons: (r.reasons ?? []) as string[], last_at: r.last_history_at, name: r.contacts?.name ?? null, company_id: r.contacts?.company_id ?? null, company_name: r.contacts?.companies?.name ?? null })),
    };
  });
