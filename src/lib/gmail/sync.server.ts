/**
 * Gmail -> meglevo `emails` tabla szinkron. Csak az emails tablat irja
 * (gmail_message_id alapjan idempotens upsert).
 */
import { getAdminClient } from "@/lib/gmail/admin.server";
import {
  listMessages,
  getMessage,
  headerOf,
  extractBody,
  listAttachmentParts,
  getAttachment,
  parseAddressList,
} from "@/lib/gmail/gmail-api.server";
import { getValidAccessToken } from "@/lib/gmail/oauth.server";

export type SyncResult = {
  fetched: number;
  inserted: number;
  skipped: number;
  attachments: number;
  errors: string[];
  pages: number;
  done: boolean;
};

function parseAddr(raw: string): string | null {
  if (!raw) return null;
  const m = raw.match(/<([^>]+)>/);
  return (m ? m[1] : raw).trim() || null;
}

function safeFilename(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 180) || "file";
}

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20 MB / fájl

export async function syncInbox(
  userId: string,
  opts: { max?: number; backfill?: boolean; query?: string } = {},
): Promise<SyncResult> {
  const { accessToken, email } = await getValidAccessToken(userId);
  const admin = getAdminClient();
  const result: SyncResult = {
    fetched: 0,
    inserted: 0,
    skipped: 0,
    attachments: 0,
    errors: [],
    pages: 0,
    done: true,
  };

  const myMailbox = (email ?? "").toLowerCase();

  // CRM kapcsoló adatok — kontaktok / cégek / leadek email alapján.
  // Egyszer betöltjük a teljes run elején (kis méretű).
  const [contactsRes, companiesRes, leadsRes] = await Promise.all([
    admin.from("contacts").select("id,email").not("email", "is", null),
    admin.from("companies").select("id,domain").not("domain", "is", null),
    admin.from("leads").select("id,email").not("email", "is", null),
  ]);
  const contactByEmail = new Map<string, string>();
  for (const c of (contactsRes.data ?? []) as any[]) {
    const e = String(c.email ?? "").toLowerCase().trim();
    if (e) contactByEmail.set(e, c.id);
  }
  const companyByDomain = new Map<string, string>();
  for (const c of (companiesRes.data ?? []) as any[]) {
    const d = String(c.domain ?? "").toLowerCase().trim().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
    if (d) companyByDomain.set(d, c.id);
  }
  const leadByEmail = new Map<string, string>();
  for (const l of (leadsRes.data ?? []) as any[]) {
    const e = String(l.email ?? "").toLowerCase().trim();
    if (e) leadByEmail.set(e, l.id);
  }
  function matchCrm(addresses: string[]): { contact_id: string | null; company_id: string | null; lead_id: string | null } {
    let contact_id: string | null = null;
    let company_id: string | null = null;
    let lead_id: string | null = null;
    for (const a of addresses) {
      const addr = a.toLowerCase();
      if (!contact_id && contactByEmail.has(addr)) contact_id = contactByEmail.get(addr)!;
      if (!lead_id && leadByEmail.has(addr)) lead_id = leadByEmail.get(addr)!;
      if (!company_id) {
        const dom = addr.split("@")[1];
        if (dom && companyByDomain.has(dom)) company_id = companyByDomain.get(dom)!;
      }
      if (contact_id && company_id && lead_id) break;
    }
    return { contact_id, company_id, lead_id };
  }

  const targetMax = opts.backfill ? Math.min(opts.max ?? 5000, 10000) : Math.min(opts.max ?? 25, 100);
  // Per-page batch: Gmail max 500/req, mi 100-zal megyünk a stabilitás miatt.
  const perPage = opts.backfill ? 100 : Math.min(targetMax, 100);

  // gmail_thread_id -> email_threads.id (uuid) cache a futás során
  const threadCache = new Map<string, string>();
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
      .select("id")
      .eq("gmail_thread_id", gmailThreadId)
      .maybeSingle();
    if (found?.id) { threadCache.set(gmailThreadId, found.id); return found.id; }
    const { data: inserted, error: insErr } = await admin
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
    if (insErr || !inserted) throw new Error(`email_threads insert: ${insErr?.message ?? "unknown"}`);
    threadCache.set(gmailThreadId, inserted.id);
    // Hozzáférés rögzítése a user mailbox-ához
    await admin.from("email_thread_access").upsert(
      { thread_id: inserted.id, user_id: userId, mailbox_email: myMailbox },
      { onConflict: "thread_id,user_id" },
    );
    return inserted.id;
  }

  // Cloudflare Worker / gateway timeout miatt egy run max ~45 mp lehet backfillnél.
  const deadline = Date.now() + (opts.backfill ? 45 * 1000 : 25 * 1000);

  // R2 modul lazy import (csak server).
  const { presignR2Url } = await import("@/lib/r2.server");

  async function saveAttachments(emailDbId: string, gmailMessageId: string, m: any) {
    const parts = listAttachmentParts(m);
    if (!parts.length) return;
    // melyik attachmentId-k vannak már mentve?
    const ids = parts.map((p) => p.attachmentId);
    const { data: existing } = await admin
      .from("email_attachments")
      .select("gmail_attachment_id")
      .eq("email_id", emailDbId)
      .in("gmail_attachment_id", ids);
    const have = new Set((existing ?? []).map((r: any) => r.gmail_attachment_id));
    for (const att of parts) {
      if (have.has(att.attachmentId)) continue;
      if (att.size && att.size > MAX_ATTACHMENT_BYTES) {
        result.errors.push(`${gmailMessageId}: ${att.filename} túl nagy (${att.size}B), kihagyva`);
        continue;
      }
      try {
        const a = await getAttachment(accessToken, gmailMessageId, att.attachmentId);
        const buf = Buffer.from(a.data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
        const key = `gmail-attachments/${userId}/${gmailMessageId}/${safeFilename(att.filename)}`;
        const url = presignR2Url({ method: "PUT", key, contentType: att.mimeType, expiresIn: 300 });
        const put = await fetch(url, { method: "PUT", body: buf, headers: { "content-type": att.mimeType } });
        if (!put.ok) throw new Error(`R2 upload ${put.status}`);
        const { error: insErr } = await admin.from("email_attachments").insert({
          email_id: emailDbId,
          gmail_attachment_id: att.attachmentId,
          filename: att.filename,
          mime_type: att.mimeType,
          size_bytes: buf.length,
          r2_key: key,
          inline: att.inline,
          content_id: att.contentId,
        });
        if (insErr) throw insErr;
        result.attachments++;
      } catch (e: any) {
        result.errors.push(`${gmailMessageId} att(${att.filename}): ${e?.message ?? String(e)}`);
      }
    }
  }

  let pageToken: string | undefined = undefined;
  while (result.fetched < targetMax) {
    if (Date.now() > deadline) { result.done = false; break; }
    const remaining = targetMax - result.fetched;
    const list = await listMessages(accessToken, {
      maxResults: Math.min(perPage, remaining),
      pageToken,
      q: opts.query,
    });
    result.pages++;
    const items = list.messages ?? [];
    if (!items.length) { break; }

    const ids = items.map((i) => i.id);
    const { data: existing } = await admin
      .from("emails")
      .select("id,gmail_message_id")
      .in("gmail_message_id", ids);
    const haveMap = new Map<string, string>(
      (existing ?? []).map((r: any) => [r.gmail_message_id as string, r.id as string]),
    );

    for (const it of items) {
      result.fetched++;
      if (Date.now() > deadline) { result.done = false; break; }
      const knownId = haveMap.get(it.id);
      if (knownId) {
        // meglevo email — csak az esetleg hianyzo csatolmanyokat probaljuk leszedni
        try {
          const m = await getMessage(accessToken, it.id, "full");
          await saveAttachments(knownId, it.id, m);
          // szál hozzáférés biztosítása a futó user-re (idempotens)
          if (m.threadId) {
            const { data: tr } = await admin
              .from("email_threads")
              .select("id")
              .eq("gmail_thread_id", m.threadId)
              .maybeSingle();
            if (tr?.id) {
              await admin.from("email_thread_access").upsert(
                { thread_id: tr.id, user_id: userId, mailbox_email: myMailbox },
                { onConflict: "thread_id,user_id" },
              );
            }
          }
        } catch {}
        result.skipped++;
        continue;
      }
      try {
        const m = await getMessage(accessToken, it.id, "full");
        const from = headerOf(m, "From");
        const toRaw = headerOf(m, "To");
        const ccRaw = headerOf(m, "Cc");
        const bccRaw = headerOf(m, "Bcc");
        const subjectHdr = headerOf(m, "Subject");
        const subject = subjectHdr && subjectHdr.trim().length > 0 ? subjectHdr : null;
        const body = extractBody(m);
        const toList = parseAddressList(toRaw);
        const ccList = parseAddressList(ccRaw);
        const bccList = parseAddressList(bccRaw);
        const fromAddr = parseAddr(from);
        const allAddrs = [
          ...(fromAddr ? [fromAddr.toLowerCase()] : []),
          ...toList, ...ccList, ...bccList,
        ].filter((a) => a && a.toLowerCase() !== myMailbox);
        const crm = matchCrm(allAddrs);
        const threadDbId = await ensureThread(m.threadId, subject, crm);
        const labels = (m.labelIds ?? []) as string[];
        const isOutbound =
          labels.includes("SENT") ||
          (fromAddr ? fromAddr.toLowerCase() === myMailbox : false);
        const internalDate = m.internalDate
          ? new Date(Number(m.internalDate)).toISOString()
          : null;
        const row = {
          gmail_message_id: m.id,
          thread_id: threadDbId,
          from_email: fromAddr,
          to_email: toList[0] ?? parseAddr(toRaw),
          to_emails: toList,
          cc_emails: ccList,
          bcc_emails: bccList,
          subject,
          body: body || null,
          summary: m.snippet ?? null,
          snippet: m.snippet ?? null,
          internal_date: internalDate,
          gmail_label_ids: labels,
          is_outbound: isOutbound,
          owner_user_id: userId,
          contact_id: crm.contact_id,
          company_id: crm.company_id,
          lead_id: crm.lead_id,
        };
        const { data: inserted, error } = await admin
          .from("emails")
          .insert(row)
          .select("id")
          .single();
        if (error || !inserted) {
          if (String(error?.message ?? "").toLowerCase().includes("duplicate")) result.skipped++;
          else {
            console.error("[gmail/sync] emails insert error", { id: it.id, error });
            result.errors.push(`${it.id}: ${error?.message ?? "unknown"}`);
          }
        } else {
          result.inserted++;
          await saveAttachments(inserted.id, it.id, m);
        }
      } catch (e: any) {
        console.error("[gmail/sync] message error", { id: it.id, error: e?.message ?? e });
        result.errors.push(`${it.id}: ${e?.message ?? String(e)}`);
      }
    }

    if (!list.nextPageToken) break;
    pageToken = list.nextPageToken;
  }

  if (result.fetched >= targetMax && pageToken) result.done = false;

  // Szál szintű aggregátumok frissítése (last_message_at, participants, label union)
  // a futás során érintett szálakra.
  if (threadCache.size > 0) {
    const ids = Array.from(threadCache.values());
    const { data: agg } = await admin
      .from("emails")
      .select("thread_id,internal_date,created_at,from_email,to_emails,gmail_label_ids")
      .in("thread_id", ids);
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

  await admin
    .from("users_profile")
    .update({ gmail_last_sync_at: new Date().toISOString() })
    .eq("auth_user_id", userId);
  void email;
  return result;
}
