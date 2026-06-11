import { createFileRoute } from "@tanstack/react-router";
import { getAuthedUserId } from "@/lib/gmail/auth.server";
import { getAdminClient } from "@/lib/gmail/admin.server";

export const Route = createFileRoute("/api/gmail/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const userId = await getAuthedUserId(request);
          const admin = getAdminClient();
          const { data } = await admin
            .from("gmail_accounts")
            .select("email,last_sync_at,scope,expires_at,created_at")
            .eq("user_id", userId)
            .maybeSingle();
          return Response.json({ connected: !!data, account: data ?? null });
        } catch (e: any) {
          if (e instanceof Response) return e;
          return Response.json({ error: e?.message ?? String(e) }, { status: 500 });
        }
      },
    },
  },
});
