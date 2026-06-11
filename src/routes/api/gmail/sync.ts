import { createFileRoute } from "@tanstack/react-router";
import { getAuthedUserId } from "@/lib/gmail/auth.server";
import { syncInbox } from "@/lib/gmail/sync.server";

export const Route = createFileRoute("/api/gmail/sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const userId = await getAuthedUserId(request);
          let max = 25;
          try { const b = (await request.json()) as any; if (b?.max) max = Number(b.max); } catch {}
          const result = await syncInbox(userId, { max });
          return Response.json(result);
        } catch (e: any) {
          if (e instanceof Response) return e;
          return Response.json({ error: e?.message ?? String(e) }, { status: 500 });
        }
      },
    },
  },
});
