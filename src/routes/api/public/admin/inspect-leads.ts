import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/admin/inspect-leads")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { getAdminClient } = await import("@/integrations/supabase/server");
          const admin = getAdminClient();
          const { data: cols, error: e1 } = await admin
            .from("information_schema.columns" as any)
            .select("column_name,data_type,is_nullable")
            .eq("table_schema", "public")
            .eq("table_name", "leads");
          const { data: sample, error: e2 } = await admin
            .from("leads")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(3);
          const { count } = await admin
            .from("leads")
            .select("*", { count: "exact", head: true });
          // Look for a separate website-intake table
          const candidates = [
            "web_leads", "website_leads", "form_submissions", "inquiries",
            "ajanlatkeresek", "ajanlatkeres", "intake", "intakes",
            "lead_submissions", "contact_forms", "contact_submissions",
            "leads_inbox", "submissions", "requests", "website_quote_requests",
            "quote_requests", "ajanlat_keresek", "weboldal_leads",
            "weboldali_ajanlatkeresek", "weboldali_ajanlatok",
            "website_form_submissions", "form_leads", "vibateam_leads",
          ];
          const found: Record<string, any> = {};
          for (const t of candidates) {
            const { data, error } = await admin.from(t).select("*").limit(2);
            if (!error) found[t] = { sample: data };
          }
          // List ALL public tables via PostgREST OpenAPI root
          const { SUPABASE_URL } = await import("@/integrations/supabase/client");
          const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.GMAIL_SUPABASE_SERVICE_KEY ?? "";
          const openApiRes = await fetch(`${SUPABASE_URL}/rest/v1/`, {
            headers: { apikey: key, Authorization: `Bearer ${key}` },
          });
          const openApi: any = await openApiRes.json();
          const allTables = openApi?.definitions ? Object.keys(openApi.definitions) : [];
          return Response.json({
            columns_error: e1?.message,
            sample,
            sample_error: e2?.message,
            total: count,
            other_tables: found,
          });
        } catch (e: any) {
          return Response.json({ error: String(e?.message ?? e) }, { status: 500 });
        }
      },
    },
  },
});