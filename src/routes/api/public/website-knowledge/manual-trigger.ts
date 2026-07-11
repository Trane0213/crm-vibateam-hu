/**
 * Manuális WK crawl trigger — Owner / rendszer célra.
 *
 * POST /api/public/website-knowledge/manual-trigger
 * Header: X-Trigger-Secret: <WK_MANUAL_TRIGGER_SECRET>
 *
 * Ez a végpont WK-4 demo/verify célt szolgál (és a WK-5 UI trigger backend
 * alapja). Nem cseréli le a Netlify webhookot.
 */

import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

/** Timing-safe string összehasonlítás. Különböző hosszúságokra is fix idejű. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  // A timingSafeEqual csak azonos hosszú buffereken fut. Padoljuk mindkettőt
  // a hosszabbra, hogy a hossz-különbség se legyen oldalcsatorna.
  const len = Math.max(ab.length, bb.length);
  const ap = Buffer.alloc(len);
  const bp = Buffer.alloc(len);
  ab.copy(ap);
  bb.copy(bp);
  const eq = timingSafeEqual(ap, bp);
  return eq && ab.length === bb.length;
}

export const Route = createFileRoute(
  "/api/public/website-knowledge/manual-trigger",
)({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.WK_MANUAL_TRIGGER_SECRET;
        if (!secret) {
          return Response.json(
            { ok: false, error: "WK_MANUAL_TRIGGER_SECRET not configured" },
            { status: 500 },
          );
        }
        const provided = request.headers.get("x-trigger-secret") ?? "";
        if (!safeEqual(provided, secret)) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }
        const { startCrawlRun, runCrawl } = await import(
          "@/lib/website-knowledge/crawler.server"
        );
        const { run_id } = await startCrawlRun({ trigger: "manual_full" });
        const result = await runCrawl(run_id);
        return Response.json({ ok: true, run_id, ...result });
      },
    },
  },
});