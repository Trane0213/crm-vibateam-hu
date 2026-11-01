import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/middleware";

export type QuoteRequest = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  project_type: string | null;
  message: string | null;
  attachment_url: string | null;
  created_at: string;
  form_type: string | null;
  property_type: string | null;
  budget: string | null;
  company_name: string | null;
  apartment_count: string | null;
  consent: boolean | null;
  source_lead_id?: string | null;
  source_type?: string | null;
  source_page?: string | null;
  origin_page?: string | null;
  entry_page?: string | null;
  utm?: Record<string, string> | null;
  attachment_path?: string | null;
  source_created_at?: string | null;
  synced_at?: string | null;
};

/** Ugyanaz a szerepkör-lista, mint a /web-quote-requests route-jogosultság (permissions.ts). */
export const QUOTE_REQUEST_VIEWER_ROLES = ["owner", "admin", "project_manager", "marketing", "sales"];

async function assertViewer(supabase: { rpc: (fn: string, args: object) => PromiseLike<{ data: unknown; error: unknown }> }, userId: string) {
  const { data, error } = await supabase.rpc("crm_role_of", { _auth_user: userId });
  if (error || typeof data !== "string" || !QUOTE_REQUEST_VIEWER_ROLES.includes(data)) {
    throw new Error("Nincs jogosultságod a weboldali ajánlatkérésekhez.");
  }
}

/**
 * Read-only listing of website inbound quote requests
 * (table: public.quote_requests, written by the vibateam.hu site).
 *
 * Service-role-only on the server because RLS on quote_requests is
 * scoped for the public form insert path. Admin viewing is intentionally
 * bypass-RLS — this is read-only and never writes back.
 */
export const listQuoteRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<QuoteRequest[]> => {
    await assertViewer(context.supabase as never, context.userId);
    const { getAdminClient } = await import("@/integrations/supabase/server");
    const admin = getAdminClient();
    // Lapozott beolvasás (1000-es oldalak, max 10 000 sor) — nincs csendes 500-as levágás.
    const PAGE = 1000;
    const all: QuoteRequest[] = [];
    for (let from = 0; from < 10_000; from += PAGE) {
      const { data, error } = await admin
        .from("quote_requests")
        .select(
          "id,name,phone,email,project_type,message,attachment_url,created_at,form_type,property_type,budget,company_name,apartment_count,consent,source_lead_id,source_type,source_page,origin_page,entry_page,attachment_path,source_created_at,synced_at",
        )
        .order("source_created_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      all.push(...((data ?? []) as QuoteRequest[]));
      if (!data || data.length < PAGE) break;
    }
    return all;
  });

export const getQuoteRequest = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<QuoteRequest | null> => {
    await assertViewer(context.supabase as never, context.userId);
    const { getAdminClient } = await import("@/integrations/supabase/server");
    const admin = getAdminClient();
    const { data: row, error } = await admin
      .from("quote_requests")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (row as QuoteRequest | null) ?? null;
  });