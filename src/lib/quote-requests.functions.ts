import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
};

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
  .handler(async (): Promise<QuoteRequest[]> => {
    const { getAdminClient } = await import("@/integrations/supabase/server");
    const admin = getAdminClient();
    const { data, error } = await admin
      .from("quote_requests")
      .select(
        "id,name,phone,email,project_type,message,attachment_url,created_at,form_type,property_type,budget,company_name,apartment_count,consent",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []) as QuoteRequest[];
  });

export const getQuoteRequest = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }): Promise<QuoteRequest | null> => {
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