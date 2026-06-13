import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, BellRing, Building2, UserRound, ExternalLink, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useListWhere } from "@/lib/db-hooks";
import { useLookup, fmtDateTime } from "@/components/resource/resource-page";
import { LEAD_STATUS_OPTIONS } from "./lead-list-column";
import { useUpdateLead } from "./use-lead-mutations";

export function LeadDetailColumn({
  leadId,
  mode = "sales",
}: {
  leadId: string | null;
  mode?: "marketing" | "sales";
}) {
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

  return (
    <div className="flex h-full flex-col overflow-auto">
      <div className="border-b px-5 py-4">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Érdeklődő</div>
        <h2 className="mt-1 text-lg font-semibold leading-tight">
          {l.summary ? l.summary.slice(0, 80) : `#${String(l.id).slice(0, 8)}`}
        </h2>
        <div className="mt-2 flex items-center gap-2">
          <select
            value={l.status ?? ""}
            onChange={(e) => updateLead.mutate({ status: e.target.value })}
            className="h-8 rounded-md border bg-background px-2 text-xs font-medium"
          >
            {LEAD_STATUS_OPTIONS
              .filter((o) => o.value)
              // Marketing UI nem ajánl fel `converted`-et — az értékesítői hatáskör.
              .filter((o) => (mode === "marketing" ? o.value !== "converted" : true))
              .map((o) => (
                <option key={o.value} value={o.value}>
                  {mode === "marketing" ? ((o as any).marketingLabel ?? o.label) : o.label}
                </option>
              ))}
          </select>
          {l.source && <Badge variant="outline" className="font-normal">{l.source}</Badge>}
          {l.project_type && <Badge variant="outline" className="font-normal">{l.project_type}</Badge>}
          <Link
            to="/leads/$id" params={{ id: l.id }}
            className="ml-auto inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
          >
            Teljes oldal <ExternalLink className="h-3 w-3" />
          </Link>
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
                return (
                  <li key={f.id} className="flex items-center justify-between gap-2 rounded border px-3 py-1.5 text-xs">
                    <span className="truncate">
                      <span className="font-medium">{f.followup_type ?? "—"}</span>
                      {f.result && <span className="text-muted-foreground"> · {f.result}</span>}
                    </span>
                    <span className={`tabular-nums ${overdue ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
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