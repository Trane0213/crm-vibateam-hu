import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyCandidates, type HistoryHit } from "./campaign-eligibility";
import { isBusinessMailbox, isVerifiedSent, normEmail, isInternal } from "../gmail/relink-analysis";



/** Közös DRY-RUN előellenőrzés: kontaktok user-RLS-sel, előzmény szerveren, tartalom nélkül. */
export async function runCampaignPrecheck(userClient: SupabaseClient<any>, companyIds: string[]) {
  const context = { supabase: userClient };
  const data = { companyIds };
    // Kontaktok a felhasználó saját jogosultságával (RLS): csak látható cégek/kontaktok jelöltek.
    const chunks = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
    const candidates: { contact_id: string; company_id: string | null; company_name: string | null; name: string | null; email: string | null; email_invalid: boolean | null; marketing_blocked?:boolean }[] = [];
    for (const ids of chunks(data.companyIds, 200)) {
      for (let from = 0; ; from += 1000) {
        const { data: rows, error } = await context.supabase.from("contacts").select("id,company_id,name,email,email_invalid,companies(name)").in("company_id", ids).order("id").range(from, from + 999);
        if (error) throw new Error(error.message);
        for (const r of rows ?? []) candidates.push({ contact_id: r.id, company_id: r.company_id, company_name: (r.companies as unknown as { name: string } | null)?.name ?? null, name: r.name, email: r.email, email_invalid: r.email_invalid });
        if (!rows || rows.length < 1000) break;
      }
    }
    // Előzmény: szerveroldali, tartalom nélküli minősítés (csak cím, irány, időpont, postafiók).
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: profiles, error: pErr } = await db.from("users_profile").select("auth_user_id,gmail_email").not("gmail_email", "is", null);
    if (pErr) throw new Error(pErr.message);
    const mailboxOf = new Map((profiles ?? []).filter(p => isBusinessMailbox(p.gmail_email ?? "")).map(p => [p.auth_user_id as string, normEmail(p.gmail_email)]));
    const owners = [...mailboxOf.keys()];
    const wanted = new Set(candidates.map(c => normEmail(c.email)).filter(Boolean));
    for (const emails of chunks([...wanted],200)) {
      const blocked=await db.from('marketing_email_suppressions' as any).select('email_norm').in('email_norm',emails).eq('blocked',true);
      if(blocked.error) throw new Error(blocked.error.message);
      const addresses=new Set((blocked.data ?? []).map((r:any)=>r.email_norm));
      for(const c of candidates) if(addresses.has(normEmail(c.email))) c.marketing_blocked=true;
    }
    const hits: HistoryHit[] = [];
    // Full normalized scan avoids case-sensitive array matches dropping historic addresses.
    // A completed cache scan is NOT evidence of complete Gmail history (known sync gaps).
    let scanComplete = true;
    const historyComplete = false;
    const deadline = Date.now() + 40_000;
    type Message = { id: string; thread_id: string | null; owner_user_id: string | null; gmail_message_id: string | null; from_email: string | null; to_emails: string[] | null; cc_emails: string[] | null; bcc_emails: string[] | null; is_outbound: boolean | null; internal_date: string | null; gmail_label_ids: string[] | null };
    const found = new Map<string, Message>();
    if (owners.length) for (let from = 0; ; from += 1000) {
      if (Date.now() > deadline) { scanComplete = false; break; }
      const { data: messages, error } = await db.from("emails").select("id,thread_id,owner_user_id,gmail_message_id,from_email,to_emails,cc_emails,bcc_emails,is_outbound,internal_date,gmail_label_ids").in("owner_user_id", owners).order("id").range(from, from + 999);
      if (error) throw new Error(error.message);
      for (const r of messages ?? []) {
        const addresses = [r.from_email, ...(r.to_emails ?? []), ...(r.cc_emails ?? []), ...(r.bcc_emails ?? [])].map(normEmail);
        if (addresses.some(a => wanted.has(a))) found.set(r.id, r);
      }
      if (!messages || messages.length < 1000) break;
    }
    const sentTo = new Map<string, number>();
    const ordered = [...found.values()].sort((a, b) => (a.internal_date ?? "").localeCompare(b.internal_date ?? ""));
    for (const r of ordered) {
      const mailbox = r.owner_user_id ? mailboxOf.get(r.owner_user_id) : undefined;
      if (!mailbox) continue;
      const sender = normEmail(r.from_email);
      const recipients = [...(r.to_emails ?? []), ...(r.cc_emails ?? []), ...(r.bcc_emails ?? [])].map(normEmail);
      const sent = isVerifiedSent(r, mailbox);
      const key = (email: string) => `${r.owner_user_id}:${r.thread_id}:${email}`;
      const at = r.internal_date ? Date.parse(r.internal_date) : NaN;
      if (sent && r.thread_id) for (const email of recipients) if (wanted.has(email)) sentTo.set(key(email), Math.min(sentTo.get(key(email)) ?? Infinity, at));
      const previous = sentTo.get(key(sender));
      const reply = r.is_outbound === false && !!r.thread_id && !isInternal(sender)
        && !r.gmail_label_ids?.includes("DRAFT") && recipients.includes(mailbox)
        && previous !== undefined && at > previous;
      for (const email of new Set([sender, ...recipients])) {
        if (!wanted.has(email)) continue;
        const direction = sent && recipients.includes(email) ? "out" : r.is_outbound === false && email === sender ? "in" : "unverified";
        hits.push({ email, direction, at: r.internal_date, mailbox, verifiedSent: direction === "out", verifiedReply: direction === "in" && reply });
      }
    }
    // Only actual three-account ownership contributes company-level metadata.
    const threadCount = new Map<string, { n: number; last: string | null }>();
    if (owners.length) for (const ids of chunks(data.companyIds, 200)) {
      for (let from = 0; ; from += 1000) {
        const { data: threads, error } = await db.from("email_threads").select("company_id,last_message_at").in("company_id", ids).in("owner_user_id", owners).order("id").range(from, from + 999);
        if (error) throw new Error(error.message);
        for (const r of threads ?? []) {
          if (!r.company_id) continue;
          const c = threadCount.get(r.company_id) ?? { n: 0, last: null }; c.n++;
          if ((r.last_message_at ?? "") > (c.last ?? "")) c.last = r.last_message_at;
          threadCount.set(r.company_id, c);
        }
        if (!threads || threads.length < 1000) break;
      }
    }
    const rows = classifyCandidates(candidates, hits, [...threadCount].map(([company_id, v]) => ({ company_id, threads: v.n, last_at: v.last })), { historyComplete });
    return { rows, historyComplete, scanComplete, contacts: candidates.length, historyMessages: found.size };
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
