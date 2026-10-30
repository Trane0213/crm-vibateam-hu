/**
 * Céges kommunikáció és összesítők — KÖZÖS forrás a marketinges
 * (MarketingWorkspace) és a tulajdonosi/sales (LegacyCustomerDetail)
 * cégadatlaphoz (2. szakasz, 2026-10-30).
 *
 * - Minden lekérdezés a böngésző kliensén, a hívó RLS-jogaival fut:
 *   a marketinges/sales csak a számára megnyitott szálakat látja
 *   (email_thread_access), a központi postafiókot nem.
 * - Nincs új tábla, nincs automatikus átkötés: csak olvasás.
 */
import { supabase } from "@/integrations/supabase/client";

export const EMAIL_SELECT =
  "id,thread_id,subject,from_email,to_email,to_emails,cc_emails,bcc_emails,internal_date,created_at,is_outbound,company_id";
const THREAD_SELECT = "id,subject,last_message_at,participants,company_id";

export function normalizeContactEmails(contacts: { email?: string | null }[]): string[] {
  return Array.from(new Set(contacts.map((c) => (c.email ?? "").trim().toLowerCase()).filter(Boolean))).sort();
}

export function companyEmailQueryKey(companyId: string, contactEmails: string[]) {
  return ["emails", "by_company_aggregate", companyId, contactEmails.join(",")] as const;
}

/** Céghez tartozó levelek: céghez kötött szál/levél + kapcsolattartó résztvevős szálak teljes anyaga. */
export async function fetchCompanyEmails(companyId: string, contactEmails: string[]) {
  const threadIds = new Set<string>();
  const threadMeta = new Map<string, any>();
  const rowsById = new Map<string, any>();
  const addThreads = (rows: any[] | null) => {
    for (const t of rows ?? []) if (t?.id) { threadIds.add(t.id); threadMeta.set(t.id, t); }
  };
  const addEmails = (rows: any[] | null) => {
    for (const e of rows ?? []) {
      if (!e?.id) continue;
      rowsById.set(e.id, e);
      if (e.thread_id) threadIds.add(e.thread_id);
    }
  };

  const t1 = await supabase.from("email_threads").select(THREAD_SELECT).eq("company_id", companyId)
    .order("last_message_at", { ascending: false, nullsFirst: false }).limit(500);
  if (t1.error) throw t1.error;
  addThreads(t1.data as any[]);

  if (contactEmails.length > 0) {
    const t2 = await supabase.from("email_threads").select(THREAD_SELECT).overlaps("participants", contactEmails)
      .order("last_message_at", { ascending: false, nullsFirst: false }).limit(500);
    if (t2.error) throw t2.error;
    addThreads(t2.data as any[]);
  }

  const e1 = await supabase.from("emails").select(EMAIL_SELECT).eq("company_id", companyId)
    .order("internal_date", { ascending: false, nullsFirst: false }).limit(500);
  if (e1.error) throw e1.error;
  addEmails(e1.data as any[]);

  if (contactEmails.length > 0) {
    const rs = await Promise.all([
      supabase.from("emails").select(EMAIL_SELECT).in("from_email", contactEmails).limit(500),
      supabase.from("emails").select(EMAIL_SELECT).in("to_email", contactEmails).limit(500),
      supabase.from("emails").select(EMAIL_SELECT).overlaps("to_emails", contactEmails).limit(500),
      supabase.from("emails").select(EMAIL_SELECT).overlaps("cc_emails", contactEmails).limit(500),
      supabase.from("emails").select(EMAIL_SELECT).overlaps("bcc_emails", contactEmails).limit(500),
    ]);
    for (const r of rs) { if (r.error) throw r.error; addEmails(r.data as any[]); }
  }

  const ids = Array.from(threadIds);
  for (let i = 0; i < ids.length; i += 100) {
    const r = await supabase.from("emails").select(EMAIL_SELECT).in("thread_id", ids.slice(i, i + 100))
      .order("internal_date", { ascending: false, nullsFirst: false }).limit(1000);
    if (r.error) throw r.error;
    addEmails(r.data as any[]);
  }

  return Array.from(rowsById.values()).map((row) => ({
    ...row,
    subject: row.subject ?? (row.thread_id ? threadMeta.get(row.thread_id)?.subject : null),
    participants: row.thread_id ? threadMeta.get(row.thread_id)?.participants : undefined,
  })).sort((a, b) => (b.internal_date ?? b.created_at ?? "").localeCompare(a.internal_date ?? a.created_at ?? ""));
}

export type CompanyThread = {
  id: string; subject: string | null; last_message_at: string | null; count: number; participants: string[];
};

/** Levelekből derivált szálak — a szám és a lista mindig ugyanabból a halmazból jön. */
export function groupEmailThreads(rows: any[]): CompanyThread[] {
  const byThread = new Map<string, CompanyThread>();
  for (const e of rows) {
    const key = e.thread_id ?? e.id;
    const at = e.internal_date ?? e.created_at ?? null;
    const cur = byThread.get(key) ?? { id: key, subject: e.subject ?? null, last_message_at: at, count: 0, participants: [] };
    cur.count++;
    if (!cur.subject && e.subject) cur.subject = e.subject;
    if (!cur.last_message_at || (at && at > cur.last_message_at)) cur.last_message_at = at;
    for (const a of [e.from_email, e.to_email, ...(e.to_emails ?? []), ...(e.participants ?? [])].filter(Boolean) as string[]) {
      if (!cur.participants.includes(a)) cur.participants.push(a);
    }
    byThread.set(key, cur);
  }
  return Array.from(byThread.values()).sort((a, b) => (b.last_message_at ?? "").localeCompare(a.last_message_at ?? ""));
}

/** Több forrásból jött sorok egyesítése azonosító szerint — egy rekord egyszer számít. */
export function mergeById<T extends { id: string }>(...lists: (T[] | null | undefined)[]): T[] {
  const m = new Map<string, T>();
  for (const l of lists) for (const r of l ?? []) if (r?.id && !m.has(r.id)) m.set(r.id, r);
  return Array.from(m.values());
}

export const OPEN_QUOTE_STATUSES = ["draft", "sent", "negotiation"];

/** Cégadatlap számlálói ajánlatokra/utánkövetésekre (projekthez és leadhez kötöttek együtt). */
export function companyCounters(quotes: { status?: string | null }[], followups: { completed?: boolean | null; due_date?: string | null }[], now = new Date()) {
  const openFollowups = followups.filter((f) => !f.completed);
  return {
    openQuotes: quotes.filter((q) => OPEN_QUOTE_STATUSES.includes(q.status ?? "")).length,
    openFollowups: openFollowups.length,
    overdueFollowups: openFollowups.filter((f) => f.due_date && new Date(f.due_date) < now).length,
  };
}

/**
 * Levél-szám felirat. Ha a felhasználó nem lát minden postafiókot, a 0
 * NEM jelenti azt, hogy nincs levél — ezt kimondjuk.
 */
export function emailVisibilityHint(fullAccess: boolean | undefined, visibleCount: number): string | null {
  if (fullAccess) return null;
  return visibleCount === 0
    ? "Nincs számodra látható levél. Lehet, hogy van levelezés, de a szálhoz nincs olvasási jogod (postafiók-hozzárendelés)."
    : "Csak a számodra megnyitott levélszálak látszanak; további levelezés is lehet.";
}

export async function fetchEmailFullAccess(): Promise<boolean> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return false;
  const { data, error } = await supabase.rpc("is_email_admin", { _user_id: u.user.id });
  if (error) return false;
  return data === true;
}
