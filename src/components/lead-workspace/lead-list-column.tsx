import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useList } from "@/lib/db-hooks";
import { supabase } from "@/integrations/supabase/client";
import { computeLeadUrgency, urgencyOrder, LeadUrgencyDot, type FollowupLite } from "./lead-urgency-dot";
import { relativeTime } from "@/components/marketing-ui";

/** DB értékek érintetlenek; a `label` mező csak UI-felirat.
 *  Marketing UI a `marketingLabel`-t használja (ha definiált), különben a `label`-t. */
const STATUS_OPTIONS = [
  { value: "", label: "Minden státusz" },
  { value: "new",       label: "Új",                              marketingLabel: "Új" },
  { value: "contacted", label: "Felvettük",                       marketingLabel: "Kapcsolatfelvétel alatt" },
  { value: "qualified", label: "Minősített",                      marketingLabel: "Átadható" },
  { value: "converted", label: "Konvertált",                      marketingLabel: "Átadva értékesítőnek" },
  { value: "lost",      label: "Elveszett",                       marketingLabel: "Nem érdekes" },
];

const STATUS_TONE: Record<string, string> = {
  new: "bg-[color:var(--status-info)]/15 text-[color:var(--status-info)] border-[color:var(--status-info)]/30",
  contacted: "bg-primary/10 text-primary border-primary/30",
  qualified: "bg-[color:var(--status-warning)]/15 text-[color:var(--status-warning)] border-[color:var(--status-warning)]/30",
  converted: "bg-[color:var(--status-success)]/15 text-[color:var(--status-success)] border-[color:var(--status-success)]/30",
  lost: "bg-destructive/10 text-destructive border-destructive/30",
};

