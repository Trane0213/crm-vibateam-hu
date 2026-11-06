import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { EligibilityStatus } from "./campaign-eligibility";

const PAGE = 50;
const STATUSES: (EligibilityStatus | "all")[] = ["all", "ready", "contacted", "replied", "uncertain", "invalid"];

type Input = { companyIds: string[]; status: EligibilityStatus | "all"; page: number };

/**
 * DRY-RUN kampány-előellenőrzés (Owner/Marketing). Semmit nem ír és nem küld.
 * Az összes céges postafiók tárolt leveleit szerveren minősíti; csak irányt/időpontot ad vissza,
 * levéltartalmat soha. Más postafiók neve csak tulajdonosnak látszik.
 */
export const precheckCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: Input) => {
    const ids = [...new Set((i.companyIds ?? []).filter(x => /^[0-9a-f-]{36}$/i.test(x)))];
    if (!ids.length) throw new Error("Nincs kiválasztott cég.");
    if (ids.length > 2000) throw new Error("Legfeljebb 2000 cég ellenőrizhető egyszerre.");
    if (!STATUSES.includes(i.status)) throw new Error("Ismeretlen állapot.");
    return { companyIds: ids, status: i.status, page: Math.max(1, Math.floor(i.page || 1)) };
  })
  .handler(async ({ data, context }) => {
    const { data: role, error: roleErr } = await context.supabase.rpc("crm_role_of", { _auth_user: context.userId });
    if (roleErr || (role !== "owner" && role !== "marketing")) throw new Error("Csak tulajdonos vagy marketing szerepkör használhatja.");
    const isOwner = role === "owner";
    const { runCampaignPrecheck } = await import("./campaign-precheck.server");
    const { rows, historyComplete, contacts, historyMessages } = await runCampaignPrecheck(context.supabase, data.companyIds);
    const counts = Object.fromEntries(STATUSES.filter(s => s !== "all").map(s => [s, rows.filter(r => r.status === s).length])) as Record<EligibilityStatus, number>;
    const filtered = rows.filter(r => data.status === "all" || r.status === data.status);
    return {
      dryRun: true as const, companies: data.companyIds.length, contacts, historyMessages, historyComplete, counts,
      total: filtered.length, page: data.page, pageSize: PAGE,
      rows: filtered.slice((data.page - 1) * PAGE, data.page * PAGE).map(r => ({
        contact_id: r.contact_id, company_id: r.company_id, company_name: r.company_name, name: r.name, email: r.norm || r.email,
        status: r.status, reasons: r.reasons, last_at: r.last_at,
        mailboxes: isOwner ? r.mailboxes : r.mailboxes.length ? ["céges postafiók"] : [],
      })),
    };
  });
