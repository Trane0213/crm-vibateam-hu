import { createFileRoute } from "@tanstack/react-router";
import { getAuthedUserId } from "@/lib/gmail/auth.server";

export const Route = createFileRoute("/api/gmail/refresh-body")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const userId = await getAuthedUserId(request);
          const body = (await request.json().catch(() => ({}))) as { emailId?: string };
          const emailId = String(body?.emailId ?? "");
          if (!emailId) return Response.json({ error: "emailId hianyzik" }, { status: 400 });

          const { getAdminClient } = await import("@/lib/gmail/admin.server");
          const admin = getAdminClient();

          // jogosultság ellenőrzés: a user férhet-e a szálhoz
          const { data: row, error } = await admin
            .from("emails")
            .select("id,gmail_message_id,owner_user_id,thread_id,body")
            .eq("id", emailId)
            .maybeSingle();
          if (error || !row) return Response.json({ error: "Nem található" }, { status: 404 });

          const { data: acc } = await admin
            .from("email_thread_access")
            .select("thread_id")
            .eq("thread_id", row.thread_id)
            .eq("user_id", userId)
            .maybeSingle();
          if (!acc) return Response.json({ error: "Nincs jogosultság" }, { status: 403 });

          if (!row.gmail_message_id) {
            return Response.json({ body: row.body ?? "", isHtml: false, updated: false, fallback: true });
          }

          try {
            const { getValidAccessToken } = await import("@/lib/gmail/oauth.server");
            const { accessToken } = await getValidAccessToken(row.owner_user_id ?? userId);
            const { getMessage, extractBestBodyAsync } = await import("@/lib/gmail/gmail-api.server");
            const m = await getMessage(accessToken, row.gmail_message_id, "full");
            const { body: fresh, isHtml } = await extractBestBodyAsync(m, accessToken);
            if (fresh && fresh !== row.body) {
              await admin.from("emails").update({ body: fresh }).eq("id", emailId);
            }
            return Response.json({ body: fresh, isHtml, updated: fresh !== row.body });
          } catch (inner: any) {
            console.error("[refresh-body] gmail fetch failed", {
              emailId,
              owner: row.owner_user_id,
              gmail_message_id: row.gmail_message_id,
              message: inner?.message ?? String(inner),
            });
            return Response.json(
              { body: row.body ?? "", isHtml: false, updated: false, fallback: true, error: inner?.message ?? String(inner) },
              { status: 200 },
            );
          }
        } catch (e: any) {
          if (e instanceof Response) return e;
          console.error("[refresh-body] handler error", e?.message ?? String(e));
          return Response.json(
            { body: "", isHtml: false, updated: false, fallback: true, error: e?.message ?? String(e) },
            { status: 200 },
          );
        }
      },
    },
  },
});