export function LeadListColumn({
  selectedId, onSelect, mode = "sales",
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
  mode?: "marketing" | "sales";
}) {
  const { data, isLoading } = useList<any>("leads", { order: "created_at", ascending: false });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  // Marketing-only: gyors tab szűrő az Aktív / Átadható / Átadott / Nem érdekes felett.
  const [marketingTab, setMarketingTab] = useState<"active" | "qualified" | "lost">("active");

  const allSources = useMemo(() => {
    const set = new Set<string>();
    for (const l of data ?? []) if (l.source) set.add(l.source);
    return Array.from(set).sort();
  }, [data]);

  // Egyszeri followups lekérdezés a látható leadek company_id-i alapján,
  // a sürgősség-pötty in-memory kiszámításához.
  const companyIds = useMemo(() => {
    const set = new Set<string>();
    for (const l of data ?? []) if (l.company_id) set.add(l.company_id);
    return Array.from(set);
  }, [data]);

  const followups = useQuery({
    queryKey: ["lead-workspace", "followups-by-company", companyIds.sort().join(",")],
    enabled: companyIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("followups")
        .select("company_id, due_date, completed")
        .in("company_id", companyIds)
        .eq("completed", false);
      if (error) throw error;
      const map = new Map<string, FollowupLite[]>();
      for (const r of (rows ?? []) as FollowupLite[]) {
        if (!r.company_id) continue;
        const arr = map.get(r.company_id) ?? [];
        arr.push(r);
        map.set(r.company_id, arr);
      }
      return map;
    },
  });

  const labelFor = (value: string) => {
    const o = STATUS_OPTIONS.find((x) => x.value === value);
    if (!o) return value;
    return mode === "marketing" ? (o.marketingLabel ?? o.label) : o.label;
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (data ?? []).filter((l: any) => {
      if (mode === "marketing") {
        // Marketing tabok: Aktív=new/contacted, Átadható=qualified, Nem érdekes=lost.
        // A `converted` státusz a marketingnek nem jelenik meg (értékesítő hatáskör).
        if (marketingTab === "active" && !(l.status === "new" || l.status === "contacted")) return false;
        if (marketingTab === "qualified" && l.status !== "qualified") return false;
        if (marketingTab === "lost" && l.status !== "lost") return false;
        if (marketingTab !== "qualified" && l.status === "converted") return false;
      }
      if (status && l.status !== status) return false;
      if (source && l.source !== source) return false;
      if (!q) return true;
      const hay = `${l.summary ?? ""} ${l.source ?? ""} ${l.project_type ?? ""} ${l.email ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
    if (mode === "marketing") {
      // Marketingnek sürgősség szerint: piros → sárga → kék → szürke, majd created_at desc.
      const map = followups.data;
      return [...list].sort((a, b) => {
        const oa = urgencyOrder(computeLeadUrgency(a, map));
        const ob = urgencyOrder(computeLeadUrgency(b, map));
        if (oa !== ob) return oa - ob;
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tb - ta;
      });
    }
    return list;
  }, [data, search, status, source, mode, marketingTab, followups.data]);

  // Mini-összegző a tab szám alá: hány lejárt / mai van a látható listából.
  const summary = useMemo(() => {
    if (mode !== "marketing") return null;
    let overdue = 0, today = 0, fresh = 0;
    for (const l of filtered) {
      const u = computeLeadUrgency(l, followups.data);
      if (u === "red") overdue++;
      else if (u === "amber") today++;
      else if (u === "blue") fresh++;
    }
    return { overdue, today, fresh };
  }, [filtered, followups.data, mode]);

  // Auto-select first lead: belépés után rögtön mutassuk a legfrissebb érdeklődőt.
  useEffect(() => {
    if (!selectedId && filtered.length > 0) {
      onSelect(filtered[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered.length, selectedId]);

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b p-3">
        {mode === "marketing" && (
          <div className="flex gap-1 rounded-md border bg-muted/30 p-0.5 text-[11px]">
            {([
              { key: "active",    label: "Aktív" },
              { key: "qualified", label: "Átadható" },
              { key: "lost",      label: "Nem érdekes" },
            ] as const).map((t) => {
              const active = marketingTab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setMarketingTab(t.key)}
                  className={`flex-1 rounded px-2 py-1 font-medium transition-colors ${
                    active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        )}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Keresés…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-sm"
          />
        </div>
        <div className="flex gap-1.5">
          {mode !== "marketing" && (
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="flex-1 h-8 rounded-md border bg-background px-2 text-xs"
            >
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="flex-1 h-8 rounded-md border bg-background px-2 text-xs"
          >
            <option value="">Minden forrás</option>
            {allSources.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{filtered.length} érdeklődő</span>
          {summary && (summary.overdue + summary.today + summary.fresh > 0) && (
            <span className="flex items-center gap-2">
              {summary.overdue > 0 && <span className="text-destructive">{summary.overdue} lejárt</span>}
              {summary.today > 0   && <span className="text-[color:var(--status-warning)]">{summary.today} mai</span>}
              {summary.fresh > 0   && <span className="text-[color:var(--status-info)]">{summary.fresh} új</span>}
            </span>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">Betöltés…</div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">Nincs találat.</div>
        ) : (
          <ul className="divide-y">
            {filtered.map((l: any) => {
              const active = l.id === selectedId;
              const urgency = mode === "marketing"
                ? computeLeadUrgency(l, followups.data)
                : "muted";
              return (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(l.id)}
                    className={`w-full text-left px-3 py-2.5 transition-colors hover:bg-muted/50 ${active ? "bg-primary/10" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {mode === "marketing" && <LeadUrgencyDot level={urgency} />}
                          <div className="truncate text-sm font-medium">
                            {l.summary ?? `#${String(l.id).slice(0, 6)}`}
                          </div>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
                          <span className="truncate">
                            {l.source ?? "—"}{l.project_type ? ` · ${l.project_type}` : ""}
                          </span>
                          <span className="opacity-60">·</span>
                          <span className="shrink-0">{relativeTime(l.updated_at ?? l.created_at)}</span>
                        </div>
                      </div>
                      <Badge variant="outline" className={`shrink-0 text-[10px] ${STATUS_TONE[l.status] ?? ""}`}>
                        {labelFor(l.status) ?? l.status ?? "—"}
                      </Badge>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export { STATUS_OPTIONS as LEAD_STATUS_OPTIONS };