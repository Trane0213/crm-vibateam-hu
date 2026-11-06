import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { classifyCandidates, type EligibilityStatus, type HistoryHit } from "./campaign-eligibility";

const PAGE = 50;
const STATUSES: (EligibilityStatus | "all")[] = ["all", "ready", "contacted", "replied", "uncertain", "invalid"];
const TEST_MAILBOXES = ["viktor.csotai@gmail.com"];

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
    // Kontaktok a felhasználó saját jogosultságával (RLS): csak látható cégek/kontaktok jelöltek.
    const chunks = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
    const candidates: { contact_id: string; company_id: string | null; company_name: string | null; name: string | null; email: string | null; email_invalid: boolean | null }[] = [];
    for (const ids of chunks(data.companyIds, 200)) {
      for (let from = 0; ; from += 1000) {
        const { data: rows, error } = await context.supabase.from("contacts").select("id,company_id,name,email,email_invalid,companies(name)").in("company_id", ids).order("id").range(from, from + 999);
        if (error) throw new Error(error.message);
        for (const r of rows ?? []) candidates.push({ contact_id: r.id, company_id: r.company_id, company_name: (r.companies as { name: string } | null)?.name ?? null, name: r.name, email: r.email, email_invalid: r.email_invalid });
        if (!rows || rows.length < 1000) break;
      }
    }
    // Előzmény: szerveroldali, tartalom nélküli minősítés (csak cím, irány, időpont, postafiók).
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: profiles, error: pErr } = await db.from("users_profile").select("auth_user_id,gmail_email").not("gmail_email", "is", null);
    if (pErr) throw new Error(pErr.message);
    const mailboxOf = new Map((profiles ?? []).map(p => [p.auth_user_id as string, (p.gmail_email ?? "").toLowerCase()]));
    const testOwners = new Set([...mailboxOf].filter(([, m]) => TEST_MAILBOXES.includes(m)).map(([id]) => id));
    const addrs = [...new Set(candidates.map(c => (c.email ?? "").trim()).filter(e => e.includes("@")).flatMap(e => [e, e.toLowerCase()]))];
    const hits: HistoryHit[] = [];
    let historyComplete = true;
    const deadline = Date.now() + 40_000;
    for (const part of chunks(addrs, 100)) {
      if (Date.now() > deadline) { historyComplete = false; break; }
      const queries = [
        { col: "to_emails" }, { col: "cc_emails" }, { col: "from_email" },
      ] as const;
      for (const q of queries) {
        for (let from = 0; ; from += 1000) {
          const base = db.from("emails").select("owner_user_id,from_email,to_emails,cc_emails,is_outbound,internal_date");
          const { data: rows, error } = await (q.col === "from_email" ? base.in("from_email", part) : base.overlaps(q.col, part)).order("id").range(from, from + 999);
          if (error) throw new Error(error.message);
          for (const r of rows ?? []) {
            if (testOwners.has(r.owner_user_id)) continue;
            const mailbox = mailboxOf.get(r.owner_user_id) ?? "ismeretlen postafiók";
            const set = new Set(part.map(a => a.toLowerCase()));
            const list = q.col === "from_email" ? [r.from_email] : (r[q.col] as string[] | null) ?? [];
            for (const a of list) if (a && set.has(a.toLowerCase())) hits.push({ email: a, direction: r.is_outbound ? "out" : "in", at: r.internal_date, mailbox });
          }
          if (!rows || rows.length < 1000) break;
        }
      }
    }
    // Cégszintű szálelőzmény (darabszám, tartalom nélkül).
    const threadCount = new Map<string, { n: number; last: string | null }>();
    for (const ids of chunks(data.companyIds, 200)) {
      for (let from = 0; ; from += 1000) {
        const { data: rows, error } = await db.from("email_threads").select("company_id,last_message_at").in("company_id", ids).order("id").range(from, from + 999);
        if (error) throw new Error(error.message);
        for (const r of rows ?? []) { const c = threadCount.get(r.company_id!) ?? { n: 0, last: null }; c.n++; if ((r.last_message_at ?? "") > (c.last ?? "")) c.last = r.last_message_at; threadCount.set(r.company_id!, c); }
        if (!rows || rows.length < 1000) break;
      }
    }
    const rows = classifyCandidates(candidates, hits, [...threadCount].map(([company_id, v]) => ({ company_id, threads: v.n, last_at: v.last })), { historyComplete });
    const counts = Object.fromEntries(STATUSES.filter(s => s !== "all").map(s => [s, rows.filter(r => r.status === s).length])) as Record<EligibilityStatus, number>;
    const filtered = rows.filter(r => data.status === "all" || r.status === data.status);
    return {
      dryRun: true as const, companies: data.companyIds.length, contacts: candidates.length, historyMessages: hits.length, historyComplete, counts,
      total: filtered.length, page: data.page, pageSize: PAGE,
      rows: filtered.slice((data.page - 1) * PAGE, data.page * PAGE).map(r => ({
        contact_id: r.contact_id, company_id: r.company_id, company_name: r.company_name, name: r.name, email: r.norm || r.email,
        status: r.status, reasons: r.reasons, last_at: r.last_at,
        mailboxes: isOwner ? r.mailboxes : r.mailboxes.length ? ["céges postafiók"] : [],
      })),
    };
  });
