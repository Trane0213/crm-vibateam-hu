import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isUuid } from "@/lib/r2-policy";
import { isVerifiedSentMessage } from "@/lib/quotes/send-policy";

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
      sb.from("emails").select("id,thread_id,gmail_message_id,subject,to_emails,to_email,cc_emails,internal_date,is_outbound,from_email").eq("id", data.emailId).maybeSingle(),
    ]);
    if (!q) throw new Error("Az ajánlathoz nincs jogosultságod.");
    if (!em) throw new Error("A levélhez nincs jogosultságod.");
    if (!em.is_outbound) throw new Error("Csak kimenő (elküldött) levél kapcsolható ajánlathoz.");
    if (!em.gmail_message_id) throw new Error("A levélnek nincs igazolható Gmail-azonosítója.");
    const { getValidAccessToken } = await import("@/lib/gmail/oauth.server");
    const { getMessage, getProfile } = await import("@/lib/gmail/gmail-api.server");
    const { accessToken } = await getValidAccessToken(context.userId);
    const [message, mailbox] = await Promise.all([
      getMessage(accessToken, em.gmail_message_id, "metadata"), getProfile(accessToken),
    ]);
    if (!isVerifiedSentMessage(message, em.gmail_message_id) || em.from_email?.toLowerCase() !== mailbox.emailAddress.toLowerCase()) {
      throw new Error("Csak a saját Gmail-fiókból valóban elküldött levél rögzíthető.");
    }
    const { data: atts } = await sb.from("email_attachments").select("filename,size_bytes,r2_key").eq("email_id", em.id);
    const { getAdminClient } = await import("@/lib/gmail/admin.server");
    const admin = getAdminClient() as any;
    const sentAt = new Date(Number(message.internalDate)).toISOString();
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
    const { error: quoteError } = await admin.from("quotes").update({ status: "sent", sent_at: sentAt, ...(q.locked_at ? {} : { locked_at: new Date().toISOString() }) }).eq("id", q.id);
    if (quoteError) throw new Error("A levél igazolt, de az ajánlat állapotának mentése nem sikerült: " + quoteError.message);
    return { ok: true };
  });
