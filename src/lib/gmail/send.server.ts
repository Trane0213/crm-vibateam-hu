import { getAuthedUserId } from "@/lib/gmail/auth.server";
import { getUserClient } from "@/integrations/supabase/server";
import { isOwnOutboundKey } from "@/lib/r2-policy";
import { assertSenderIdentity } from "@/lib/gmail/mailbox-model";
import { getValidAccessToken } from "@/lib/gmail/oauth.server";
import { buildRawMimeMessage, sendMessage, parseAddressList, getProfile } from "@/lib/gmail/gmail-api.server";
import { getAdminClient } from "@/lib/gmail/admin.server";
import { presignR2Url } from "@/lib/r2.server";
import { readMarketingMeta, withMarketingStatus } from "@/lib/marketing-status";
import { checkOutboundSize, checkQuoteDocs, isIdempotencyKey, checkReferencedAttachment } from "@/lib/quotes/send-policy";
import {validateCrmLink} from './validate-crm-link';
import {resolveThreadLink} from './crm-association';
import {isMarketingCompany} from '@/lib/marketing-universe';


export type SendHooks = {
  trustedAttachments?: Map<string, { filename: string; mimeType: string; content: Buffer }>;
  beforeSend: (attachments: { filename: string; mimeType: string; content: Buffer }[]) => Promise<void>;
  verifySent: (accessToken: string, sent: { id: string; threadId: string }) => Promise<void>;
};
/** Shared authenticated transport. Hooks are server-only, never parsed from request JSON. */
export async function handleGmailSend(request: Request, hooks?: SendHooks): Promise<Response> {
  let sentEvidence: { id: string; threadId: string } | undefined;
  try {
    const userId = await getAuthedUserId(request);
    const body = (await request.json()) as {
      to: string; subject: string;
      html?: string; body?: string;
      cc?: string; bcc?: string;
      threadId?: string; inReplyTo?: string; references?: string;
      expectedMailbox?: string;
      project_id?: string; company_id?: string; contact_id?: string; lead_id?: string;
      attachments?: { key: string; filename: string; mime_type: string; size_bytes: number }[];
      quote_id?: string; quote_document_ids?: string[]; idempotency_key?: string;
    };
    if (!body?.to || !body?.subject) {
      return Response.json({ error: "to es subject kotelezo" }, { status: 400 });
    }
    if (body.quote_id) {
      const attachmentError = checkReferencedAttachment(`${body.body ?? ""}\n${body.html ?? ""}`, (body.quote_document_ids ?? []).length + (body.attachments ?? []).length);
      if (attachmentError) return Response.json({ error: attachmentError }, { status: 400 });
    }
    const admin = getAdminClient();
    const { data: senderProfile, error: senderError } = await admin.from("users_profile")
      .select("gmail_email,active,gmail_auth_error").eq("auth_user_id", userId).maybeSingle();
    if (senderError) throw new Error(senderError.message);
    if (!senderProfile?.active || !senderProfile.gmail_email || senderProfile.gmail_auth_error) {
      return Response.json({ error: "Nincs aktív, használható saját Gmail-fiók." }, { status: 403 });
    }
    if (body.expectedMailbox && body.expectedMailbox.toLowerCase() !== senderProfile.gmail_email.toLowerCase()) {
      return Response.json({ error: "Más munkatárs postafiókjából nem küldhetsz." }, { status: 403 });
    }
    if (body.threadId) {
      const { data: replyThread, error: replyError } = await admin.from("email_threads").select("id")
        .eq("gmail_thread_id", body.threadId).maybeSingle();
      if (replyError) throw new Error(replyError.message);
      if (!replyThread) return Response.json({ error: "A válasz szála nem található." }, { status: 403 });
      const { data: access, error: accessError } = await admin.from("email_thread_access").select("mailbox_email")
        .eq("thread_id", replyThread.id).eq("user_id", userId).maybeSingle();
      if (accessError) throw new Error(accessError.message);
      if (access?.mailbox_email?.toLowerCase() !== senderProfile.gmail_email.toLowerCase()) {
        return Response.json({ error: "Ehhez a szálhoz nincs saját postafiók-hozzárendelésed." }, { status: 403 });
      }
    }
    const bearer = (request.headers.get("authorization") ?? "").slice(7);
    const caller = getUserClient(bearer);
    try {
      let link=await validateCrmLink(caller,body);
      if(body.threadId){
        const previous=await caller.from('email_threads').select('company_id,contact_id,lead_id').eq('gmail_thread_id',body.threadId).maybeSingle();
        if(previous.error||!previous.data)throw new Error('A válasz szála nem olvasható.');
        const resolved=resolveThreadLink(previous.data,link);
        if(resolved.conflict)throw new Error('A válasz eltérő céghez vagy ügyhöz lenne kapcsolva; ellenőrizd a szálat.');
        link=await validateCrmLink(caller,resolved.link);
      }
      body.company_id=link.company_id??undefined;body.contact_id=link.contact_id??undefined;body.lead_id=link.lead_id??undefined;
    } catch(error) {return Response.json({error:error instanceof Error?error.message:'Hibás CRM-kapcsolat.'},{status:409});}
    for (const [table, id] of [["companies", body.company_id], ["contacts", body.contact_id], ["leads", body.lead_id], ["projects", body.project_id]] as const) {
      if (!id) continue;
      const { data: linked, error: linkedError } = await caller.from(table).select("id").eq("id", id).maybeSingle();
      if (linkedError || !linked) return Response.json({ error: "A kapcsolódó CRM-adathoz nincs jogosultságod." }, { status: 403 });
    }
    const { accessToken, email } = await getValidAccessToken(userId);
    const actual = await getProfile(accessToken);
    try { assertSenderIdentity(body.expectedMailbox, email, actual.emailAddress); }
    catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Hibás küldőazonosság" }, { status: 403 }); }

    // S4: ajánlat-kiküldés — jogosultság (RLS), saját dokumentumok, méret, egyszeri küldés.
    let quoteSendId: string | null = null;
    let quoteDocs: { id: string; quote_id: string; name: string; file_url: string; mime_type: string | null; size_bytes: number | null; document_type: string }[] = [];
    if (body.quote_id) {
      if (!isIdempotencyKey(body.idempotency_key)) return Response.json({ error: "Hiányzó küldési azonosító." }, { status: 400 });
      const { data: qrow } = await caller.from("quotes").select("id").eq("id", body.quote_id).maybeSingle();
      if (!qrow) return Response.json({ error: "Az ajánlathoz nincs jogosultságod." }, { status: 403 });
      const ids = (body.quote_document_ids ?? []).filter((x) => typeof x === "string");
      if (ids.length) {
        const { data: docs, error: dErr } = await caller.from("quote_documents" as any)
          .select("id,quote_id,name,file_url,mime_type,size_bytes,document_type").in("id", ids);
        if (dErr) throw new Error(dErr.message);
        quoteDocs = (docs ?? []) as any;
        const docErr = checkQuoteDocs(ids, quoteDocs, body.quote_id);
        if (docErr) return Response.json({ error: docErr }, { status: 403 });
      }
      const sizeErr = checkOutboundSize([...quoteDocs.map((d) => d.size_bytes), ...(body.attachments ?? []).map((a) => a.size_bytes)]);
      if (sizeErr) return Response.json({ error: sizeErr }, { status: 413 });
      const attachmentError = checkReferencedAttachment(`${body.body ?? ""}\n${body.html ?? ""}`, quoteDocs.length + (body.attachments ?? []).length);
      if (attachmentError) return Response.json({ error: attachmentError }, { status: 400 });
      const { data: qs, error: qsErr } = await (admin as any).from("quote_sends").insert({
        quote_id: body.quote_id, mode: "crm", status: "sending", idempotency_key: body.idempotency_key,
        to_emails: parseAddressList(body.to), cc_emails: parseAddressList(body.cc ?? ""), subject: body.subject,
        attachments: [
          ...quoteDocs.map((d) => ({ source: "quote_document", document_id: d.id, name: d.name, key: d.file_url, size_bytes: d.size_bytes, document_type: d.document_type })),
          ...(body.attachments ?? []).map((a) => ({ source: "upload", name: a.filename, key: a.key, size_bytes: a.size_bytes })),
        ],
        created_by: userId,
      }).select("id").single();
      if (qsErr) {
        const { data: prev } = await (admin as any).from("quote_sends").select("status").eq("idempotency_key", body.idempotency_key).maybeSingle();
        if (prev?.status === "sent") return Response.json({ ok: true, duplicate: true });
        return Response.json({ error: "Ez a küldés már folyamatban van vagy sikertelen volt — nyisd meg újra a küldést." }, { status: 409 });
      }
      quoteSendId = qs.id;
    }

    // Csatolmányok letöltése R2-ből presigned GET-tel és base64 buffer-ré alakítása.
    const attBuffers: { filename: string; mimeType: string; content: Buffer }[] = [];
    // 1/C: csak a küldő saját, szerver által kiosztott kimenő mellékletkulcsa csatolható.
    for (const a of body.attachments ?? []) {
      if (!hooks?.trustedAttachments?.has(a?.key) && !isOwnOutboundKey(a?.key, userId)) {
        return Response.json({ error: "A csatolmány nem a saját feltöltésed." }, { status: 403 });
      }
    }
    for (const a of body.attachments ?? []) {
      const trusted = hooks?.trustedAttachments?.get(a.key);
      if (trusted) { attBuffers.push(trusted); continue; }
      const url = presignR2Url({ method: "GET", key: a.key, expiresIn: 300 });
      const r = await fetch(url);
      if (!r.ok) throw new Error(`R2 letöltés sikertelen (${r.status}) – ${a.filename}`);
      const ab = await r.arrayBuffer();
      attBuffers.push({
        filename: a.filename,
        mimeType: a.mime_type || "application/octet-stream",
        content: Buffer.from(ab),
      });
    }

    for (const d of quoteDocs) {
      const r = await fetch(presignR2Url({ method: "GET", key: d.file_url, expiresIn: 300 }));
      if (!r.ok) {
        if (quoteSendId) await (admin as any).from("quote_sends").update({ status: "failed", error: `Melléklet nem tölthető: ${d.name}` }).eq("id", quoteSendId);
        throw new Error(`R2 letöltés sikertelen (${r.status}) – ${d.name}`);
      }
      attBuffers.push({ filename: d.name, mimeType: d.mime_type || "application/octet-stream", content: Buffer.from(await r.arrayBuffer()) });
    }

    const htmlBody = body.html && body.html.trim().length > 0
      ? body.html
      : (body.body ?? "").replace(/\n/g, "<br/>");

    const raw = buildRawMimeMessage({
      from: email,
      to: body.to, cc: body.cc, bcc: body.bcc,
      subject: body.subject,
      html: htmlBody,
      attachments: attBuffers,
      inReplyTo: body.inReplyTo, references: body.references,
    });
    let sent: Awaited<ReturnType<typeof sendMessage>>;
    try {
      await hooks?.beforeSend(attBuffers);
      sent = await sendMessage(accessToken, raw, body.threadId);
      sentEvidence = sent;
      await hooks?.verifySent(accessToken, sent);
    }
    catch (sendErr: any) {
      if (quoteSendId && !sentEvidence) await (admin as any).from("quote_sends").update({ status: "failed", error: String(sendErr?.message ?? sendErr).slice(0, 500) }).eq("id", quoteSendId);
      throw sendErr;
    }
    const toList = parseAddressList(body.to);
    const ccList = parseAddressList(body.cc ?? "");
    const bccList = parseAddressList(body.bcc ?? "");
    // email_threads upsert gmail_thread_id alapján
    let threadDbId: string;
    const { data: foundThread } = await admin
      .from("email_threads")
      .select("id")
      .eq("gmail_thread_id", sent.threadId)
      .maybeSingle();
    if (foundThread?.id) {
      threadDbId = foundThread.id;
    } else {
      const { data: ins, error: insErr } = await admin
        .from("email_threads")
        .insert({
          gmail_thread_id: sent.threadId,
          subject: body.subject && body.subject.trim().length > 0 ? body.subject : "(nincs tárgy)",
          project_id: body.project_id ?? null,
          company_id: body.company_id ?? null,
          contact_id: body.contact_id ?? null,
          lead_id: body.lead_id ?? null,
          owner_user_id: userId,
        })
        .select("id")
        .single();
      if (insErr || !ins) throw new Error(`email_threads insert: ${insErr?.message ?? "unknown"}`);
      threadDbId = ins.id;
    }
    // hozzáférés a saját szálhoz
    await admin.from("email_thread_access").upsert(
      { thread_id: threadDbId, user_id: userId, mailbox_email: (email ?? "").toLowerCase() },
      { onConflict: "thread_id,user_id" },
    );
    const { data: insEmail } = await admin.from("emails").insert({
      gmail_message_id: sent.id,
      thread_id: threadDbId,
      from_email: email,
      to_email: toList[0] ?? body.to,
      to_emails: toList,
      cc_emails: ccList,
      bcc_emails: bccList,
      subject: body.subject,
      body: htmlBody,
      summary: (body.body ?? htmlBody.replace(/<[^>]+>/g, " ")).slice(0, 200),
      snippet: (body.body ?? htmlBody.replace(/<[^>]+>/g, " ")).slice(0, 200),
      internal_date: new Date().toISOString(),
      is_outbound: true,
      gmail_label_ids: ["SENT"],
      owner_user_id: userId,
      contact_id: body.contact_id ?? null,
      company_id: body.company_id ?? null,
      lead_id: body.lead_id ?? null,
      project_id: body.project_id ?? null,
    }).select("id").single();
    await admin
      .from("email_threads")
      .update({
        company_id: body.company_id ?? undefined,
        contact_id: body.contact_id ?? undefined,
        lead_id: body.lead_id ?? undefined,
        last_message_at: new Date().toISOString(),
      })
      .eq("id", threadDbId);

    if (body.company_id) {
      const { data: company } = await admin
        .from("companies")
        .select("notes")
        .eq("id", body.company_id)
        .maybeSingle();
      const currentNotes = (company as any)?.notes ?? null;
      const meta = readMarketingMeta(currentNotes);
      if (isMarketingCompany({notes:currentNotes}) && meta.status === "new") {
        const nextNotes = withMarketingStatus(currentNotes, "contacted");
        await admin.from("companies").update({ notes: nextNotes }).eq("id", body.company_id);
      }
    }

    // csatolmányok metaadat mentése (a fájlok már R2-ben vannak az outbound-attachments/ prefix alatt)
    if (insEmail?.id && (body.attachments?.length ?? 0) > 0) {
      const rows = (body.attachments ?? []).map((a) => ({
        email_id: insEmail.id,
        filename: a.filename,
        mime_type: a.mime_type,
        size_bytes: a.size_bytes,
        r2_key: a.key,
        inline: false,
      }));
      await admin.from("email_attachments").insert(rows);
    }
    if (quoteSendId) {
      const now = new Date().toISOString();
      if (insEmail?.id && quoteDocs.length) {
        await admin.from("email_attachments").insert(quoteDocs.map((d) => ({
          email_id: insEmail.id, filename: d.name, mime_type: d.mime_type, size_bytes: d.size_bytes, r2_key: d.file_url, inline: false,
        })));
      }
      const { error: sendLogError } = await (admin as any).from("quote_sends").update({
        status: "sent", sent_at: now, email_id: insEmail?.id ?? null, gmail_message_id: sent.id, thread_id: threadDbId,
      }).eq("id", quoteSendId);
      if (sendLogError) return Response.json({ ok: true, warning: "A levél kiment, de a kiküldési napló mentése nem sikerült. Ne küldd újra; a kiküldött Gmail-levél hozzárendelésével ellenőrizhető.", id: sent.id, threadId: sent.threadId });
      const { data: qcur } = await (admin as any).from("quotes").select("locked_at").eq("id", body.quote_id).maybeSingle();
      const { error: quoteError } = await (admin as any).from("quotes").update({ status: "sent", sent_at: now, ...(qcur?.locked_at ? {} : { locked_at: now }) }).eq("id", body.quote_id);
      if (quoteError) return Response.json({ ok: true, warning: "A levél kiment és a napló rögzült, de az ajánlat állapotának mentése nem sikerült. Ne küldd újra; ellenőrizd a kiküldési naplót.", id: sent.id, threadId: sent.threadId });
    }
    return Response.json({ ok: true, id: sent.id, threadId: sent.threadId });
  } catch (e: any) {
    if (hooks && sentEvidence) return Response.json({ok:true,...sentEvidence,warning:'A levél Gmail-azonosítója megvan, de a teljes eredmény nem igazolt. Ne küldd újra.'});
    if (e instanceof Response) return e;
    console.error("[gmail/send] error", e);
    return Response.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
