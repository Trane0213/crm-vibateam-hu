import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/* ────────── KPI kártya ────────── */

export type KpiTone = "info" | "success" | "warning" | "danger" | "neutral";

const TONE_TEXT: Record<KpiTone, string> = {
  info:    "text-[color:var(--status-info)]",
  success: "text-[color:var(--status-success)]",
  warning: "text-[color:var(--status-warning)]",
  danger:  "text-destructive",
  neutral: "text-foreground",
};

const TONE_BORDER: Record<KpiTone, string> = {
  info:    "border-[color:var(--status-info)]/30",
  success: "border-[color:var(--status-success)]/30",
  warning: "border-[color:var(--status-warning)]/30",
  danger:  "border-destructive/30",
  neutral: "border-border",
};

export function KpiCard({
  icon: Icon, label, value, sub, tone = "neutral", to,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  sub?: string;
  tone?: KpiTone;
  to?: string;
}) {
  const inner = (
    <>
      <div className={`flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider ${TONE_TEXT[tone]} opacity-90`}>
        {Icon && <Icon className="h-3.5 w-3.5" />}
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums leading-none">{value}</div>
      {sub && <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>}
    </>
  );
  const cls = `block rounded-lg border bg-card p-3 transition ${TONE_BORDER[tone]}`;
  return to
    ? <Link to={to as any} className={`${cls} hover:bg-muted/40`}>{inner}</Link>
    : <div className={cls}>{inner}</div>;
}

/* ────────── Státusz badge (egységes színek) ────────── */

export type StatusKey = "new" | "contacted" | "qualified" | "handoff" | "rejected" | "lost" | "active" | "inactive" | "neutral";

const STATUS: Record<StatusKey, { label: string; cls: string }> = {
  new:        { label: "Új",              cls: "border-[color:var(--status-info)]/40    bg-[color:var(--status-info)]/10    text-[color:var(--status-info)]" },
  contacted:  { label: "Kapcsolatban",    cls: "border-primary/40                       bg-primary/10                       text-primary" },
  qualified:  { label: "Átadható",        cls: "border-[color:var(--status-warning)]/40 bg-[color:var(--status-warning)]/10 text-[color:var(--status-warning)]" },
  handoff:    { label: "Átadva",          cls: "border-[color:var(--status-success)]/40 bg-[color:var(--status-success)]/10 text-[color:var(--status-success)]" },
  rejected:   { label: "Elutasítva",      cls: "border-muted-foreground/30              bg-muted/40                         text-muted-foreground" },
  lost:       { label: "Elveszett",       cls: "border-muted-foreground/30              bg-muted/40                         text-muted-foreground" },
  active:     { label: "Aktív",           cls: "border-[color:var(--status-success)]/40 bg-[color:var(--status-success)]/10 text-[color:var(--status-success)]" },
  inactive:   { label: "Inaktív",         cls: "border-muted-foreground/30              bg-muted/40                         text-muted-foreground" },
  neutral:    { label: "—",               cls: "border-border                           bg-muted/40                         text-muted-foreground" },
};

export function StatusPill({ status, children }: { status: StatusKey; children?: ReactNode }) {
  const s = STATUS[status] ?? STATUS.neutral;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${s.cls}`}>
      {children ?? s.label}
    </span>
  );
}

/* ────────── Adatminőség jelző ────────── */

export function QualityBar({ pct }: { pct: number }) {
  const band: "green" | "yellow" | "red" = pct >= 85 ? "green" : pct >= 50 ? "yellow" : "red";
  const fill = band === "green" ? "bg-[color:var(--status-success)]" : band === "yellow" ? "bg-[color:var(--status-warning)]" : "bg-destructive";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${fill}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      </div>
      <span className="w-8 text-right text-[11px] tabular-nums text-muted-foreground">{pct}%</span>
    </div>
  );
}

/* ────────── Szűrő sáv ────────── */

export type FilterSelectProps = {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
};

export function FilterSelect({ value, onChange, placeholder, options }: FilterSelectProps) {
  return (
    <Select value={value || "__all__"} onValueChange={(v) => onChange(v === "__all__" ? "" : v)}>
      <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">{placeholder}</SelectItem>
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function FilterBar({
  search, onSearch, searchPlaceholder = "Keresés…", children, onReset, resultCount,
}: {
  search: string;
  onSearch: (v: string) => void;
  searchPlaceholder?: string;
  children?: ReactNode;
  onReset?: () => void;
  resultCount?: number;
}) {
  const dirty = !!search || !!onReset;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2">
      <div className="relative min-w-[220px] flex-1">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-9 pl-8"
        />
      </div>
      {children}
      {typeof resultCount === "number" && (
        <Badge variant="outline" className="ml-1 tabular-nums">{resultCount} találat</Badge>
      )}
      {dirty && onReset && (
        <Button size="sm" variant="ghost" onClick={onReset}><X className="mr-1 h-3 w-3" />Töröl</Button>
      )}
    </div>
  );
}

/* ────────── Utolsó aktivitás formattáló ────────── */

export function relativeTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso).getTime();
  if (!Number.isFinite(d)) return "—";
  const diffMs = Date.now() - d;
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return "most";
  if (min < 60) return `${min} perce`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} órája`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day} napja`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo} hónapja`;
  return new Date(iso).toLocaleDateString("hu-HU");
}