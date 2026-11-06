import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { analyzeThread, buildContactIndex, type RelinkCategory, type RelinkResult } from "./relink-analysis";

/** A három valódi céges postafiók; a tesztfiók szándékosan kimarad. */
export const RELINK_MAILBOXES = ["info@vibateam.hu", "ramon.dencsi@vibateam.hu", "pretor.laszlo@vibateam.hu"] as const;
const CATS: RelinkCategory[] = ["certain", "review", "conflict", "no_contact", "linked", "internal", "self_other_company", "self_conflict", "self_no_contact", "self_bulk", "self_internal"];
/** A saját cég rekordja (2026-11-01 audit); név szerinti egyezés csak kiegészítés. */
export const SELF_COMPANY_ID = "b454cd40-3473-4653-9424-9cc5bbebe527";

/** Hetek, amelyekben a tárolt levelek száma 0 az első és utolsó tárolt levél között. */
export function weeklyCoverage(dates: string[]) {
  const wk = (t: number) => { const d = new Date(t); const day = (d.getUTCDay() + 6) % 7; d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - day); return d.toISOString().slice(0, 10); };
  const counts = new Map<string, number>();
  for (const x of dates) { const t = Date.parse(x); if (!Number.isNaN(t)) counts.set(wk(t), (counts.get(wk(t)) ?? 0) + 1); }
  const keys = [...counts.keys()].sort();
  if (!keys.length) return { weeks: [] as { week: string; messages: number }[], gaps: [] as string[] };
  const weeks: { week: string; messages: number }[] = [];
  for (let t = Date.parse(keys[0]!); t <= Date.parse(keys[keys.length - 1]!); t += 7 * 864e5) { const k = new Date(t).toISOString().slice(0, 10); weeks.push({ week: k, messages: counts.get(k) ?? 0 }); }
  return { weeks, gaps: weeks.filter(w => w.messages === 0).map(w => w.week) };
}
const PAGE = 50;

type Input = { mailbox: string; category: RelinkCategory | "all"; page: number; search?: string; sharedOnly?: boolean };

/**
 * Tulajdonosi, kizárólag olvasó (DRY-RUN) összerendelés-elemzés. Semmit nem ír, nem módosít
 * jogosultságot; az összerendelés eldöntése későbbi, külön jóváhagyott lépés.
 */
export const getMailRelinkReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: Input) => {
    if (!RELINK_MAILBOXES.includes(i.mailbox as never)) throw new Error("Ismeretlen postafiók.");
    if (i.category !== "all" && !CATS.includes(i.category)) throw new Error("Ismeretlen kategória.");
    return { mailbox: i.mailbox, category: i.category, page: Math.max(1, Math.floor(i.page || 1)), search: (i.search ?? "").trim().toLowerCase().slice(0, 100), sharedOnly: !!i.sharedOnly };
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
    const [contacts, access, runs, selfCos, ownDates] = await Promise.all([
      all<{ id: string; email: string | null; company_id: string | null }>((f, t) => db.from("contacts").select("id,email,company_id").not("email", "is", null).order("id").range(f, t)),
      all<{ thread_id: string }>((f, t) => db.from("email_thread_access").select("thread_id").ilike("mailbox_email", data.mailbox).order("thread_id").range(f, t)),
      ownerId ? db.from("gmail_sync_runs").select("started_at,errors").eq("user_id", ownerId).order("started_at", { ascending: false }).limit(500) : Promise.resolve({ data: [] as { started_at: string; errors: unknown }[] }),
      db.from("companies").select("id").or(`id.eq.${SELF_COMPANY_ID},name.ilike.viba%team%`),
      ownerId ? all<{ internal_date: string | null }>((f, t) => db.from("emails").select("internal_date").eq("owner_user_id", ownerId).order("id").range(f, t)) : Promise.resolve([]),
    ]);
    const selfIds = new Set<string>([SELF_COMPANY_ID, ...(selfCos.data ?? []).map(c => c.id)]);
    const idx = buildContactIndex(contacts);
    // Történeti lefedettség: tárolt levelek hetente; üres heteknél mintavétel a szinkronnaplóból.
    const cov = weeklyCoverage(ownDates.map(d => d.internal_date ?? "").filter(Boolean));
    const gapEvidence = ownerId ? await Promise.all(cov.gaps.slice(0, 30).map(async w => {
      const end = new Date(Date.parse(w) + 7 * 864e5).toISOString();
      const { data: r } = await db.from("gmail_sync_runs").select("started_at,errors,fetched").eq("user_id", ownerId).gte("started_at", w).lt("started_at", end).order("started_at").limit(1);
      const e = JSON.stringify(r?.[0]?.errors ?? "");
      return { week: w, sampleRunAt: r?.[0]?.started_at ?? null, invalidGrant: /invalid_grant/i.test(e), fetched: r?.[0]?.fetched ?? null };
    })) : [];
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
    const results: RelinkResult[] = [...threads.values()].map(t => analyzeThread(t, msgs.get(t.id) ?? [], data.mailbox, idx, selfIds));
    const counts = Object.fromEntries(CATS.map(c => [c, 0])) as Record<RelinkCategory, number>;
    for (const r of results) counts[r.category]++;
    const others = new Map<string, string[]>();
    for (const ids of chunks([...threads.keys()], 300)) {
      const { data: sh, error } = await db.from("email_thread_access").select("thread_id,mailbox_email").in("thread_id", ids).neq("mailbox_email", data.mailbox);
      if (error) throw new Error(error.message);
      for (const r of sh ?? []) { const m = (r.mailbox_email ?? "").toLowerCase(); if (RELINK_MAILBOXES.includes(m as never)) others.set(r.thread_id, [...new Set([...(others.get(r.thread_id) ?? []), m])]); }
    }
    const filtered = results
      .filter(r => !data.sharedOnly || others.has(r.thread_id))
      .filter(r => data.category === "all" || r.category === data.category)
      .filter(r => !data.search || r.subject.toLowerCase().includes(data.search) || r.external.some(e => e.includes(data.search)))
      .sort((a, b) => (b.last_at ?? "").localeCompare(a.last_at ?? ""));
    const pageRows = filtered.slice((data.page - 1) * PAGE, data.page * PAGE);
    const companyIds = [...new Set(pageRows.flatMap(r => [r.suggested_company_id, r.saved_company_id]).filter((x): x is string => !!x))];
    const cos = companyIds.length ? await db.from("companies").select("id,name").in("id", companyIds) : { data: [] as { id: string; name: string }[] };
    const names = new Map((cos.data ?? []).map(c => [c.id, c.name]));
    const syncErrors = (runs.data ?? []).flatMap(r => (Array.isArray(r.errors) ? r.errors : []).map(e => ({ at: r.started_at, error: String(e).slice(0, 200) })));
    const real = syncErrors.filter(e => !/CRM-hozzárendelés|kézi ellenőrzés/i.test(e.error));
    return {
      mailbox: data.mailbox, lastSyncAt: prof?.gmail_last_sync_at ?? null, authError: !!prof?.gmail_auth_error,
      threads: threads.size, accessRows: threadIds.length, messages: messageCount, counts,
      replied: results.filter(r => r.replied).length,
      selfLinked: results.filter(r => r.category.startsWith("self_")).length,
      sharedThreads: others.size,
      coverage: { firstWeek: cov.weeks[0]?.week ?? null, lastWeek: cov.weeks.at(-1)?.week ?? null, weeks: cov.weeks, gaps: gapEvidence },
      syncErrors: { runsChecked: (runs.data ?? []).length, total: real.length, http404: real.filter(e => /\b404\b/.test(e.error)).length, crmReviewNotes: syncErrors.length - real.length, latest: real.slice(0, 10) },
      total: filtered.length, page: data.page, pageSize: PAGE,
      rows: pageRows.map(r => ({ ...r, external: r.external.slice(0, 6), saved_company_name: r.saved_company_id ? names.get(r.saved_company_id) ?? null : null, suggested_company_name: r.suggested_company_id ? names.get(r.suggested_company_id) ?? null : null, other_mailboxes: others.get(r.thread_id) ?? [] })),
    };
  });

