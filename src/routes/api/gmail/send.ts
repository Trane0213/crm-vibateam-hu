import { createFileRoute } from "@tanstack/react-router";
import { getAuthedUserId } from "@/lib/gmail/auth.server";
import { getValidAccessToken } from "@/lib/gmail/oauth.server";
import { buildRawMimeMessage, sendMessage, parseAddressList } from "@/lib/gmail/gmail-api.server";
import { getAdminClient } from "@/lib/gmail/admin.server";
import { presignR2Url } from "@/lib/r2.server";
import { readMarketingMeta, withMarketingStatus } from "@/lib/marketing-status";

export const Route = createFileRoute("/api/gmail/send")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const userId = await getAuthedUserId(request);
          const body = (await request.json()) as {
            to: string; subject: string;
            html?: string; body?: string;
            cc?: string; bcc?: string;
            threadId?: string; inReplyTo?: string; references?: string;
            project_id?: string; company_id?: string; contact_id?: string; lead_id?: string;
            attachments?: { key: string; filename: string; mime_type: string; size_bytes: number }[];
          };
          if (!body?.to || !body?.subject) {
            return Response.json({ error: "to es subject kotelezo" }, { status: 400 });
          }
          const { accessToken, email } = await getValidAccessToken(userId);

          // Csatolmányok letöltése R2-ből presigned GET-tel és base64 buffer-ré alakítása.
          const attBuffers: { filename: string; mimeType: string; content: Buffer }[] = [];
          for (const a of body.attachments ?? []) {
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
          const sent = await sendMessage(accessToken, raw, body.threadId);
          const admin = getAdminClient();
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
            if (meta.status === "new") {
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
          return Response.json({ ok: true, id: sent.id, threadId: sent.threadId });
        } catch (e: any) {
          if (e instanceof Response) return e;
          console.error("[gmail/send] error", e);
          return Response.json({ error: e?.message ?? String(e) }, { status: 500 });
        }
      },
    },
  },
});
