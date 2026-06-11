import { createFileRoute } from "@tanstack/react-router";
import { getAuthedUserId } from "@/lib/gmail/auth.server";
import { syncInbox } from "@/lib/gmail/sync.server";

export const Route = createFileRoute("/api/gmail/sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const userId = await getAuthedUserId(request);
          let max: number | undefined;
          let backfill = false;
          let query: string | undefined;
          try {
            const b = (await request.json()) as any;
            if (b?.max) max = Number(b.max);
            if (b?.backfill) backfill = Boolean(b.backfill);
            if (b?.query) query = String(b.query);
          } catch {}
          const result = await syncInbox(userId, { max, backfill, query });
          return Response.json(result);
        } catch (e: any) {
          if (e instanceof Response) return e;
          return Response.json({ error: e?.message ?? String(e) }, { status: 500 });
        }
      },
    },
  },
});