/**
 * DRY-RUN visszatöltési előnézet: a Gmailben egy időablakban lévő üzenetazonosítókat összeveti a
 * tárolt levelekkel. Nem ír levelet, szálat, kapcsolatot vagy history-checkpointot; egy hívás egy lap.
 * (Lejárt hozzáférési tokennél a meglévő OAuth-segéd frissítheti a tokent – ez nem CRM-adat.)
 */
export const previewMailboxBackfill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { mailbox: string; after: string; before: string; pageToken?: string }) => {
    if (!RELINK_MAILBOXES.includes(i.mailbox as never)) throw new Error("Ismeretlen postafiók.");
    const ok = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
    if (!ok(i.after) || !ok(i.before) || i.after >= i.before) throw new Error("Hibás időablak.");
    return { mailbox: i.mailbox, after: i.after, before: i.before, pageToken: i.pageToken?.slice(0, 200) };
  })
  .handler(async ({ data, context }) => {
    const { data: role, error: roleErr } = await context.supabase.rpc("crm_role_of", { _auth_user: context.userId });
    if (roleErr || role !== "owner") throw new Error("Csak tulajdonos nézheti meg.");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await db.from("users_profile").select("auth_user_id").eq("gmail_email", data.mailbox).maybeSingle();
    if (!prof?.auth_user_id) throw new Error("A postafiók nincs CRM-felhasználóhoz rendelve.");
    const { getValidAccessToken } = await import("./oauth.server");
    const { listMessages } = await import("./gmail-api.server");
    const { accessToken, email } = await getValidAccessToken(prof.auth_user_id);
    if ((email ?? "").toLowerCase() !== data.mailbox) throw new Error("A tárolt engedély másik postafiókhoz tartozik.");
    const q = `after:${data.after.replaceAll("-", "/")} before:${data.before.replaceAll("-", "/")}`;
    const list = await listMessages(accessToken, { q, maxResults: 100, pageToken: data.pageToken });
    const ids = (list.messages ?? []).map((m: { id: string }) => m.id);
    const { data: have, error } = ids.length ? await db.from("emails").select("gmail_message_id").in("gmail_message_id", ids).eq("owner_user_id", prof.auth_user_id) : { data: [], error: null };
    if (error) throw new Error(error.message);
    const stored = new Set((have ?? []).map(r => r.gmail_message_id));
    return { query: q, listed: ids.length, stored: stored.size, missing: ids.filter(id => !stored.has(id)).length, estimate: list.resultSizeEstimate ?? null, nextPageToken: list.nextPageToken ?? null };
  });
