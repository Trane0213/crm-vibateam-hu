/**
 * George szervezeti jelzései — a meglévő AI-felülvizsgálati oldalon (Tulajdonos).
 * Élő, determinisztikus forrásellenőrzés: 0 AI-hívás, 0 adatírás. Minden tételnél bizonyíték-osztály,
 * állapot, felelős szerepkör, következő teendő, ellenőrzési javaslat és forrásrekord-link.
 */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, Brain, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { georgeOrgSignals } from "@/lib/george/org-signals.functions";
import {
  DOMAIN_LABEL, DOMAIN_ORDER, EVIDENCE_LABEL, NO_DATA_AREAS, ROLE_LABEL, STATUS_LABEL,
  type OrgDomain, type OrgItem, type OrgLink, type OrgStatus,
} from "@/lib/george/org-signals";

export const ORG_SIGNALS_QUERY_KEY = ["george-org-signals"] as const;

export function useOrgSignals() {
  const load = useServerFn(georgeOrgSignals);
  return useQuery({ queryKey: ORG_SIGNALS_QUERY_KEY, queryFn: () => load(), staleTime: 60_000, retry: false });
}

const fmt = (iso: string | null | undefined) => iso ? new Intl.DateTimeFormat("hu-HU", { timeZone: "Europe/Budapest", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "—";
const SEV_BADGE = { critical: { label: "Súlyos", variant: "destructive" }, warning: { label: "Figyelmeztetés", variant: "secondary" }, info: { label: "Tájékoztató", variant: "outline" } } as const;
const STATUS_TONE: Record<OrgStatus, string> = {
  open: "border-[color:var(--status-warning)]/40 text-[color:var(--status-warning)]",
  verify: "border-[color:var(--status-info)]/40 text-[color:var(--status-info)]",
  closed: "border-border text-muted-foreground",
};

function RecordLink({ link, children, variant = "outline" }: { link: OrgLink; children: React.ReactNode; variant?: "outline" | "default" | "ghost" }) {
  return <Button asChild size="sm" variant={variant}><Link to={link.to as "/today"} search={(link.search ?? {}) as never}>{children}<ArrowUpRight /></Link></Button>;
}

export function OrgSignalsPanel() {
  const q = useOrgSignals();
  const [status, setStatus] = useState<OrgStatus | "all">("all");
  const [domain, setDomain] = useState<OrgDomain | "all">("all");
  const items = q.data?.items ?? [];
  const shown = useMemo(() => items.filter((i) => (status === "all" || i.status === status) && (domain === "all" || i.domain === domain)), [items, status, domain]);
  const domains = DOMAIN_ORDER.filter((d) => items.some((i) => i.domain === d));
  const failed = (q.data?.sources ?? []).filter((s) => s.state !== "ok");

  return (
    <Card id="george-jelzesek">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Brain className="h-4 w-4 text-primary" />George szervezeti jelzései — élő forrásellenőrzés</CardTitle>
        <CardDescription className="max-w-3xl">
          A meglévő CRM-rekordokból, a te jogosultságoddal számolva, rekordonként egy tételben: Sales→PM átadási hiányok, elmaradt ügyek, bizonyíték nélküli állapotok, dolgozói jelzések és automatikus jelzések.
          A <b>tény</b> (forrásrekord igazolja), a <b>panasz</b>, a <b>javítandó hiba</b> és a <b>gyanú/feltételezés</b> külön jelölt. AI-hívás nincs, adatot nem ír, nem küld, nem dönt helyetted.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {q.isPending ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />Források ellenőrzése…</p>
          : q.isError ? (
            <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {q.error instanceof Error ? q.error.message : "A jelzések nem tölthetők be."} Mentett adat nem változott.
              <Button size="sm" variant="outline" onClick={() => q.refetch()}>Újrapróbálás</Button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="outline" className={STATUS_TONE.open}>Nyitott: {q.data.summary.byStatus.open}</Badge>
                <Badge variant="outline" className={STATUS_TONE.verify}>Ellenőrizendő: {q.data.summary.byStatus.verify}</Badge>
                <Badge variant="outline">Lezárt (30 napon belül): {q.data.summary.byStatus.closed}</Badge>
                <Badge variant={q.data.summary.critical ? "destructive" : "outline"}>Súlyos nyitott: {q.data.summary.critical}</Badge>
                <span className="text-xs text-muted-foreground">Számolva: {fmt(q.data.generatedAt)} · AI-hívás: 0 · írás: 0</span>
                <Button size="sm" variant="ghost" onClick={() => q.refetch()} disabled={q.isFetching}>{q.isFetching ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <RefreshCw />}Frissítés</Button>
              </div>
              {failed.length > 0 && (
                <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  Nem teljes kép — {failed.map((s) => `${s.label}: ${s.state === "error" ? "nem tölthető be" : `részleges (${s.rows}/${s.total ?? "?"})`}`).join("; ")}. Az ezekből eredő tételek hiányozhatnak.
                </p>
              )}
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Szűrés állapot szerint">
                {(["all", "open", "verify", "closed"] as const).map((s) => (
                  <Button key={s} size="sm" variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)}>
                    {s === "all" ? `Mind (${items.length})` : `${STATUS_LABEL[s]} (${q.data.summary.byStatus[s]})`}
                  </Button>
                ))}
              </div>
              {domains.length > 1 && (
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Szűrés terület szerint">
                  <Button size="sm" variant={domain === "all" ? "secondary" : "ghost"} onClick={() => setDomain("all")}>Minden terület</Button>
                  {domains.map((d) => <Button key={d} size="sm" variant={domain === d ? "secondary" : "ghost"} onClick={() => setDomain(d)}>{DOMAIN_LABEL[d]} ({q.data.summary.byDomain[d] ?? 0})</Button>)}
                </div>
              )}
              {!items.length ? <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">A betöltött forrásokban nincs nyitott vagy ellenőrizendő tétel.</p>
                : !shown.length ? <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Ehhez a szűréshez nincs tétel.</p>
                : <ul className="space-y-2" aria-label="George szervezeti jelzései">{shown.slice(0, 150).map((i) => <OrgRow key={i.key} item={i} />)}</ul>}
              {shown.length > 150 && <p className="text-xs text-muted-foreground">Az első 150 tétel látszik ({shown.length} összesen) — szűkíts terület vagy állapot szerint.</p>}
              <Coverage sources={q.data.sources} collectorEnabled={q.data.collectorEnabled} />
            </>
          )}
      </CardContent>
    </Card>
  );
}

