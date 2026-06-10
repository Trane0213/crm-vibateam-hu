import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/_debug-schema")({
  server: {
    handlers: {
      GET: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("information_schema.columns" as any)
          .select("column_name,data_type,is_nullable")
          .eq("table_schema", "public")
          .eq("table_name", "project_documents");
        return Response.json({ data, error });
      },
    },
  },
});