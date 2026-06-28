import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { Bot, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/use-permissions";
import { AGENT_REGISTRY } from "@/lib/ai-os/visible-agents";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings/agent-visibility")({
  component: AgentVisibilityPage,
});

type RoleRow = { id: string; name: string; description: string | null };
type AccessRow = { agent_id: string; role_id: string; can_view: boolean };

function AgentVisibilityPage() {
  const { role } = usePermissions();
  const isOwner = role === "owner";
  const qc = useQueryClient();

  const rolesQ = useQuery({
    queryKey: ["roles", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roles")
        .select("id, name, description")
        .order("name");
      if (error) throw error;
      return (data ?? []) as RoleRow[];
    },
  });

  const accessQ = useQuery({
    queryKey: ["agent_role_access", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_role_access")
        .select("agent_id, role_id, can_view");
      if (error) throw error;
      return (data ?? []) as AccessRow[];
    },
  });

  const accessMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const r of accessQ.data ?? []) m.set(`${r.agent_id}:${r.role_id}`, r.can_view);
    return m;
  }, [accessQ.data]);

  const setAccess = useMutation({
    mutationFn: async (vars: { agent_id: string; role_id: string; can_view: boolean }) => {
      if (vars.can_view) {
        const { error } = await supabase
          .from("agent_role_access")
          .upsert(
            { agent_id: vars.agent_id, role_id: vars.role_id, can_view: true, updated_at: new Date().toISOString() },
            { onConflict: "agent_id,role_id" },
          );
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("agent_role_access")
          .delete()
          .eq("agent_id", vars.agent_id)
          .eq("role_id", vars.role_id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent_role_access"] });
    },
    onError: (e: any) => toast.error("Mentés sikertelen: " + (e?.message ?? e)),
  });

  if (!isOwner) {
    return (
      <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
        <Lock className="mt-0.5 h-4 w-4 text-muted-foreground" />
        <div>
          <div className="font-medium">Csak Tulajdonos szerkesztheti</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Az AI agent láthatósági mátrixhoz „owner" szerepkör szükséges.
          </p>
        </div>
      </div>
    );
  }

  const roles = rolesQ.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Bot className="h-5 w-5" /> AI agent láthatóság
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Állítsd be, mely szerepkörök számára jelenjen meg az adott AI asszisztens az oldalsávban.
          George (CRM Navigátor) a frontendben mindig látható minden szerepkör számára — ez a sor csak
          tájékoztató jellegű.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Agent</th>
              {roles.map((r) => (
                <th key={r.id} className="px-3 py-2 text-center font-medium whitespace-nowrap">
                  {r.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {AGENT_REGISTRY.map((a) => {
              const locked = !!a.alwaysVisible;
              return (
                <tr key={a.id} className="border-t">
                  <td className="px-3 py-2">
                    <div className="font-medium">{a.name} <span className="text-muted-foreground font-normal">– {a.short}</span></div>
                    <div className="text-xs text-muted-foreground">{a.description}</div>
                    {locked && (
                      <div className="mt-1 inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        <Lock className="h-3 w-3" /> mindig látható
                      </div>
                    )}
                  </td>
                  {roles.map((r) => {
                    const checked = locked ? true : (accessMap.get(`${a.id}:${r.id}`) ?? false);
                    return (
                      <td key={r.id} className="px-3 py-2 text-center">
                        <Checkbox
                          checked={checked}
                          disabled={locked || setAccess.isPending}
                          onCheckedChange={(v) =>
                            setAccess.mutate({
                              agent_id: a.id,
                              role_id: r.id,
                              can_view: v === true,
                            })
                          }
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Mentés azonnali — minden pipa változás külön upsert / delete a{" "}
        <code className="text-[10px]">agent_role_access</code> táblába.
      </p>
    </div>
  );
}