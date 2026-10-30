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

const THREAD_SELECT = "id,subject,last_message_at,participants,company_id";

export function normalizeContactEmails(contacts: { email?: string | null }[]): string[] {
  return Array.from(new Set(contacts.map((c) => (c.email ?? "").trim().toLowerCase()).filter(Boolean))).sort();
}

export function companyEmailQueryKey(companyId: string, contactEmails: string[], page = 0) {
  return ["emails", "by_company_aggregate", companyId, contactEmails.join(","), page] as const;
}

/** PostgREST `or()` szűrő: céghez kötött szál VAGY kapcsolattartó résztvevő. */
export function companyThreadOrFilter(companyId: string, contactEmails: string[], emailLinkedThreadIds: string[] = []): string {
  const parts = [`company_id.eq.${companyId}`];
  const ids = emailLinkedThreadIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (ids.length) parts.push(`id.in.(${ids.join(",")})`);
  const safe = contactEmails.filter((e) => /^[^\s",{}()]+$/.test(e));
  if (safe.length) parts.push(`participants.ov.{${safe.map((e) => `"${e}"`).join(",")}}`);
  return parts.join(",");
}

export const COMPANY_THREAD_PAGE_SIZE = 25;
/** Levél-szintű céghozzárendelésből legfeljebb ennyi szál-azonosító kerül a szűrőbe (URL-méret). */
export const MAX_EMAIL_LINKED_THREADS = 150;

/**
 * Szálak, amelyeknek valamely levele MÁR a céghez van rendelve (emails.company_id).
 * Meglévő, explicit hozzárendelés — nem automatikus átkötés. A hívó RLS-jogaival fut.
 * `overflow`: túl sok szál (pl. a saját cég) — ekkor ez a forrás kimarad, és jelezzük.
 */
export async function fetchEmailLinkedThreadIds(companyId: string) {
  const ids = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const r = await supabase.from("emails").select("thread_id").eq("company_id", companyId)
      .not("thread_id", "is", null).order("id").range(from, from + 999);
    if (r.error) throw r.error;
    for (const row of (r.data ?? []) as any[]) if (row.thread_id) ids.add(row.thread_id);
    if (ids.size > MAX_EMAIL_LINKED_THREADS) return { ids: [] as string[], overflow: true };
    if ((r.data ?? []).length < 1000) break;
  }
  return { ids: Array.from(ids).sort(), overflow: false };
}

/**
 * Céges levélszálak szerveroldali lapozással. A számláló (`total`) és a
 * lista UGYANABBÓL a szűrőből jön (pontos count), a hívó RLS-jogaival.
 * Egyszerre csak egy oldal (25 szál) töltődik be, levelek tömegesen nem.
 */
export async function fetchCompanyThreadsPage(companyId: string, contactEmails: string[], page = 0, pageSize = COMPANY_THREAD_PAGE_SIZE) {
  const from = page * pageSize;
  const linked = await fetchEmailLinkedThreadIds(companyId);
  const r = await supabase.from("email_threads").select(THREAD_SELECT, { count: "exact" })
    .or(companyThreadOrFilter(companyId, contactEmails, linked.ids))
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: true })
    .range(from, from + pageSize - 1);
  if (r.error) throw r.error;
  const threads = (r.data ?? []) as any[];
  const counts = await Promise.all(threads.map((t) =>
    supabase.from("emails").select("id", { count: "exact", head: true }).eq("thread_id", t.id)));
  const rows: CompanyThread[] = threads.map((t, i) => ({
    id: t.id,
    subject: t.subject ?? null,
    last_message_at: t.last_message_at ?? null,
    count: counts[i].error ? 0 : (counts[i].count ?? 0),
    participants: (t.participants ?? []) as string[],
  }));
  return { rows, total: r.count ?? rows.length, page, pageSize, emailLinkOverflow: linked.overflow };
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
    const cur: CompanyThread = byThread.get(key) ?? { id: key, subject: e.subject ?? null, last_message_at: at, count: 0, participants: [] as string[] };
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
