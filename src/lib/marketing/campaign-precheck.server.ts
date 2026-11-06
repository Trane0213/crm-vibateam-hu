import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyCandidates, type HistoryHit } from "./campaign-eligibility";

const TEST_MAILBOXES = ["viktor.csotai@gmail.com"];

/** Közös DRY-RUN előellenőrzés: kontaktok user-RLS-sel, előzmény szerveren, tartalom nélkül. */
export async function runCampaignPrecheck(userClient: SupabaseClient<any>, companyIds: string[]) {
  const context = { supabase: userClient };
  const data = { companyIds };
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
            if (r.owner_user_id && testOwners.has(r.owner_user_id)) continue;
            const mailbox = (r.owner_user_id ? mailboxOf.get(r.owner_user_id) : undefined) ?? "ismeretlen postafiók";
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
    return { rows, historyComplete, contacts: candidates.length, historyMessages: hits.length };
}

/** Elavulás: a tárolt címzettek kontaktadata változott, vagy az ellenőrzés óta új levél érkezett/ment. */
export async function campaignStaleness(stored: { contact_id: string; email_norm: string | null }[], since: string | null) {
  if (!since || !stored.length) return { stale: !since && stored.length > 0, reasons: since ? [] : ["Nincs ellenőrzési időpont."] };
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const reasons: string[] = [];
  const chunks = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
  const byId = new Map(stored.map(r => [r.contact_id, r.email_norm]));
  let changed = 0;
  for (const ids of chunks([...byId.keys()], 200)) {
    const { data, error } = await db.from("contacts").select("id,email").in("id", ids);
    if (error) throw new Error(error.message);
    const seen = new Set((data ?? []).map(c => c.id));
    for (const c of data ?? []) if (((c.email ?? "").trim().toLowerCase() || null) !== (byId.get(c.id) ?? null)) changed++;
    changed += ids.filter(id => !seen.has(id)).length;
  }
  if (changed) reasons.push(`${changed} kontakt email-címe változott vagy törlődött.`);
  const addrs = [...new Set(stored.map(r => r.email_norm).filter((x): x is string => !!x))];
  let fresh = 0;
  for (const part of chunks(addrs, 100)) {
    for (const col of ["to_emails", "from_email"] as const) {
      const b = db.from("emails").select("id", { count: "exact", head: true }).gt("created_at", since);
      const { count, error } = await (col === "from_email" ? b.in("from_email", part) : b.overlaps(col, part));
      if (error) throw new Error(error.message);
      fresh += count ?? 0;
    }
  }
  if (fresh) reasons.push(`${fresh} új levél a címzettekkel az ellenőrzés óta.`);
  return { stale: reasons.length > 0, reasons };
}