function OrgRow({ item }: { item: OrgItem }) {
  const sev = SEV_BADGE[item.severity];
  return (
    <li className="min-w-0 rounded-md border bg-card p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={sev.variant}>{sev.label}</Badge>
        <Badge variant="outline" className={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</Badge>
        <Badge variant="outline">{DOMAIN_LABEL[item.domain]}</Badge>
        <span className={cn("text-xs", item.evidence === "fact" ? "text-foreground" : "text-muted-foreground")}>{EVIDENCE_LABEL[item.evidence]}</span>
      </div>
      <p className="mt-1.5 break-words text-sm font-medium">{item.title}</p>
      <p className="break-words text-xs text-muted-foreground">{item.detail}</p>
      <p className="mt-1 text-xs"><span className="text-muted-foreground">Felelős:</span> <b>{ROLE_LABEL[item.role]}</b>{item.responsibleName ? ` — ${item.responsibleName}` : item.responsibleId ? " — név nem látható" : ""}{item.occurrences != null && item.occurrences > 1 ? ` · ${item.occurrences}×` : ""}</p>
      <div className="mt-2 rounded-md bg-muted/50 px-2.5 py-2 text-sm"><span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Következő teendő</span><p className="break-words">{item.nextAction}</p></div>
      <div className="mt-2 flex flex-wrap gap-1.5">{item.link && <RecordLink link={item.link} variant="default">Megnyitás</RecordLink>}</div>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-muted-foreground">Részletek, forrás ({item.sources.length}) és ellenőrzés</summary>
        {item.gaps.length > 0 && <ul className="mt-1.5 list-disc space-y-0.5 pl-5">{item.gaps.map((g) => <li key={g} className="break-words">{g}</li>)}</ul>}
        {item.notes.length > 0 && <ul className="mt-1.5 space-y-0.5 text-muted-foreground">{item.notes.map((n) => <li key={n} className="break-words">• {n}</li>)}</ul>}
        <p className="mt-1.5"><b>Ellenőrzési / tesztjavaslat:</b> {item.testHint}</p>
        <ul className="mt-1.5 space-y-1">
          {item.sources.map((s) => (
            <li key={`${s.table}:${s.id}`} className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] text-muted-foreground">{s.table}:{s.id.slice(0, 8)}</span>
              {s.link ? <Link to={s.link.to as "/today"} search={(s.link.search ?? {}) as never} className="text-primary underline-offset-2 hover:underline">{s.label}</Link> : <span>{s.label}</span>}
            </li>
          ))}
        </ul>
        <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">Kulcs: {item.key}</p>
      </details>
    </li>
  );
}

function Coverage({ sources, collectorEnabled }: { sources: { key: string; label: string; state: string; rows: number; total: number | null }[]; collectorEnabled: boolean | null }) {
  return (
    <details className="rounded-md border p-3 text-xs">
      <summary className="cursor-pointer font-medium">Forráslefedettség — mit lát és mit nem lát George</summary>
      <ul className="mt-2 grid gap-1 sm:grid-cols-2">
        {sources.map((s) => <li key={s.key}><b>{s.label}:</b> {s.state === "ok" ? `betöltve (${s.rows})` : s.state === "partial" ? `részleges (${s.rows}/${s.total ?? "?"})` : "nem tölthető be"}</li>)}
        <li><b>Óránkénti AI nélküli jelzésgyűjtő:</b> {collectorEnabled == null ? "állapot nem olvasható" : collectorEnabled ? "BEKAPCSOLVA" : "KIKAPCSOLVA — a jelzéstábla nem frissül magától; ez a nézet élőben számol"}</li>
      </ul>
      <p className="mt-2 font-medium">NINCS ADAT (nincs valódi adatkapcsolat, ezért nem képzünk belőle jelzést):</p>
      <ul className="mt-1 space-y-0.5">{NO_DATA_AREAS.map((a) => <li key={a.key}><b>{a.label}:</b> {a.note}</li>)}</ul>
    </details>
  );
}
