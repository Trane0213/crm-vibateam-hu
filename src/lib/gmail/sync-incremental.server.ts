import { nextHistoryCheckpoint, isPermanentMessageError } from "./relink-analysis";
import { matchCrmAddresses, resolveThreadLink, type CrmLink } from "./crm-association";
/**
 * Inkrementális Gmail szinkron a History API segítségével.
 *
 * - Felhasználónként tárolt `gmail_history_id` alapján csak az új/változott
 *   üzeneteket szedi le (kvótakímélő, gyors).
 * - Ha nincs még historyId (új csatlakozás) vagy a meglévő túl régi (404),
 *   bootstrap módban lefuttat egy kis kezdeti `syncInbox`-ot, és elmenti az
 *   aktuális `historyId`-t a `users.getProfile`-ból.
 * - SENT és INBOX üzeneteket egyaránt szinkronizál (History API minden
 *   `messagesAdded` eseményt visszaad, függetlenül a label-től).
 * - CRM hozzárendelés (contact / company / lead) megegyezik a teljes
 *   `syncInbox`-szal.
 */
import { getAdminClient } from "@/lib/gmail/admin.server";
import {
  listHistory,
  getMessage,
  getProfile,
  headerOf,
  extractBestBodyAsync,
  parseAddressList,
} from "@/lib/gmail/gmail-api.server";
import { getValidAccessToken } from "@/lib/gmail/oauth.server";
import { syncInbox } from "@/lib/gmail/sync.server";

export type IncrementalResult = {
  mode: "bootstrap" | "incremental";
  fetched: number;
  inserted: number;
  skipped: number;
  errors: string[];
  history_before: string | null;
  history_after: string | null;
};

function parseAddr(raw: string): string | null {
  if (!raw) return null;
  const m = raw.match(/<([^>]+)>/);
  return (m ? m[1] : raw).trim() || null;
}

