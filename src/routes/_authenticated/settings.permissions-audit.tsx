import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, AlertTriangle, ShieldCheck, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { humanizeSupabaseError } from "@/lib/db-hooks";

export const Route = createFileRoute("/_authenticated/settings/permissions-audit")({
  component: PermissionsAuditPage,
});

function PermissionsAuditPage() {
  const data = useQuery({
    queryKey: ["permissions-audit"],
    queryFn: async () => {
      const [roles, perms, rolePerms, profiles] = await Promise.all([
        supabase.from("roles").select("id, name, description"),
        supabase.from("permissions").select("id, code, description"),
        supabase.from("role_permissions").select("role_id, permission_id"),
        supabase.from("users_profile").select("id, auth_user_id, email, full_name, role_id, active"),
      ]);
      return {
        roles: (roles.data ?? []) as any[],
        perms: (perms.data ?? []) as any[],
        rolePerms: (rolePerms.data ?? []) as any[],
        profiles: (profiles.data ?? []) as any[],
        errors: [roles.error, perms.error, rolePerms.error, profiles.error].filter(Boolean) as any[],
      };
    },
  });

  if (data.isLoading) return <div className="text-sm text-muted-foreground">Audit betöltése…</div>;

  const d = data.data!;
  const permByRole = new Map<string, Set<string>>();
  for (const r of d.roles) permByRole.set(r.id, new Set());
  for (const rp of d.rolePerms) permByRole.get(rp.role_id)?.add(rp.permission_id);

  const orphans = d.perms.filter((p) => !d.rolePerms.some((rp) => rp.permission_id === p.id));
  const allPermRoles = d.roles.filter(
    (r) => permByRole.get(r.id)?.size === d.perms.length && d.perms.length > 0,
  );
  const usersByRole = new Map<string, number>();
  for (const p of d.profiles) {
    if (!p.role_id) continue;
    usersByRole.set(p.role_id, (usersByRole.get(p.role_id) ?? 0) + 1);
  }
  const profilesWithoutRole = d.profiles.filter((p) => !p.role_id);
  const inactiveProfiles = d.profiles.filter((p) => p.active === false);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            <CardTitle>Jogosultság-audit</CardTitle>
          </div>
          <CardDescription>
            Csak riport — nem módosít szerepkört, permissiont vagy policy-t. Frissítéshez tölts újra.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-4">
          <Stat icon={Users} label="Szerepkörök" value={d.roles.length} />
          <Stat icon={KeyRound} label="Permissionok" value={d.perms.length} />
          <Stat icon={ShieldCheck} label="Profilok" value={d.profiles.length} />
          <Stat
            icon={AlertTriangle}
            label="Figyelmeztetések"
            value={orphans.length + profilesWithoutRole.length + allPermRoles.length}
            tone={orphans.length + profilesWithoutRole.length > 0 ? "warning" : "ok"}
          />
        </CardContent>
        {d.errors.length > 0 && (
          <CardContent className="space-y-1 text-xs text-destructive">
            {d.errors.map((e, i) => (
              <div key={i}>{humanizeSupabaseError(e)}</div>
            ))}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Szerepkörök és felhasználói számok</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-2 py-1 text-left">Szerepkör</th>
                <th className="px-2 py-1 text-left">Leírás</th>
                <th className="px-2 py-1 text-right">Felhasználók</th>
                <th className="px-2 py-1 text-right">Permissionok</th>
              </tr>
            </thead>
            <tbody>
              {d.roles.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-2 py-1 font-medium">{r.name}</td>
                  <td className="px-2 py-1 text-muted-foreground">{r.description ?? "—"}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{usersByRole.get(r.id) ?? 0}</td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    {permByRole.get(r.id)?.size ?? 0}
                    {permByRole.get(r.id)?.size === d.perms.length && d.perms.length > 0 && (
                      <Badge variant="outline" className="ml-2 text-[10px]">teljes</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Permission mátrix</CardTitle>
          <CardDescription>{d.perms.length} permission × {d.roles.length} szerepkör</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="px-2 py-1 text-left">Permission</th>
                  {d.roles.map((r) => (
                    <th key={r.id} className="px-2 py-1 text-center">{r.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.perms.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="px-2 py-1 font-mono">{p.code}</td>
                    {d.roles.map((r) => (
                      <td key={r.id} className="px-2 py-1 text-center">
                        {permByRole.get(r.id)?.has(p.id) ? "✓" : <span className="text-muted-foreground/40">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hiányosságok</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Section
            title="Árva permissionok (egy szerepkörhöz sincs rendelve)"
            empty="Minden permission használatban van."
            items={orphans.map((p) => p.code)}
          />
          <Section
            title="Profilok szerepkör nélkül"
            empty="Minden profilnak van szerepköre."
            items={profilesWithoutRole.map((p) => p.email ?? p.full_name ?? p.id)}
          />
          <Section
            title="Inaktív profilok"
            empty="Minden profil aktív."
            items={inactiveProfiles.map((p) => p.email ?? p.full_name ?? p.id)}
          />
          <Section
            title="Szerepkörök, amelyeknek minden permission megvan"
            empty="—"
            items={allPermRoles.map((r) => r.name)}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone = "ok" }: { icon: any; label: string; value: number; tone?: "ok" | "warning" }) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-2">
      <Icon className={`h-4 w-4 ${tone === "warning" ? "text-[color:var(--status-warning)]" : "text-muted-foreground"}`} />
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="ml-auto text-base font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Section({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</div>
      {items.length === 0 ? (
        <div className="mt-1 text-xs text-muted-foreground">{empty}</div>
      ) : (
        <div className="mt-1 flex flex-wrap gap-1">
          {items.map((s, i) => (
            <Badge key={i} variant="outline" className="font-mono text-[10px]">{s}</Badge>
          ))}
        </div>
      )}
    </div>
  );
}