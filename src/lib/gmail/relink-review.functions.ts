import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { analyzeThread, buildContactIndex, type RelinkCategory, type RelinkResult } from "./relink-analysis";

/** A három valódi céges postafiók; a tesztfiók szándékosan kimarad. */
export const RELINK_MAILBOXES = ["info@vibateam.hu", "ramon.dencsi@vibateam.hu", "pretor.laszlo@vibateam.hu"] as const;
const CATS: RelinkCategory[] = ["certain", "review", "conflict", "no_contact", "linked", "internal"];
const PAGE = 50;

type Input = { mailbox: string; category: RelinkCategory | "all"; page: number; search?: string };

/**
 * Tulajdonosi, kizárólag olvasó (DRY-RUN) összerendelés-elemzés. Semmit nem ír, nem módosít
 * jogosultságot; az összerendelés eldöntése későbbi, külön jóváhagyott lépés.
 */
export const getMailRelinkReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: Input) => {
    if (!RELINK_MAILBOXES.includes(i.mailbox as never)) throw new Error("Ismeretlen postafiók.");
    if (i.category !== "all" && !CATS.includes(i.category)) throw new Error("Ismeretlen kategória.");
    return { mailbox: i.mailbox, category: i.category, page: Math.max(1, Math.floor(i.page || 1)), search: (i.search ?? "").trim().toLowerCase().slice(0, 100) };
  })
  .handler(async ({ data, context }) => {
    const { data: role, error: roleErr } = await context.supabase.rpc("crm_role_of", { _auth_user: context.userId });
    if (roleErr || role !== "owner") throw new Error("Csak tulajdonos nézheti meg.");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");

    async function all<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
      const out: T[] = [];
      for (let from = 0; ; from += 1000) {
        const { data: rows, error } = await q(from, from + 999);
        if (error) throw new Error(error.message);
        out.push(...(rows ?? []));
        if (!rows || rows.length < 1000) return out;
      }
    }
    const chunks = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

    const { data: prof } = await db.from("users_profile").select("auth_user_id,gmail_last_sync_at,gmail_auth_error").eq("gmail_email", data.mailbox).maybeSingle();
    const ownerId = prof?.auth_user_id ?? null;
    const [contacts, access, runs] = await Promise.all([
      all<{ id: string; email: string | null; company_id: string | null }>((f, t) => db.from("contacts").select("id,email,company_id").not("email", "is", null).order("id").range(f, t)),
      all<{ thread_id: string }>((f, t) => db.from("email_thread_access").select("thread_id").ilike("mailbox_email", data.mailbox).order("thread_id").range(f, t)),
      ownerId ? db.from("gmail_sync_runs").select("started_at,errors").eq("user_id", ownerId).order("started_at", { ascending: false }).limit(500) : Promise.resolve({ data: [] as { started_at: string; errors: unknown }[] }),
    ]);
    const idx = buildContactIndex(contacts);
    const threadIds = [...new Set(access.map(a => a.thread_id))];
    const threads = new Map<string, { id: string; company_id: string | null; contact_id: string | null; subject: string | null; last_message_at: string | null }>();
    const msgs = new Map<string, Parameters<typeof analyzeThread>[1]>();
    let messageCount = 0;
    for (const ids of chunks(threadIds, 150)) {
      const [t, m] = await Promise.all([
        db.from("email_threads").select("id,company_id,contact_id,subject,last_message_at").in("id", ids),
        // Csak a postafiók saját üzenetei: a közös szál nem ad hozzáférést más fiók leveleihez.
        all<any>((f, to) => db.from("emails").select("thread_id,from_email,to_emails,cc_emails,is_outbound,internal_date,subject,gmail_label_ids").in("thread_id", ids).eq("owner_user_id", ownerId ?? "00000000-0000-0000-0000-000000000000").order("id").range(f, to)),
      ]);
      if (t.error) throw new Error(t.error.message);
      for (const r of t.data ?? []) threads.set(r.id, r);
      for (const r of m) { messageCount++; msgs.set(r.thread_id, [...(msgs.get(r.thread_id) ?? []), r]); }
    }
    const results: RelinkResult[] = [...threads.values()].map(t => analyzeThread(t, msgs.get(t.id) ?? [], data.mailbox, idx));
    const counts = Object.fromEntries(CATS.map(c => [c, 0])) as Record<RelinkCategory, number>;
    for (const r of results) counts[r.category]++;
    const crossMailbox = new Set<string>();
    const filtered = results
      .filter(r => data.category === "all" || r.category === data.category)
      .filter(r => !data.search || r.subject.toLowerCase().includes(data.search) || r.external.some(e => e.includes(data.search)))
      .sort((a, b) => (b.last_at ?? "").localeCompare(a.last_at ?? ""));
    const pageRows = filtered.slice((data.page - 1) * PAGE, data.page * PAGE);
    const companyIds = [...new Set(pageRows.flatMap(r => [r.suggested_company_id, r.saved_company_id]).filter((x): x is string => !!x))];
    const pageThreadIds = pageRows.map(r => r.thread_id);
    const [cos, shared] = await Promise.all([
      companyIds.length ? db.from("companies").select("id,name").in("id", companyIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      pageThreadIds.length ? db.from("email_thread_access").select("thread_id,mailbox_email").in("thread_id", pageThreadIds) : Promise.resolve({ data: [] as { thread_id: string; mailbox_email: string }[] }),
    ]);
    for (const s of shared.data ?? []) if (s.mailbox_email?.toLowerCase() !== data.mailbox) crossMailbox.add(s.thread_id);
    const names = new Map((cos.data ?? []).map(c => [c.id, c.name]));
    const syncErrors = (runs.data ?? []).flatMap(r => (Array.isArray(r.errors) ? r.errors : []).map(e => ({ at: r.started_at, error: String(e).slice(0, 200) })));
    const real = syncErrors.filter(e => !/CRM-hozzárendelés|kézi ellenőrzés/i.test(e.error));
    return {
      mailbox: data.mailbox, lastSyncAt: prof?.gmail_last_sync_at ?? null, authError: !!prof?.gmail_auth_error,
      threads: threads.size, accessRows: threadIds.length, messages: messageCount, counts,
      replied: results.filter(r => r.replied).length,
      syncErrors: { runsChecked: (runs.data ?? []).length, total: real.length, http404: real.filter(e => /\b404\b/.test(e.error)).length, crmReviewNotes: syncErrors.length - real.length, latest: real.slice(0, 10) },
      total: filtered.length, page: data.page, pageSize: PAGE,
      rows: pageRows.map(r => ({ ...r, external: r.external.slice(0, 6), saved_company_name: r.saved_company_id ? names.get(r.saved_company_id) ?? null : null, suggested_company_name: r.suggested_company_id ? names.get(r.suggested_company_id) ?? null : null, shared_with_other_mailbox: crossMailbox.has(r.thread_id) })),
    };
  });
