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
            .from("users_profile")
            .select("gmail_email,gmail_last_sync_at,gmail_scope,gmail_expires_at")
            .eq("auth_user_id", userId)
            .maybeSingle();
          const connected = !!data?.gmail_email && !!data?.gmail_scope;
          return Response.json({
            connected,
            account: connected
              ? {
                  email: data!.gmail_email,
                  last_sync_at: data!.gmail_last_sync_at,
                  scope: data!.gmail_scope,
                  expires_at: data!.gmail_expires_at,
                }
              : null,
          });
        } catch (e: any) {
          if (e instanceof Response) return e;
          return Response.json({ error: e?.message ?? String(e) }, { status: 500 });
        }
      },
    },
  },
});
