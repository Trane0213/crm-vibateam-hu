import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useList } from "@/lib/db-hooks";

const STATUS_OPTIONS = [
  { value: "", label: "Minden státusz" },
  { value: "new", label: "Új" },
  { value: "contacted", label: "Felvettük" },
  { value: "qualified", label: "Minősített" },
  { value: "converted", label: "Konvertált" },
  { value: "lost", label: "Elveszett" },
];

const STATUS_TONE: Record<string, string> = {
  new: "bg-[color:var(--status-info)]/15 text-[color:var(--status-info)] border-[color:var(--status-info)]/30",
  contacted: "bg-primary/10 text-primary border-primary/30",
  qualified: "bg-[color:var(--status-warning)]/15 text-[color:var(--status-warning)] border-[color:var(--status-warning)]/30",
  converted: "bg-[color:var(--status-success)]/15 text-[color:var(--status-success)] border-[color:var(--status-success)]/30",
  lost: "bg-destructive/10 text-destructive border-destructive/30",
};

export function LeadListColumn({
  selectedId, onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { data, isLoading } = useList<any>("leads", { order: "created_at", ascending: false });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");

  const allSources = useMemo(() => {
    const set = new Set<string>();
    for (const l of data ?? []) if (l.source) set.add(l.source);
    return Array.from(set).sort();
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((l: any) => {
      if (status && l.status !== status) return false;
      if (source && l.source !== source) return false;
      if (!q) return true;
      const hay = `${l.summary ?? ""} ${l.source ?? ""} ${l.project_type ?? ""} ${l.email ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [data, search, status, source]);

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
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="flex-1 h-8 rounded-md border bg-background px-2 text-xs"
          >
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="flex-1 h-8 rounded-md border bg-background px-2 text-xs"
          >
            <option value="">Minden forrás</option>
            {allSources.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="text-[11px] text-muted-foreground">{filtered.length} érdeklődő</div>
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
              return (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(l.id)}
                    className={`w-full text-left px-3 py-2.5 transition-colors hover:bg-muted/50 ${active ? "bg-primary/10" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{l.summary ?? `#${String(l.id).slice(0, 6)}`}</div>
                        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {l.source ?? "—"}{l.project_type ? ` · ${l.project_type}` : ""}
                        </div>
                      </div>
                      <Badge variant="outline" className={`shrink-0 text-[10px] ${STATUS_TONE[l.status] ?? ""}`}>
                        {STATUS_OPTIONS.find((o) => o.value === l.status)?.label ?? l.status ?? "—"}
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