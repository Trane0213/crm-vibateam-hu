import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Shield } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { humanizeSupabaseError } from "@/lib/db-hooks";

export const Route = createFileRoute("/_authenticated/settings/roles")({
  component: RolesPage,
});

function RolesPage() {
  const q = useQuery({
    queryKey: ["roles", "with-perms"],
    queryFn: async () => {
      const [roles, perms, rp] = await Promise.all([
        supabase.from("roles").select("id, name, description"),
        supabase.from("permissions").select("id, code"),
        supabase.from("role_permissions").select("role_id, permission_id"),
      ]);
      const err = roles.error ?? perms.error ?? rp.error;
      if (err) throw err;
      return {
        roles: (roles.data ?? []) as any[],
        perms: (perms.data ?? []) as any[],
        rp: (rp.data ?? []) as any[],
      };
    },
  });

  if (q.isLoading) return <div className="text-sm text-muted-foreground">Betöltés…</div>;
  if (q.error) return <div className="text-sm text-destructive">{humanizeSupabaseError(q.error)}</div>;

  const d = q.data!;
  const permsById = new Map(d.perms.map((p) => [p.id, p.code as string]));

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2"><Shield className="h-5 w-5" /><CardTitle>Szerepkörök</CardTitle></div>
          <CardDescription>A roles + role_permissions valós tartalma. Részletes mátrix a Jogosultság-audit oldalon.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {d.roles.map((r) => {
            const codes = d.rp
              .filter((x) => x.role_id === r.id)
              .map((x) => permsById.get(x.permission_id))
              .filter(Boolean) as string[];
            return (
              <div key={r.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{r.name}</div>
                    {r.description && <div className="text-xs text-muted-foreground">{r.description}</div>}
                  </div>
                  <Badge variant="outline" className="tabular-nums">{codes.length} permission</Badge>
                </div>
                {codes.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {codes.map((c) => (
                      <Badge key={c} variant="secondary" className="font-mono text-[10px]">{c}</Badge>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}