import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Activity, Plus, X, Lock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/page-header";
import { supabase } from "@/integrations/supabase/client";
import { humanizeSupabaseError } from "@/lib/db-hooks";
import { usePermissions } from "@/hooks/use-permissions";

export const Route = createFileRoute("/_authenticated/settings/dashboard-status")({
  component: DashboardStatusPage,
});

type ConfigRow = { id: string; kind: Kind; status_value: string };
type Kind = "quote_won" | "project_active" | "project_closed";

const KIND_META: Record<Kind, { title: string; description: string; sourceTable: "quotes" | "projects" }> = {
  quote_won: {
    title: "Megnyert ajánlatok",
    description: "Mely quotes.status értékek számítanak elfogadottnak (Customer 360 won_revenue, Dashboard bevétel diagram).",
    sourceTable: "quotes",
  },
  project_active: {
    title: "Aktív projektek",
    description: "Mely projects.status értékek számítanak aktív projektnek (Customer 360 active_projects).",
    sourceTable: "projects",
  },
  project_closed: {
    title: "Lezárt projektek",
    description: "Mely projects.status értékek számítanak lezártnak (riportokban kizárandó).",
    sourceTable: "projects",
  },
};

function DashboardStatusPage() {
  const { role, isLoading: roleLoading } = usePermissions();
  const isOwner = role === "owner";
  const qc = useQueryClient();

  const config = useQuery({
    queryKey: ["dashboard_status_config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dashboard_status_config")
        .select("id,kind,status_value")
        .order("kind")
        .order("status_value");
      if (error) throw error;
      return (data ?? []) as ConfigRow[];
    },
  });

  // Forrás státuszok feltöltéséhez — distinct values
  const quoteStatuses = useQuery({
    queryKey: ["distinct_status", "quotes"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("quotes").select("status").not("status", "is", null).limit(2000);
      if (error) throw error;
      return Array.from(new Set((data ?? []).map((r: any) => r.status as string))).sort();
    },
  });

  const projectStatuses = useQuery({
    queryKey: ["distinct_status", "projects"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("status").not("status", "is", null).limit(2000);
      if (error) throw error;
      return Array.from(new Set((data ?? []).map((r: any) => r.status as string))).sort();
    },
  });

  const add = useMutation({
    mutationFn: async (v: { kind: Kind; status_value: string }) => {
      const { error } = await supabase
        .from("dashboard_status_config")
        .upsert({ kind: v.kind, status_value: v.status_value }, { onConflict: "kind,status_value" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard_status_config"] });
      toast.success("Hozzáadva");
    },
    onError: (e: any) => toast.error(humanizeSupabaseError(e)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dashboard_status_config").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard_status_config"] });
      toast.success("Eltávolítva");
    },
    onError: (e: any) => toast.error(humanizeSupabaseError(e)),
  });

  const byKind = (k: Kind) => (config.data ?? []).filter((r) => r.kind === k);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <CardTitle>Dashboard státusz konfiguráció</CardTitle>
            {!isOwner && !roleLoading && (
              <Badge variant="outline" className="ml-2 gap-1"><Lock className="h-3 w-3" /> Csak olvasás</Badge>
            )}
          </div>
          <CardDescription>
            Itt állítható be, hogy a <code>quotes.status</code> és <code>projects.status</code> mely értékei
            számítanak megnyert / aktív / lezárt állapotnak a dashboard view-kban. Owner szerepkör szerkesztheti.
          </CardDescription>
        </CardHeader>
      </Card>

      {(Object.keys(KIND_META) as Kind[]).map((k) => {
        const meta = KIND_META[k];
        const source = meta.sourceTable === "quotes" ? quoteStatuses.data ?? [] : projectStatuses.data ?? [];
        const selected = byKind(k);
        const selectedSet = new Set(selected.map((r) => r.status_value));
        const available = source.filter((s) => !selectedSet.has(s));

        return (
          <KindCard
            key={k}
            kind={k}
            title={meta.title}
            description={meta.description}
            selected={selected}
            available={available}
            isOwner={isOwner}
            isPending={add.isPending || remove.isPending}
            onAdd={(v) => add.mutate({ kind: k, status_value: v })}
            onRemove={(id) => remove.mutate(id)}
          />
        );
      })}
    </div>
  );
}

function KindCard({
  kind, title, description, selected, available, isOwner, isPending, onAdd, onRemove,
}: {
  kind: Kind;
  title: string;
  description: string;
  selected: ConfigRow[];
  available: string[];
  isOwner: boolean;
  isPending: boolean;
  onAdd: (v: string) => void;
  onRemove: (id: string) => void;
}) {
  const [custom, setCustom] = useState("");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
            Kiválasztott státuszok ({selected.length})
          </div>
          {selected.length === 0 ? (
            <EmptyState icon={Activity} title="Még nincs státusz hozzárendelve" />
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {selected.map((r) => (
                <Badge key={r.id} variant="secondary" className="gap-1.5 pr-1">
                  <span className="font-mono text-xs">{r.status_value}</span>
                  {isOwner && (
                    <button
                      onClick={() => onRemove(r.id)}
                      disabled={isPending}
                      className="rounded-sm hover:bg-destructive/20 hover:text-destructive p-0.5"
                      aria-label="Eltávolítás"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {isOwner && (
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Hozzáadás az adatbázisban előforduló értékek közül
            </div>
            {available.length === 0 ? (
              <div className="text-xs text-muted-foreground">
                Nincs új érték — minden meglévő státusz kiválasztva, vagy nincs adat a forrástáblában.
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {available.map((s) => (
                  <Button
                    key={s}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 font-mono text-xs"
                    disabled={isPending}
                    onClick={() => onAdd(s)}
                  >
                    <Plus className="h-3 w-3" />
                    {s}
                  </Button>
                ))}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="Egyéni érték (pl. ha még nem fordult elő)"
                className="h-8 text-sm"
                disabled={isPending}
              />
              <Button
                type="button"
                size="sm"
                disabled={!custom.trim() || isPending}
                onClick={() => { onAdd(custom.trim()); setCustom(""); }}
              >
                Hozzáad
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
