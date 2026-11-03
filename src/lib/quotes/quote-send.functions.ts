import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isUuid } from "@/lib/r2-policy";

/**
 * S4: Gmailből már kiküldött ajánlatlevél utólagos hozzákapcsolása.
 * A hívónak az ajánlatot ÉS a levelet is látnia kell (RLS); az írás szerveroldali.
 */
export const quoteLinkSentEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { quoteId: string; emailId: string }) => {
    if (!i || !isUuid(i.quoteId) || !isUuid(i.emailId)) throw new Error("Érvénytelen kérés");
    return i;
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const [{ data: q }, { data: em }] = await Promise.all([
      sb.from("quotes").select("id,locked_at").eq("id", data.quoteId).maybeSingle(),
      sb.from("emails").select("id,thread_id,gmail_message_id,subject,to_emails,to_email,cc_emails,internal_date,is_outbound").eq("id", data.emailId).maybeSingle(),
    ]);
    if (!q) throw new Error("Az ajánlathoz nincs jogosultságod.");
    if (!em) throw new Error("A levélhez nincs jogosultságod.");
    if (!em.is_outbound) throw new Error("Csak kimenő (elküldött) levél kapcsolható ajánlathoz.");
    const { data: atts } = await sb.from("email_attachments").select("filename,size_bytes,r2_key").eq("email_id", em.id);
    const { getAdminClient } = await import("@/lib/gmail/admin.server");
    const admin = getAdminClient() as any;
    const sentAt = em.internal_date ?? new Date().toISOString();
    const { error } = await admin.from("quote_sends").insert({
      quote_id: q.id, mode: "gmail_link", status: "recorded",
      to_emails: em.to_emails?.length ? em.to_emails : em.to_email ? [em.to_email] : [],
      cc_emails: em.cc_emails ?? [], subject: em.subject,
      attachments: (atts ?? []).map((a: any) => ({ source: "gmail", name: a.filename, size_bytes: a.size_bytes, key: a.r2_key })),
      email_id: em.id, gmail_message_id: em.gmail_message_id, thread_id: em.thread_id,
      sent_at: sentAt, created_by: context.userId,
    });
    if (error) {
      if (String(error.code) === "23505") throw new Error("Ez a levél már hozzá van kapcsolva ehhez az ajánlathoz.");
      throw new Error(error.message);
    }
    await admin.from("quotes").update({ status: "sent", sent_at: sentAt, ...(q.locked_at ? {} : { locked_at: new Date().toISOString() }) }).eq("id", q.id);
    return { ok: true };
  });
