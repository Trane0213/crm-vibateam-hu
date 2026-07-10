import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lock, Search, Network } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/use-permissions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { kgGetNode, kgStats } from "@/lib/knowledge-graph/kg.functions";

export const Route = createFileRoute("/_authenticated/settings/knowledge-graph")({
  component: KnowledgeGraphSettingsPage,
});

type NodeRow = {
  id: string;
  kind: string;
  ref_table: string | null;
  ref_id: string | null;
  ref_uri: string | null;
  label: string | null;
  updated_at: string;
};

type EdgeRow = {
  id: string;
  from_node_id: string;
  to_node_id: string;
  relation: string;
  direction: string;
  source: string;
  weight: number | null;
  confidence: number | null;
  created_at: string;
};

function KnowledgeGraphSettingsPage() {
  const { role } = usePermissions();

  if (role !== "owner") {
    return (
      <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
        <Lock className="mt-0.5 h-4 w-4 text-muted-foreground" />
        <div>
          <div className="font-medium">Csak Tulajdonos szerkesztheti</div>
          <p className="mt-1 text-sm text-muted-foreground">
            A Knowledge Graph "Publisher health" nézet kizárólag „owner" szerepkörrel érhető el.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Knowledge Graph — Publisher health</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A KG-1 csontváz olvasónézete: node/edge eloszlás, publisher-futások, node keresés és
          1-hop szomszéd nézet. A publisherek (Website, CRM, Ads, …) a saját sprintjeikben
          kötnek be — addig a legtöbb szekció üres.
        </p>
      </div>

      <StatsSection />
      <NodeExplorer />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1–3) kg_stats: kind eloszlás + reláció eloszlás + publisher-lista
// ---------------------------------------------------------------------------
function StatsSection() {
  const fetchStats = useServerFn(kgStats);
  const q = useQuery({
    queryKey: ["kg_stats"],
    queryFn: () => fetchStats(),
  });

  if (q.isLoading) {
    return <div className="text-sm text-muted-foreground">Statisztika betöltése…</div>;
  }
  if (q.error) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-destructive">
          Hiba a KG statisztika lekérésekor: {(q.error as Error).message}
        </CardContent>
      </Card>
    );
  }
  const s = q.data;
  if (!s) return null;

  const kinds = Object.entries(s.nodes_by_kind).sort((a, b) => b[1] - a[1]);
  const rels = Object.entries(s.edges_by_relation).sort((a, b) => b[1] - a[1]);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Node kind eloszlás</CardTitle>
          <CardDescription>Összes node: {s.nodes_total}</CardDescription>
        </CardHeader>
        <CardContent>
          {kinds.length === 0 ? (
            <EmptyState label="Nincs még node a gráfban." />
          ) : (
            <CountList items={kinds} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reláció eloszlás</CardTitle>
          <CardDescription>Összes edge: {s.edges_total}</CardDescription>
        </CardHeader>
        <CardContent>
          {rels.length === 0 ? (
            <EmptyState label="Nincs még edge a gráfban." />
          ) : (
            <CountList items={rels} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Publisher-futások</CardTitle>
          <CardDescription>Utolsó 50 futás időrendben</CardDescription>
        </CardHeader>
        <CardContent>
          {s.publishers.length === 0 ? (
            <EmptyState label="Még egyetlen publisher sem futott. Az első a Website modul (WK-4) lesz." />
          ) : (
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {s.publishers.map((p, i) => (
                <div
                  key={i}
                  className="flex flex-col gap-0.5 rounded-md border px-2 py-1.5 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono">
                      {p.module}/{p.source_kind}
                    </span>
                    <PublisherStatusBadge status={p.status} />
                  </div>
                  <div className="text-muted-foreground">
                    {new Date(p.last_run_at).toLocaleString("hu-HU")} · nodes {p.nodes_upserted} ·
                    edges +{p.edges_upserted}/-{p.edges_removed}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CountList({ items }: { items: Array<[string, number]> }) {
  return (
    <div className="max-h-72 space-y-0.5 overflow-y-auto text-sm">
      {items.map(([k, v]) => (
        <div
          key={k}
          className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-muted/50"
        >
          <span className="font-mono text-xs">{k}</span>
          <Badge variant="secondary">{v}</Badge>
        </div>
      ))}
    </div>
  );
}

function PublisherStatusBadge({ status }: { status: string }) {
  const variant =
    status === "ok" ? "secondary" : status === "partial" ? "outline" : "destructive";
  return (
    <Badge variant={variant as never} className="uppercase">
      {status}
    </Badge>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">{label}</div>;
}

// ---------------------------------------------------------------------------
// 4–5) Node keresés (kind + label) + 1-hop szomszéd nézet
// ---------------------------------------------------------------------------
function NodeExplorer() {
  const [kind, setKind] = useState<string>("__any__");
  const [labelLike, setLabelLike] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // node kind katalógus
  const kindsQ = useQuery({
    queryKey: ["kg_node_kinds"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kg_node_kinds")
        .select("kind,label,owner_module")
        .order("owner_module", { ascending: true })
        .order("kind", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as Array<{ kind: string; label: string; owner_module: string }>;
    },
  });

  // node keresés (kliens-oldali SELECT, RLS authenticated)
  const searchQ = useQuery({
    queryKey: ["kg_nodes_search", kind, labelLike],
    queryFn: async () => {
      let q = supabase
        .from("kg_nodes")
        .select("id,kind,ref_table,ref_id,ref_uri,label,updated_at")
        .order("updated_at", { ascending: false })
        .limit(50);
      if (kind !== "__any__") q = q.eq("kind", kind);
      const term = labelLike.trim();
      if (term.length >= 2) q = q.ilike("label", `%${term}%`);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as NodeRow[];
    },
  });

  const kindOptions = useMemo(() => kindsQ.data ?? [], [kindsQ.data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Network className="h-4 w-4" /> Node keresés és szomszédok
        </CardTitle>
        <CardDescription>
          Szűrj kind-ra és/vagy label-töredékre (min. 2 karakter). Egy node kiválasztásával
          megjelenik az 1-hop szomszédság (out/in edges).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <div className="w-full md:w-64">
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger>
                <SelectValue placeholder="Kind szűrő" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="__any__">Bármely kind</SelectItem>
                {kindOptions.map((k) => (
                  <SelectItem key={k.kind} value={k.kind}>
                    <span className="font-mono text-xs">{k.kind}</span>
                    <span className="ml-2 text-xs text-muted-foreground">({k.owner_module})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={labelLike}
              onChange={(e) => setLabelLike(e.target.value)}
              placeholder="Label töredék (min. 2 karakter)"
              className="pl-8"
            />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <NodeResultsList
            query={searchQ}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId(id)}
          />
          <NeighborsPanel nodeId={selectedId} />
        </div>
      </CardContent>
    </Card>
  );
}

function NodeResultsList({
  query,
  selectedId,
  onSelect,
}: {
  query: ReturnType<typeof useQuery<NodeRow[], Error>>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (query.isLoading) {
    return <div className="text-sm text-muted-foreground">Keresés…</div>;
  }
  if (query.error) {
    return <div className="text-sm text-destructive">Hiba: {(query.error as Error).message}</div>;
  }
  const rows = query.data ?? [];
  if (rows.length === 0) {
    return <EmptyState label="Nincs találat a jelenlegi szűrőre." />;
  }
  return (
    <div className="max-h-96 space-y-1 overflow-y-auto rounded-md border">
      {rows.map((n) => {
        const active = selectedId === n.id;
        return (
          <button
            key={n.id}
            type="button"
            onClick={() => onSelect(n.id)}
            className={`w-full border-b px-3 py-2 text-left text-xs last:border-b-0 hover:bg-muted/50 ${
              active ? "bg-muted" : ""
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono">{n.kind}</span>
              <span className="text-[10px] text-muted-foreground">
                {new Date(n.updated_at).toLocaleString("hu-HU")}
              </span>
            </div>
            <div className="mt-0.5 truncate">
              {n.label || <span className="text-muted-foreground">(nincs label)</span>}
            </div>
            {(n.ref_table || n.ref_uri) && (
              <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                {n.ref_table ? `${n.ref_table}#${n.ref_id ?? ""}` : n.ref_uri}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

function NeighborsPanel({ nodeId }: { nodeId: string | null }) {
  const fetchNode = useServerFn(kgGetNode);
  const q = useQuery({
    queryKey: ["kg_get_node", nodeId],
    enabled: !!nodeId,
    queryFn: () => fetchNode({ data: { node_id: nodeId!, neighbor_limit: 100 } }),
  });

  if (!nodeId) {
    return <EmptyState label="Válassz egy node-ot a listából a szomszédság megjelenítéséhez." />;
  }
  if (q.isLoading) return <div className="text-sm text-muted-foreground">Szomszédok betöltése…</div>;
  if (q.error) {
    return <div className="text-sm text-destructive">Hiba: {(q.error as Error).message}</div>;
  }
  const d = q.data;
  if (!d || !d.node) return <EmptyState label="A node nem található." />;

  const node = d.node as NodeRow & { metadata?: Record<string, unknown> };
  const outEdges = (d.out_edges ?? []) as EdgeRow[];
  const inEdges = (d.in_edges ?? []) as EdgeRow[];

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div>
        <div className="text-xs uppercase text-muted-foreground">Kiválasztott node</div>
        <div className="mt-1 font-mono text-xs">{node.kind}</div>
        <div className="text-sm font-medium">{node.label || "(nincs label)"}</div>
        {(node.ref_table || node.ref_uri) && (
          <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
            {node.ref_table ? `${node.ref_table}#${node.ref_id ?? ""}` : node.ref_uri}
          </div>
        )}
      </div>

      <EdgeList title={`Kimenő élek (${outEdges.length})`} edges={outEdges} direction="out" />
      <EdgeList title={`Bejövő élek (${inEdges.length})`} edges={inEdges} direction="in" />

      <Button
        variant="ghost"
        size="sm"
        className="w-full"
        onClick={() => q.refetch()}
      >
        Frissítés
      </Button>
    </div>
  );
}

function EdgeList({
  title,
  edges,
  direction,
}: {
  title: string;
  edges: EdgeRow[];
  direction: "out" | "in";
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium">{title}</div>
      {edges.length === 0 ? (
        <EmptyState label="Nincs él." />
      ) : (
        <div className="max-h-48 space-y-0.5 overflow-y-auto">
          {edges.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-2 rounded px-2 py-1 text-xs hover:bg-muted/50">
              <div className="flex items-center gap-2 truncate">
                <Badge variant="outline" className="font-mono text-[10px]">
                  {e.relation}
                </Badge>
                <span className="truncate font-mono text-[10px] text-muted-foreground">
                  {direction === "out" ? `→ ${e.to_node_id.slice(0, 8)}` : `← ${e.from_node_id.slice(0, 8)}`}
                </span>
              </div>
              <span className="text-[10px] text-muted-foreground">{e.source}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}