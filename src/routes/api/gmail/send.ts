import { createFileRoute } from "@tanstack/react-router";
import { getAuthedUserId } from "@/lib/gmail/auth.server";
import { getValidAccessToken } from "@/lib/gmail/oauth.server";
import { buildRawEmail, sendMessage } from "@/lib/gmail/gmail-api.server";
import { getAdminClient } from "@/lib/gmail/admin.server";

export const Route = createFileRoute("/api/gmail/send")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const userId = await getAuthedUserId(request);
          const body = (await request.json()) as {
            to: string; subject: string; body: string; cc?: string; bcc?: string;
            threadId?: string; inReplyTo?: string; references?: string;
            project_id?: string; contact_id?: string;
          };
          if (!body?.to || !body?.subject) {
            return Response.json({ error: "to es subject kotelezo" }, { status: 400 });
          }
          const { accessToken, email } = await getValidAccessToken(userId);
          const raw = buildRawEmail({
            from: email,
            to: body.to, cc: body.cc, bcc: body.bcc,
            subject: body.subject, body: body.body ?? "",
            inReplyTo: body.inReplyTo, references: body.references,
          });
          const sent = await sendMessage(accessToken, raw, body.threadId);
          const admin = getAdminClient();
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
                subject: body.subject,
                project_id: body.project_id ?? null,
              })
              .select("id")
              .single();
            if (insErr || !ins) throw new Error(`email_threads insert: ${insErr?.message ?? "unknown"}`);
            threadDbId = ins.id;
          }
          await admin.from("emails").insert({
            gmail_message_id: sent.id,
            thread_id: threadDbId,
            from_email: email,
            to_email: body.to,
            body: body.body ?? null,
            summary: body.body?.slice(0, 200) ?? null,
          });
          return Response.json({ ok: true, id: sent.id, threadId: sent.threadId });
        } catch (e: any) {
          if (e instanceof Response) return e;
          return Response.json({ error: e?.message ?? String(e) }, { status: 500 });
        }
      },
    },
  },
});