export async function syncInboxIncremental(userId: string): Promise<IncrementalResult> {
  const admin = getAdminClient();
  const { accessToken, email } = await getValidAccessToken(userId);
  const myMailbox = (email ?? "").toLowerCase();

  const { data: prof } = await admin
    .from("users_profile")
    .select("gmail_history_id")
    .eq("auth_user_id", userId)
    .maybeSingle();
  const startHistoryId = (prof as any)?.gmail_history_id as string | null | undefined;

  // Bootstrap: nincs még history checkpoint, vagy elveszett.
  if (!startHistoryId) {
    const r = await syncInbox(userId, { max: 25 });
    const p = await getProfile(accessToken);
    await admin
      .from("users_profile")
      .update({ gmail_history_id: p.historyId, gmail_last_sync_at: new Date().toISOString() })
      .eq("auth_user_id", userId);
    return {
      mode: "bootstrap",
      fetched: r.fetched,
      inserted: r.inserted,
      skipped: r.skipped,
      errors: r.errors,
      history_before: null,
      history_after: p.historyId,
    };
  }

  const result: IncrementalResult = {
    mode: "incremental",
    fetched: 0,
    inserted: 0,
    skipped: 0,
    errors: [],
    history_before: startHistoryId,
    history_after: startHistoryId,
  };

  // CRM cache (kicsi tábla, ritkán fut, percenkénti hívásnak ez bőven elég).
  // A leads tábla nem tárol email mezőt; lead → email kapcsolatot a contact_id-n
  // keresztül oldjuk meg (contacts.email → leads via contact_id).
  const [contactsRes, leadsRes] = await Promise.all([
    admin.from("contacts").select("id,email,company_id").not("email", "is", null).order("id").limit(1000),
    admin.from("leads").select("id,contact_id,company_id").not("contact_id", "is", null).order("id").limit(1000),
  ]);
  if (contactsRes.error || leadsRes.error) throw new Error("A CRM-hozzárendelés nem ellenőrizhető.");
  const completeLookup = (contactsRes.data?.length ?? 0) < 1000 && (leadsRes.data?.length ?? 0) < 1000;
  function matchCrm(addresses: string[]): CrmLink {
    if (!completeLookup) { result.errors.push("CRM-hozzárendelés: részleges címjegyzék, kézi ellenőrzés szükséges."); return { company_id:null,contact_id:null,lead_id:null }; }
    const matched = matchCrmAddresses(addresses, contactsRes.data ?? [], leadsRes.data ?? []);
    if (matched.review) result.errors.push("Bizonytalan CRM-hozzárendelés: kézi ellenőrzés szükséges.");
    return matched.link;
  }

  // Lapozzunk a history-n max ~50 mp deadline-nal.
  const deadline = Date.now() + 45 * 1000;
  let pageToken: string | undefined = undefined;
  const newMessageIds = new Set<string>();
  let latestHistoryId = startHistoryId;

  try {
    do {
      if (Date.now() > deadline) break;
      const h = await listHistory(accessToken, {
        startHistoryId,
        pageToken,
        historyTypes: ["messageAdded"],
      });
      if (h.historyId) latestHistoryId = h.historyId;
      for (const item of h.history ?? []) {
        for (const ma of item.messagesAdded ?? []) {
          if (ma.message?.id) newMessageIds.add(ma.message.id);
        }
      }
      pageToken = h.nextPageToken;
    } while (pageToken);
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    // 404 = startHistoryId túl régi → bootstrap.
    if (/\b404\b/.test(msg)) {
      const r = await syncInbox(userId, { max: 50 });
      const p = await getProfile(accessToken);
      await admin
        .from("users_profile")
        .update({ gmail_history_id: p.historyId, gmail_last_sync_at: new Date().toISOString() })
        .eq("auth_user_id", userId);
      return {
        mode: "bootstrap",
        fetched: r.fetched,
        inserted: r.inserted,
        skipped: r.skipped,
        errors: ["history expired, full re-bootstrap", ...r.errors],
        history_before: startHistoryId,
        history_after: p.historyId,
      };
    }
    throw e;
  }

  // Félbeszakadt history-lapozás: a h.historyId a postafiók aktuális értéke, nem a lap vége → nem léphet előre.
  const historyIncomplete = !!pageToken;
  if (historyIncomplete) latestHistoryId = startHistoryId;
  let pending = 0, transientErrors = 0;

  // Üres futás → csak frissítjük a historyId-t és kilépünk.
  if (newMessageIds.size === 0) {
    if (latestHistoryId && latestHistoryId !== startHistoryId) {
      await admin
        .from("users_profile")
        .update({ gmail_history_id: latestHistoryId, gmail_last_sync_at: new Date().toISOString() })
        .eq("auth_user_id", userId);
      result.history_after = latestHistoryId;
    } else {
      await admin
        .from("users_profile")
        .update({ gmail_last_sync_at: new Date().toISOString() })
        .eq("auth_user_id", userId);
    }
    return result;
  }

  // Már létező message id-k kiszűrése.
  const ids = Array.from(newMessageIds);
  const { data: existing } = await admin
    .from("emails")
    .select("gmail_message_id")
    .in("gmail_message_id", ids);
  const have = new Set((existing ?? []).map((r: any) => r.gmail_message_id as string));
  const toFetch = ids.filter((id) => !have.has(id));
  result.skipped = ids.length - toFetch.length;

  // thread cache
  const threadCache = new Map<string, string>();
  const threadLinks = new Map<string, CrmLink>();
  async function ensureThread(
    gmailThreadId: string,
    subject: string | null,
    crm: { contact_id: string | null; company_id: string | null; lead_id: string | null },
  ): Promise<string> {
    const safeSubject = subject && subject.trim().length > 0 ? subject : "(nincs tárgy)";
    const cached = threadCache.get(gmailThreadId);
    if (cached) return cached;
    const { data: found } = await admin
      .from("email_threads")
      .select("id,company_id,contact_id,lead_id")
      .eq("gmail_thread_id", gmailThreadId)
      .maybeSingle();
    if (found?.id) {
      threadCache.set(gmailThreadId, found.id);
      threadLinks.set(found.id, found);
      return found.id;
    }
    const { data: inserted, error } = await admin
      .from("email_threads")
      .insert({
        gmail_thread_id: gmailThreadId,
        subject: safeSubject,
        owner_user_id: userId,
        contact_id: crm.contact_id,
        company_id: crm.company_id,
        lead_id: crm.lead_id,
      })
      .select("id")
      .single();
    if (error || !inserted) throw new Error(`email_threads insert: ${error?.message ?? "unknown"}`);
    threadCache.set(gmailThreadId, inserted.id);
    threadLinks.set(inserted.id, crm);
    await admin.from("email_thread_access").upsert(
      { thread_id: inserted.id, user_id: userId, mailbox_email: myMailbox },
      { onConflict: "thread_id,user_id" },
    );
    return inserted.id;
  }

  for (const [i, mid] of toFetch.entries()) {
    if (Date.now() > deadline) { pending = toFetch.length - i; break; }
    result.fetched++;
    try {
      const m = await getMessage(accessToken, mid, "full");
      const from = headerOf(m, "From");
      const toRaw = headerOf(m, "To");
      const ccRaw = headerOf(m, "Cc");
      const bccRaw = headerOf(m, "Bcc");
      const subjectHdr = headerOf(m, "Subject");
      const subject = subjectHdr && subjectHdr.trim().length > 0 ? subjectHdr : null;
      const { body } = await extractBestBodyAsync(m, accessToken);
      const toList = parseAddressList(toRaw);
      const ccList = parseAddressList(ccRaw);
      const bccList = parseAddressList(bccRaw);
      const fromAddr = parseAddr(from);
      const allAddrs = [
        ...(fromAddr ? [fromAddr.toLowerCase()] : []),
        ...toList,
        ...ccList,
        ...bccList,
      ].filter((a) => a && a.toLowerCase() !== myMailbox);
      const crm = matchCrm(allAddrs);
      const threadDbId = await ensureThread(m.threadId, subject, crm);
      const resolved = resolveThreadLink(threadLinks.get(threadDbId) ?? crm, crm);
      if (resolved.conflict) result.errors.push(`Szál ${threadDbId}: eltérő CRM-kapcsolat, kézi ellenőrzés szükséges.`);
      const effective = resolved.conflict ? {company_id:null,contact_id:null,lead_id:null} : resolved.link;
      await admin.from("email_thread_access").upsert({thread_id:threadDbId,user_id:userId,mailbox_email:myMailbox},{onConflict:"thread_id,user_id"});
      const labels = (m.labelIds ?? []) as string[];
      const isOutbound =
        labels.includes("SENT") ||
        (fromAddr ? fromAddr.toLowerCase() === myMailbox : false);
      const internalDate = m.internalDate ? new Date(Number(m.internalDate)).toISOString() : null;
      const row = {
        gmail_message_id: m.id,
        thread_id: threadDbId,
        from_email: fromAddr,
        to_email: toList[0] ?? parseAddr(toRaw),
        to_emails: toList,
        cc_emails: ccList,
        bcc_emails: bccList,
        body: body || null,
        summary: m.snippet ?? null,
        snippet: m.snippet ?? null,
        internal_date: internalDate,
        gmail_label_ids: labels,
        is_outbound: isOutbound,
        owner_user_id: userId,
        contact_id: effective.contact_id,
        company_id: effective.company_id,
        lead_id: effective.lead_id,
      };
      const { error: insErr } = await admin.from("emails").insert(row);
      if (insErr) {
        if (String(insErr.message ?? "").toLowerCase().includes("duplicate")) {
          result.skipped++;
        } else {
          result.errors.push(`${mid}: ${insErr.message}`);
          transientErrors++;
        }
      } else {
        result.inserted++;
      }
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      result.errors.push(`${mid}: ${msg}`);
      if (!isPermanentMessageError(msg)) transientErrors++;
    }
  }

  // Aggregátum: az érintett szálak last_message_at frissítése.
  if (threadCache.size > 0) {
    const tids = Array.from(threadCache.values());
    const { data: agg } = await admin
      .from("emails")
      .select("thread_id,internal_date,created_at,from_email,to_emails,gmail_label_ids")
      .in("thread_id", tids);
    const byThread = new Map<string, { last: Date; parts: Set<string>; labels: Set<string> }>();
    for (const r of (agg ?? []) as any[]) {
      const t = r.thread_id as string;
      const dt = new Date(r.internal_date ?? r.created_at);
      const cur = byThread.get(t) ?? { last: new Date(0), parts: new Set<string>(), labels: new Set<string>() };
      if (dt > cur.last) cur.last = dt;
      if (r.from_email) cur.parts.add(String(r.from_email).toLowerCase());
      for (const a of (r.to_emails ?? []) as string[]) cur.parts.add(String(a).toLowerCase());
      for (const l of (r.gmail_label_ids ?? []) as string[]) cur.labels.add(l);
      byThread.set(t, cur);
    }
    for (const [tid, v] of byThread) {
      await admin
        .from("email_threads")
        .update({
          last_message_at: v.last.toISOString(),
          participants: Array.from(v.parts),
          gmail_label_ids: Array.from(v.labels),
        })
        .eq("id", tid);
    }
  }

  // Hiba vagy határidő esetén a checkpoint marad: a következő futás újra megpróbálja (a meglévő üzenetek kiszűrése idempotens).
  const checkpoint = nextHistoryCheckpoint({ start: startHistoryId, latest: latestHistoryId, pending: pending + (historyIncomplete ? 1 : 0), transientErrors });
  if (checkpoint === startHistoryId && latestHistoryId !== startHistoryId) result.errors.push("Checkpoint visszatartva: feldolgozatlan vagy hibás üzenet, újrapróba a következő futásban.");
  await admin
    .from("users_profile")
    .update({ gmail_history_id: checkpoint, gmail_last_sync_at: new Date().toISOString() })
    .eq("auth_user_id", userId);
  result.history_after = checkpoint;
  return result;
}