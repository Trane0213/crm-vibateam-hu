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
          await admin.from("emails").insert({
            gmail_message_id: sent.id,
            gmail_thread_id: sent.threadId,
            thread_id: sent.threadId,
            gmail_label_ids: sent.labelIds ?? [],
            direction: "out",
            subject: body.subject,
            summary: body.body?.slice(0, 200) ?? null,
            body: body.body ?? null,
            from_email: email,
            to_email: body.to,
            sent_at: new Date().toISOString(),
            owner_user_id: userId,
            project_id: body.project_id ?? null,
            contact_id: body.contact_id ?? null,
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
