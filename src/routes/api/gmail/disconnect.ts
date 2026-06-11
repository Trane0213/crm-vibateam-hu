import { createFileRoute } from "@tanstack/react-router";
import { getAuthedUserId } from "@/lib/gmail/auth.server";
import { getAdminClient } from "@/lib/gmail/admin.server";

export const Route = createFileRoute("/api/gmail/disconnect")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const userId = await getAuthedUserId(request);
          const admin = getAdminClient();
          await admin.from("gmail_accounts").delete().eq("user_id", userId);
          return Response.json({ ok: true });
        } catch (e: any) {
          if (e instanceof Response) return e;
          return Response.json({ error: e?.message ?? String(e) }, { status: 500 });
        }
      },
    },
  },
});
