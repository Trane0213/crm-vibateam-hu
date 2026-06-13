import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Briefcase, BellRing, Building2, UserRound, ExternalLink, Save,
  Sparkles, Mail, Phone, Calendar, UserCheck, ChevronDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useListWhere } from "@/lib/db-hooks";
import { useLookup, fmtDateTime } from "@/components/resource/resource-page";
import { LEAD_STATUS_OPTIONS } from "./lead-list-column";
import { useUpdateLead } from "./use-lead-mutations";
import { useAutoEnrich } from "@/lib/enrichment/use-auto-enrich";
import { LeadQualityBlock } from "./lead-quality-block";
import { resolveCompanyIdentity } from "@/lib/dedupe/company-identity";
import { LeadAutoFixesBlock } from "./lead-auto-fixes-block";
import { computeLeadScore } from "@/lib/dedupe/lead-scoring";
import { computeLeadUrgency, LeadUrgencyDot, type FollowupLite } from "./lead-urgency-dot";
import { relativeTime } from "@/components/marketing-ui";

export function LeadDetailColumn({
  leadId,
  mode = "sales",
}: {
  leadId: string | null;
  mode?: "marketing" | "sales";
}) {
  const enrichmentResult = useAutoEnrich("lead", leadId);
  const companyLabel = useLookup("companies", "name");
  const contactLabel = useLookup("contacts", "name");
  const lead = useQuery({
    queryKey: ["leads", "detail", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("*").eq("id", leadId!).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
  const followups = useListWhere<any>("followups", "company_id", lead.data?.company_id, {
    order: "due_date", ascending: false, enabled: !!lead.data?.company_id,
  });
  // Projekteket csak nem-marketing módban kérdezzük le — marketingnek nem releváns.
  const projects = useListWhere<any>("projects", "lead_id", leadId, {
    order: "created_at", ascending: false, enabled: mode !== "marketing",
  });

  const updateLead = useUpdateLead(leadId);

  // Inline mezők: source / project_type — debounced autosave.
  const [sourceVal, setSourceVal] = useState("");
  const [projectTypeVal, setProjectTypeVal] = useState("");
  const sourceTimer = useRef<number | null>(null);
  const projectTimer = useRef<number | null>(null);
  useEffect(() => {
    setSourceVal(lead.data?.source ?? "");
    setProjectTypeVal(lead.data?.project_type ?? "");
  }, [leadId, lead.data?.id]);

  function scheduleUpdate(field: "source" | "project_type", value: string) {
    const ref = field === "source" ? sourceTimer : projectTimer;
    if (ref.current) window.clearTimeout(ref.current);
    ref.current = window.setTimeout(() => {
      if (!leadId) return;
      updateLead.mutate({ [field]: value || null });
    }, 700);
  }

  // D7: Cég Identity Strength a fejlécben (csak ha van cég).
  const identity = useQuery({
    queryKey: ["lead", leadId, "company-identity", lead.data?.company_id],
    enabled: !!lead.data?.company_id,
    queryFn: () => resolveCompanyIdentity(lead.data!.company_id!),
    staleTime: 60_000,
  });

  // Score chiphez: ugyanaz a számítás, mint a LeadQualityBlock-ban — DRY az auxon keresztül.
  const scoreAux = useQuery({
    queryKey: ["lead-detail-chip", leadId, lead.data?.company_id, lead.data?.contact_id],
    enabled: !!lead.data,
    queryFn: async () => {
      const [{ data: company }, { data: contact }] = await Promise.all([
        lead.data?.company_id
          ? supabase.from("companies").select("domain,website").eq("id", lead.data.company_id).maybeSingle()
          : Promise.resolve({ data: null } as any),
        lead.data?.contact_id
          ? supabase.from("contacts").select("email,phone").eq("id", lead.data.contact_id).maybeSingle()
          : Promise.resolve({ data: null } as any),
      ]);
      return { company, contact };
    },
  });

  // Sürgősség pötty a fejlécbe — a cég lejárt/mai followupjaiból.
  const urgencyFollowups = useQuery({
    queryKey: ["lead-detail-urgency", lead.data?.company_id],
    enabled: !!lead.data?.company_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("followups").select("company_id, due_date, completed")
        .eq("company_id", lead.data!.company_id!).eq("completed", false);
      if (error) throw error;
      return data as FollowupLite[];
    },
  });
  const urgencyLevel = useMemo(() => {
    if (!lead.data) return "muted" as const;
    const map = lead.data.company_id && urgencyFollowups.data
      ? new Map([[lead.data.company_id, urgencyFollowups.data]])
      : undefined;
    return computeLeadUrgency(lead.data, map);
  }, [lead.data, urgencyFollowups.data]);

  const score = lead.data
    ? computeLeadScore(lead.data, scoreAux.data?.contact ?? null, scoreAux.data?.company ?? null)
    : null;

  // Inline jegyzet (summary) — debounced autosave
  const [note, setNote] = useState<string>("");
  const [noteState, setNoteState] = useState<"idle" | "dirty" | "saving" | "saved">("idle");
  const noteTimer = useRef<number | null>(null);
  useEffect(() => {
    setNote(lead.data?.summary ?? "");
    setNoteState("idle");
  }, [leadId, lead.data?.id]);

  function onNoteChange(v: string) {
    setNote(v);
    setNoteState("dirty");
    if (noteTimer.current) window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(async () => {
      if (!leadId) return;
      setNoteState("saving");
      try {
        await updateLead.mutateAsync({ summary: v });
        setNoteState("saved");
        window.setTimeout(() => setNoteState((s) => (s === "saved" ? "idle" : s)), 1200);
      } catch {
        setNoteState("dirty");
      }
    }, 700);
  }

  if (!leadId) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div className="max-w-xs text-sm text-muted-foreground">
          Válassz egy érdeklődőt a bal oldalon, hogy itt megjelenjenek a részletek.
        </div>
      </div>
    );
  }

  if (lead.isLoading) return <div className="p-4 text-sm text-muted-foreground">Lead betöltése…</div>;
  if (!lead.data) return <div className="p-4 text-sm text-muted-foreground">Nem található.</div>;

  const l = lead.data;
  const noteBadge =
    noteState === "dirty"  ? <span className="text-[11px] text-muted-foreground">Mentésre vár…</span> :
    noteState === "saving" ? <span className="text-[11px] text-muted-foreground">Mentés…</span> :
    noteState === "saved"  ? <span className="text-[11px] text-emerald-600 flex items-center gap-1"><Save className="h-3 w-3" /> Mentve</span> : null;

  const scoreToneCls = !score
    ? "text-muted-foreground"
    : score.band === "green" ? "text-emerald-700"
    : score.band === "yellow" ? "text-amber-700"
    : "text-destructive";

  // 800ms után, ha még nincs auto-enrich eredmény, NE mutassuk a "running" üzenetet (csendes).
  const enrichStatus: "idle" | "running" | "done" =
    enrichmentResult ? "done" : "idle";

  return (
    <div className="flex h-full flex-col overflow-auto">
      <div className="border-b px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 max-w-full">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Érdeklődő</div>
            <h2 className="mt-1 break-words text-lg font-semibold leading-tight">
              {l.summary ? l.summary.slice(0, 120) : `#${String(l.id).slice(0, 8)}`}
            </h2>
          </div>
          <Link
            to="/leads/$id" params={{ id: l.id }}
            className="shrink-0 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
          >
            Teljes oldal <ExternalLink className="h-3 w-3" />
          </Link>
        </div>

        {/* Chip-sor: státusz + score + hőmérséklet + identity + utolsó aktivitás */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            value={l.status ?? ""}
            onChange={(e) => updateLead.mutate({ status: e.target.value })}
            className="h-7 rounded-md border bg-background px-2 text-xs font-medium"
          >
            {LEAD_STATUS_OPTIONS
              .filter((o) => o.value)
              .filter((o) => (mode === "marketing" ? o.value !== "converted" : true))
              .map((o) => (
                <option key={o.value} value={o.value}>
                  {mode === "marketing" ? ((o as any).marketingLabel ?? o.label) : o.label}
                </option>
              ))}
          </select>
          {score && (
            <Badge variant="outline" className={`font-medium ${scoreToneCls}`}>
              Score {score.pct}%
            </Badge>
          )}
          {mode === "marketing" && (
            <Badge variant="outline" className="font-normal">
              <LeadUrgencyDot level={urgencyLevel} />
              <span className="ml-1.5">
                {urgencyLevel === "red" ? "Lejárt" : urgencyLevel === "amber" ? "Mai" : urgencyLevel === "blue" ? "Új 24h" : "Nincs esedékes"}
              </span>
            </Badge>
          )}
          {identity.data && (
            <Badge variant="outline" className="font-normal">
              Identity {identity.data.identityStrength}/100
            </Badge>
          )}
          <Badge variant="outline" className="font-normal text-muted-foreground">
            Utolsó: {relativeTime(l.updated_at ?? l.created_at)}
          </Badge>
        </div>

        {/* Inline source / project_type szerkesztés */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Forrás</div>
            <Input
              value={sourceVal}
              onChange={(e) => { setSourceVal(e.target.value); scheduleUpdate("source", e.target.value); }}
              placeholder="pl. Weboldal, Ajánlás"
              className="h-7 text-xs"
            />
          </div>
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Projekt típus</div>
            <Input
              value={projectTypeVal}
              onChange={(e) => { setProjectTypeVal(e.target.value); scheduleUpdate("project_type", e.target.value); }}
              placeholder="pl. Webshop, Brand"
              className="h-7 text-xs"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <section>
          <div className="mb-1.5 flex items-center justify-between">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Jegyzet</div>
            {noteBadge}
          </div>
          <Textarea
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder="Mit fontos tudni erről az érdeklődőről?"
            rows={4}
            className="text-sm"
          />
        </section>

        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-md border p-3">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
              <Building2 className="h-3 w-3" /> Cég
            </div>
            <div className="mt-1 text-sm font-medium">
              {l.company_id ? (
                <Link to="/customers/$id" params={{ id: l.company_id }} className="text-primary hover:underline">
                  {companyLabel(l.company_id)}
                </Link>
              ) : <span className="text-muted-foreground">—</span>}
            </div>
            {identity.data && (
              <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
                <Badge variant="outline" className="font-normal">
                  Identity {identity.data.identityStrength}/100
                </Badge>
                {identity.data.isStrongIdentity && (
                  <span className="text-emerald-600">erős azonosító</span>
                )}
              </div>
            )}
          </div>
          <div className="rounded-md border p-3">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
              <UserRound className="h-3 w-3" /> Kapcsolattartó
            </div>
            <div className="mt-1 text-sm font-medium">
              {l.contact_id ? (
                <Link to="/contacts/$id" params={{ id: l.contact_id }} className="text-primary hover:underline">
                  {contactLabel(l.contact_id)}
                </Link>
              ) : <span className="text-muted-foreground">—</span>}
            </div>
          </div>
        </section>

        {/* Adatminőség és automatikus javítások — alapból zárt, hogy a jegyzet és időskála domináljon. */}
        <details className="rounded-md border bg-card">
          <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:bg-muted/40">
            <span className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Adatminőség és automatikus javítások
            </span>
            <ChevronDown className="h-3.5 w-3.5" />
          </summary>
          <div className="space-y-3 border-t p-3">
            <LeadQualityBlock lead={l} />
            <LeadAutoFixesBlock status={enrichStatus} result={enrichmentResult} />
          </div>
        </details>

        <section>
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <BellRing className="h-3 w-3" /> Utókövetés idővonal
          </div>
          {!l.company_id ? (
            <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
              Cég nincs hozzárendelve — az utókövetések céghez kötődnek.
            </div>
          ) : (followups.data ?? []).length === 0 ? (
            <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
              Még nincs utókövetés. A jobb panelen rögzíthetsz egyet.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {(followups.data ?? []).slice(0, 6).map((f: any) => {
                const overdue = f.due_date && !f.completed && new Date(f.due_date) < new Date();
                const Icon =
                  f.followup_type === "email"   ? Mail :
                  f.followup_type === "call"    ? Phone :
                  f.followup_type === "meeting" ? Calendar :
                  f.followup_type === "handoff" ? UserCheck :
                  BellRing;
                return (
                  <li key={f.id} className="flex items-center justify-between gap-2 rounded border px-3 py-1.5 text-xs">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Icon className={`h-3.5 w-3.5 shrink-0 ${f.completed ? "text-emerald-600" : "text-muted-foreground"}`} />
                      <span className="truncate">
                        <span className="font-medium">{labelForFollowupType(f.followup_type)}</span>
                        {f.result && <span className="text-muted-foreground"> · {f.result}</span>}
                      </span>
                    </span>
                    <span className={`shrink-0 tabular-nums ${overdue ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                      {fmtDateTime(f.due_date)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {mode !== "marketing" && (
          <section>
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <Briefcase className="h-3 w-3" /> Konvertált projektek
            </div>
            {(projects.data ?? []).length === 0 ? (
              <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                Még nincs projekt ehhez a leadhez.
              </div>
            ) : (
              <ul className="space-y-1.5">
                {(projects.data ?? []).map((p: any) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 rounded border px-3 py-1.5 text-xs">
                    <Link to="/projects/$id" params={{ id: p.id }} className="truncate text-primary hover:underline">
                      {p.title ?? p.name ?? "—"}
                    </Link>
                    <span className="text-muted-foreground">{p.status ?? "—"}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}