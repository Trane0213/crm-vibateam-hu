import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { humanizeSupabaseError } from "@/lib/db-hooks";
import { toast } from "sonner";
import { fmtDate } from "@/components/resource/resource-page";

export const Route = createFileRoute("/_authenticated/settings/users")({
  component: UsersPage,
});

function UsersPage() {
  const qc = useQueryClient();
  const profiles = useQuery({
    queryKey: ["users_profile", "list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users_profile")
        .select("id, auth_user_id, email, full_name, phone, role_id, active, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const roles = useQuery({
    queryKey: ["roles", "list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("roles").select("id, name");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const updateProfile = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, any> }) => {
      const { error } = await supabase.from("users_profile").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users_profile"] });
      toast.success("Mentve");
    },
    onError: (e: any) => toast.error("Mentési hiba", { description: humanizeSupabaseError(e) }),
  });

  const roleName = (id: string | null | undefined) =>
    roles.data?.find((r) => r.id === id)?.name ?? "—";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          <CardTitle>Felhasználók</CardTitle>
        </div>
        <CardDescription>
          A `users_profile` tábla rekordjai. Új felhasználó csak Auth Admin API-val
          (Service Role Key) hozható létre; itt csak a meglévő profilok módosíthatók.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {profiles.isLoading ? (
          <div className="text-sm text-muted-foreground">Betöltés…</div>
        ) : profiles.error ? (
          <div className="text-sm text-destructive">{humanizeSupabaseError(profiles.error)}</div>
        ) : (profiles.data ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground">Még nincs profil. Az új belépés automatikusan létrehoz egyet.</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 text-left">Email</th>
                  <th className="px-2 py-2 text-left">Név</th>
                  <th className="px-2 py-2 text-left">Szerepkör</th>
                  <th className="px-2 py-2 text-left">Állapot</th>
                  <th className="px-2 py-2 text-left">Létrehozva</th>
                </tr>
              </thead>
              <tbody>
                {(profiles.data ?? []).map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="px-2 py-2 font-medium">{p.email ?? "—"}</td>
                    <td className="px-2 py-2 text-muted-foreground">{p.full_name ?? "—"}</td>
                    <td className="px-2 py-2">
                      <Select
                        value={p.role_id ?? ""}
                        onValueChange={(v) =>
                          updateProfile.mutate({ id: p.id, patch: { role_id: v || null } })
                        }
                      >
                        <SelectTrigger className="h-8 w-[180px]">
                          <SelectValue placeholder={roleName(p.role_id)} />
                        </SelectTrigger>
                        <SelectContent>
                          {(roles.data ?? []).map((r) => (
                            <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 py-2">
                      {p.active !== false ? (
                        <Badge variant="outline" className="border-[color:var(--status-success)]/40 text-[color:var(--status-success)]">aktív</Badge>
                      ) : (
                        <Badge variant="outline" className="border-muted text-muted-foreground">inaktív</Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-2 h-6 text-xs"
                        onClick={() =>
                          updateProfile.mutate({ id: p.id, patch: { active: p.active === false } })
                        }
                      >
                        {p.active === false ? "Aktiválás" : "Deaktiválás"}
                      </Button>
                    </td>
                    <td className="px-2 py-2 text-xs text-muted-foreground tabular-nums">
                      {fmtDate(p.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}