import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Activity, Filter, Briefcase, Sparkles, FileText, BellRing,
  ListChecks, Phone, Calendar, Mail, StickyNote, FolderOpen,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/page-header";
import { supabase } from "@/integrations/supabase/client";
import { fmtDateTime } from "@/components/resource/resource-page";

export const Route = createFileRoute("/_authenticated/activity")({
  component: ActivityTimelinePage,
});

type Row = {
  event_type: string;
  event_date: string;
  title: string | null;
  reference_type: string;
  reference_id: string;
  customer_id: string | null;
  user_id: string | null;
};

const EVENT_META: Record<string, { label: string; icon: any; tone: string }> = {
  project_created: { label: "Projekt",     icon: Briefcase,  tone: "text-primary" },
  lead:            { label: "Lead",        icon: Sparkles,   tone: "text-[color:var(--status-info)]" },
  quote:           { label: "Ajánlat",     icon: FileText,   tone: "text-primary" },
  followup:        { label: "Utókövetés",  icon: BellRing,   tone: "text-[color:var(--status-warning)]" },
  task:            { label: "Feladat",     icon: ListChecks, tone: "text-foreground" },
  call:            { label: "Hívás",       icon: Phone,      tone: "text-foreground" },
  meeting:         { label: "Találkozó",   icon: Calendar,   tone: "text-foreground" },
  email:           { label: "Email",       icon: Mail,       tone: "text-foreground" },
  note:            { label: "Jegyzet",     icon: StickyNote, tone: "text-muted-foreground" },
  document:        { label: "Dokumentum",  icon: FolderOpen, tone: "text-muted-foreground" },
};

function ActivityTimelinePage() {
  const [type, setType] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [days, setDays] = useState<string>("30");

  const since = useMemo(() => {
    const n = Number(days);
    if (!Number.isFinite(n) || n <= 0) return null;
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString();
  }, [days]);

  const q = useQuery({
    queryKey: ["activity_timeline_v", since],
    queryFn: async () => {
      let qb = supabase
        .from("activity_timeline_v")
        .select("event_type,event_date,title,reference_type,reference_id,customer_id,user_id")
        .order("event_date", { ascending: false })
        .limit(500);
      if (since) qb = qb.gte("event_date", since);
      const { data, error } = await qb;
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const names = useQuery({
    queryKey: ["activity_timeline_v", "customer_names"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("id,name");
      if (error) throw error;
      const m = new Map<string, string>();
      for (const r of data ?? []) m.set((r as any).id, (r as any).name ?? "—");
      return m;
    },
  });

  const filtered = (q.data ?? []).filter((r) => {
    if (type !== "all" && r.event_type !== type) return false;
    if (search) {
      const s = search.toLowerCase();
      const cn = (r.customer_id && names.data?.get(r.customer_id)) ?? "";
      if (
        !(r.title ?? "").toLowerCase().includes(s) &&
        !cn.toLowerCase().includes(s)
      ) return false;
    }
    return true;
  });

  // Csoportosítás nap szerint
  const groups = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of filtered) {
      const key = new Date(r.event_date).toISOString().slice(0, 10);
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div className="flex flex-col">
      <div className="border-b bg-background px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">CRM</div>
            <h1 className="mt-1 flex items-center gap-2 text-xl font-semibold">
              <Activity className="h-5 w-5 text-primary" /> Aktivitás idővonal
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Egységes esemény idővonal az összes modulból. Maximum 500 esemény.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <Input
            placeholder="Keresés a címben vagy ügyfél névben…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Minden esemény</SelectItem>
              {Object.entries(EVENT_META).map(([k, m]) => (
                <SelectItem key={k} value={k}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Utolsó 7 nap</SelectItem>
              <SelectItem value="30">Utolsó 30 nap</SelectItem>
              <SelectItem value="90">Utolsó 90 nap</SelectItem>
              <SelectItem value="365">Utolsó 1 év</SelectItem>
              <SelectItem value="0">Mind</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {q.isLoading ? (
          <div className="text-sm text-muted-foreground">Idővonal betöltése…</div>
        ) : groups.length === 0 ? (
          <EmptyState icon={Filter} title="Nincs találat" description="Próbálj más szűrőt." />
        ) : (
          groups.map(([day, rows]) => (
            <Card key={day}>
              <CardHeader className="py-3">
                <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {new Date(day).toLocaleDateString("hu-HU", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                  <span className="ml-2 text-muted-foreground/60">· {rows.length} esemény</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="divide-y">
                  {rows.map((r, i) => {
                    const meta = EVENT_META[r.event_type] ?? { label: r.event_type, icon: Activity, tone: "text-muted-foreground" };
                    const Icon = meta.icon;
                    const cn = r.customer_id ? names.data?.get(r.customer_id) : null;
                    return (
                      <li key={`${r.reference_type}-${r.reference_id}-${i}`} className="flex items-start gap-3 py-2.5">
                        <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/40 ${meta.tone}`}>
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px]">{meta.label}</Badge>
                            {cn && r.customer_id && (
                              <Link to="/customers/$id" params={{ id: r.customer_id }} className="truncate text-xs text-primary hover:underline">
                                {cn}
                              </Link>
                            )}
                          </div>
                          <div className="mt-0.5 truncate text-sm">{r.title ?? "—"}</div>
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{fmtDateTime(r.event_date)}</span>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}