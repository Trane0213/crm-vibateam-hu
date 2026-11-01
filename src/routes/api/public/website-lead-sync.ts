/**
 * POST /api/public/website-lead-sync
 * Weboldal backend (send-quote-email edge function) → CRM quote_requests.
 * Hitelesítés: HMAC (VIBA_WEB_CRM_SYNC_SECRET), lásd src/lib/website-lead-sync.ts
 * Idempotens: source_lead_id egyedi; ismételt küldés → "duplicate", nincs írás.
 * Üzleti CRM lead NEM keletkezik.
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  ERROR_STATUS,
  MAX_BODY_BYTES,
  parseWebsiteLead,
  toQuoteRequestRow,
  verifyRequestAuth,
  type SyncErrorCode,
} from "@/lib/website-lead-sync";

function fail(code: SyncErrorCode, details?: string[]) {
  return Response.json({ status: "error", code, ...(details ? { details } : {}) }, { status: ERROR_STATUS[code] });
}

export const Route = createFileRoute("/api/public/website-lead-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["VIBA_WEB_CRM_SYNC_SECRET"];
        if (!secret || secret.length < 32) return fail("server_misconfigured");

        const len = Number(request.headers.get("content-length") ?? "0");
        if (len > MAX_BODY_BYTES) return fail("payload_too_large");
        const rawBody = await request.text();
        if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) return fail("payload_too_large");

        const authErr = await verifyRequestAuth({
          secret,
          timestamp: request.headers.get("x-viba-timestamp"),
          signature: request.headers.get("x-viba-signature"),
          rawBody,
          nowSeconds: Math.floor(Date.now() / 1000),
        });
        if (authErr) {
          console.warn("[website-lead-sync] rejected", authErr);
          return fail(authErr);
        }

        const parsed = parseWebsiteLead(rawBody);
        if (!parsed.ok) {
          console.warn("[website-lead-sync] invalid", parsed.code);
          return fail(parsed.code, parsed.details);
        }
        const d = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const existing = await supabaseAdmin
          .from("quote_requests")
          .select("id")
          .eq("source_lead_id", d.lead_id)
          .maybeSingle();
        if (existing.error) {
          console.error("[website-lead-sync] lookup failed", existing.error.code);
          return fail("storage_error");
        }
        if (existing.data) {
          return Response.json({ status: "duplicate", source_lead_id: d.lead_id, crm_id: existing.data.id });
        }

        const ins = await supabaseAdmin
          .from("quote_requests")
          .insert(toQuoteRequestRow(d, new Date().toISOString()) as never)
          .select("id")
          .single();
        if (ins.error) {
          if (ins.error.code === "23505") {
            const again = await supabaseAdmin
              .from("quote_requests")
              .select("id")
              .eq("source_lead_id", d.lead_id)
              .maybeSingle();
            if (again.data) {
              return Response.json({ status: "duplicate", source_lead_id: d.lead_id, crm_id: again.data.id });
            }
          }
          console.error("[website-lead-sync] insert failed", ins.error.code);
          return fail("storage_error");
        }
        console.info("[website-lead-sync] accepted", d.source_type);
        return Response.json(
          { status: "accepted", source_lead_id: d.lead_id, crm_id: ins.data.id },
          { status: 201 },
        );
      },
    },
  },
});
