import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { EligibilityStatus } from "./campaign-eligibility";
import { campaignCopyInput } from "./campaign-preparation";

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
  .inputValidator((i: unknown) => campaignCopyInput.parse(i))
  .handler(async ({ data, context }) => {
    await requireCampaignRole(context.supabase, context.userId);
    if (!data.id) {
      const { data: row, error } = await context.supabase.from("email_campaigns").insert({ name: data.name, target_group: data.target_group || null, message_subject: data.message_subject, message_body: data.message_body }).select("id,status").single();
      if (error) throw new Error(error.message);
      return row;
    }
    if (!data.expectedUpdatedAt) throw new Error("Nyisd újra a tervezetet.");
    const { data: rows, error } = await context.supabase.from("email_campaigns").update({ name: data.name, target_group: data.target_group || null, message_subject: data.message_subject, message_body: data.message_body }).eq("updated_at", data.expectedUpdatedAt).eq("id", data.id).neq("status", "archived").select("id,status");
    if (error) throw new Error(error.message);
    if (rows?.length !== 1) throw new Error("A kampány megváltozott, archivált, vagy nem szerkeszthető; nyisd újra.");
    const saved = rows?.[0];
    if (!saved) throw new Error("A kampány megváltozott; nyisd újra.");
    return saved;
  });

export const setCampaignArchived = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; archived: boolean; expectedUpdatedAt: string }) => {
    if (!UUID.test(i.id)) throw new Error("Hibás kampányazonosító.");
    if (!i.expectedUpdatedAt) throw new Error("Nyisd újra a tervezetet.");
    return { id: i.id, archived: !!i.archived, expectedUpdatedAt:i.expectedUpdatedAt };
  })
  .handler(async ({ data, context }) => {
    await requireCampaignRole(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase.from("email_campaigns").update({ status: data.archived ? "archived" : "draft" }).eq("updated_at",data.expectedUpdatedAt).eq("id", data.id).select("id,status");
    if (error) throw new Error(error.message);
    if (rows?.length !== 1) throw new Error("A kampány nem található vagy nincs jogosultságod.");
    const saved = rows?.[0];
    if (!saved) throw new Error("A kampány megváltozott; nyisd újra.");
    return saved;
  });

/** Címzettek újraellenőrzése és tárolása. A kampány láthatóságát/írhatóságát a user-RLS dönti el. */
export const precheckAndStoreCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; companyIds: string[]; contactIds: string[]; expectedUpdatedAt: string }) => {
    if (!UUID.test(i.id)) throw new Error("Hibás kampányazonosító.");
    const ids = [...new Set((i.companyIds ?? []).filter(x => UUID.test(x)))];
    if (!ids.length || ids.length > 2000) throw new Error("1–2000 cég választható.");
    const contactIds = [...new Set(i.contactIds ?? [])];
    if (!i.expectedUpdatedAt || !contactIds.length || contactIds.length > 20000 || contactIds.some(x => !UUID.test(x))) throw new Error("Jelölj ki 1–20000 kontaktot és nyisd meg az aktuális tervezetet.");
    return { id: i.id, companyIds: ids, contactIds, expectedUpdatedAt: i.expectedUpdatedAt };
  })
  .handler(async ({ data, context }) => {
    await requireCampaignRole(context.supabase, context.userId);
    const { data: own, error: ownErr } = await context.supabase.from("email_campaigns").select("id,status,updated_at").eq("id", data.id).maybeSingle();
    if (ownErr || !own || own.status === "archived" || own.updated_at !== data.expectedUpdatedAt) throw new Error("A kampány megváltozott vagy nem szerkeszthető; nyisd újra.");
    const { runCampaignPrecheck } = await import("./campaign-precheck.server");
    const res = await runCampaignPrecheck(context.supabase, data.companyIds);
    const selected = new Set(data.contactIds);
    if (data.contactIds.some(id => !res.rows.some(r => r.contact_id === id))) throw new Error("A kijelölt kontakt már nem látható a kijelölt cégekben.");
    const seen = new Set<string>();
    const rows = res.rows.filter(r => selected.has(r.contact_id)).filter(r => {
      const key = r.norm || `contact:${r.contact_id}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    }).map(r => ({ contact_id: r.contact_id, company_id: r.company_id, email_norm: r.norm || null, eligibility: r.status, reasons: r.reasons, last_history_at: r.last_at, selected: true }));
    const skipped = selected.size - rows.length;
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: saved, error } = await db.rpc("campaign_store_preparation", {
      p_campaign: data.id, p_user: context.userId, p_expected: data.expectedUpdatedAt, p_rows: rows, p_complete: res.historyComplete,
    });
    if (error) throw new Error(error.message);
    const result = saved as { stored: number; status: string } | null;
    if (!result || result.stored !== rows.length) throw new Error("A címzettlista mentése nem igazolt.");
    return { stored: result.stored, skippedDuplicates: skipped, historyComplete: res.historyComplete, status: result.status };
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
    const { data: camp, error } = await context.supabase.from("email_campaigns").select("id,name,target_group,message_subject,message_body,status,created_by,prechecked_at,updated_at").eq("id", data.id).maybeSingle();
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
    const savedCandidates: any[] = [];
    for (let from=0;;from+=1000) {
      const r=await context.supabase.from("email_campaign_recipients").select("contact_id,selected,contacts(id,name,email,company_id,companies(name))").eq("campaign_id",data.id).order("id").range(from,from+999);
      if(r.error) throw new Error(r.error.message);
      for(const item of r.data ?? []) if(item.selected === true && item.contacts) savedCandidates.push({id:item.contact_id,name:item.contacts.name,email:item.contacts.email,company_id:item.contacts.company_id,company_name:item.contacts.companies?.name ?? ""});
      if((r.data?.length ?? 0)<1000) break;
    }
    const counts = Object.fromEntries(ELIG.map(s => [s, all.filter(r => r.eligibility === s).length])) as Record<EligibilityStatus, number>;
    let q = context.supabase.from("email_campaign_recipients").select("contact_id,email_norm,eligibility,reasons,last_history_at,checked_at,contacts(name,company_id,contact_kind,data_source,verification_state,verified_by,verified_at,companies(name))", { count: "exact" }).eq("campaign_id", data.id);
    if (data.eligibility !== "all") q = q.eq("eligibility", data.eligibility);
    const { data: page, count, error: pe } = await q.order("email_norm").range((data.page - 1) * PAGE, data.page * PAGE - 1);
    if (pe) throw new Error(pe.message);
    const { campaignStaleness } = await import("./campaign-precheck.server");
    const staleness = await campaignStaleness(all, camp.prechecked_at);
    return {
      campaign: camp, savedCandidates, counts, total: count ?? 0, page: data.page, pageSize: PAGE, staleness,
      rows: (page ?? []).map((r: any) => ({ contact_id: r.contact_id, email: r.email_norm, eligibility: r.eligibility as EligibilityStatus, reasons: (r.reasons ?? []) as string[], last_at: r.last_history_at, name: r.contacts?.name ?? null, contact_kind: r.contacts?.contact_kind, data_source: r.contacts?.data_source, verification_state: r.contacts?.verification_state, verified_by: r.contacts?.verified_by, verified_at: r.contacts?.verified_at, company_id: r.contacts?.company_id ?? null, company_name: r.contacts?.companies?.name ?? null })),
    };
  });
