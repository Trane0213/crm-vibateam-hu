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
          return Response.json({
            columns: cols,
            columns_error: e1?.message,
            sample,
            sample_error: e2?.message,
            total: count,
          });
        } catch (e: any) {
          return Response.json({ error: String(e?.message ?? e) }, { status: 500 });
        }
      },
    },
  },
});