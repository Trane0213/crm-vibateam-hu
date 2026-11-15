import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, FileUp, Settings2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAiPanel } from "@/components/ai/ai-panel";
import { useVisibleAgents } from "@/hooks/use-visible-agents";
import { SIMPLE_STEPS, simpleQuoteState, timothyQuickCommands, type NextAction, type SimpleInput } from "@/lib/quotes/simple-workspace";

/**
 * Egyszerűsített ajánlat-munkaterület (prototípus). Csak elrendezés: a
 * meglévő paneleket kapja „slot”-ként, saját mentése, árazása, jóváhagyása
 * vagy küldése nincs. A szakértői rész mindig csatolva marad (details),
 * így a kalkuláció állapota nem vész el összecsukáskor.
 */
export function QuoteSimpleWorkspace({
  quoteId, input, onSave, saving, basics, documents, review, followup, expert,
}: {
  quoteId: string;
  input: Omit<SimpleInput, "docCount">;
  onSave: () => void;
  saving: boolean;
  basics: ReactNode; documents: ReactNode; review: ReactNode; followup: ReactNode; expert: ReactNode;
}) {
  const docs = useQuery({
    queryKey: ["quote_documents", quoteId],
    queryFn: async () => {
      const { data, error } = await supabase.from("quote_documents" as any).select("*").eq("quote_id", quoteId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const state = simpleQuoteState({ ...input, docCount: docs.data?.length ?? 0 });
  const { openWith } = useAiPanel();
  const { visibleAgentIds } = useVisibleAgents();
  const timothyOk = visibleAgentIds.has("sales");
  const [cmd, setCmd] = useState("");
  const [expertOpen, setExpertOpen] = useState(false);

  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const act = (a: NextAction) => {
    if (a === "save") return onSave();
    if (a === "timothy" && timothyOk) return go("egyszeru-timothy");
    go({ documents: "egyszeru-dokumentumok", basics: "egyszeru-alapadatok", timothy: "egyszeru-timothy", review: "egyszeru-ellenorzes", followup: "egyszeru-utankovetes", save: "" }[a]);
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <ol aria-label="Ajánlat lépései" className="grid grid-cols-3 gap-2">
        {SIMPLE_STEPS.map((s) => {
          const done = state.done || s.n < state.step;
          const current = !state.done && s.n === state.step;
          return (
            <li key={s.n} aria-current={current ? "step" : undefined}
              className={`rounded-lg border p-2 text-center sm:p-3 ${current ? "border-primary bg-primary/10" : done ? "border-primary/30" : "bg-muted/30"}`}>
              <span className={`mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${done || current ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                {done ? <Check className="h-4 w-4" /> : s.n}
              </span>
              <span className="block text-[11px] font-medium leading-tight sm:text-sm">{s.label}</span>
            </li>
          );
        })}
      </ol>

      <div role="status" className="flex flex-col gap-3 rounded-xl border border-primary/40 bg-primary/10 p-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Következő teendő</p>
          <p className="mt-0.5 font-display text-base font-semibold">{state.next.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{state.next.hint}</p>
        </div>
        <Button onClick={() => act(state.next.action)} disabled={state.next.action === "save" && saving} className="shrink-0">
          {state.next.button} <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <section id="egyszeru-dokumentumok" aria-labelledby="h-egyszeru-1" className="min-w-0 scroll-mt-40 space-y-4 rounded-xl border p-4">
          <h2 id="h-egyszeru-1" className="flex items-center gap-2 font-display text-base font-semibold"><FileUp className="h-4 w-4 text-primary" /> 1. Ajánlatkérés és dokumentumok</h2>
          <div id="egyszeru-alapadatok" className="scroll-mt-40">{basics}</div>
          {documents}
        </section>

        <section id="egyszeru-timothy" aria-labelledby="h-egyszeru-2" className="min-w-0 scroll-mt-40 space-y-3 rounded-xl border p-4">
          <h2 id="h-egyszeru-2" className="flex items-center gap-2 font-display text-base font-semibold"><Sparkles className="h-4 w-4 text-primary" /> 2. Utasítás Timothynak</h2>
          {timothyOk ? <>
            <p className="text-sm text-muted-foreground">Timothy automatikusan látja ezt az ajánlatot, az ügyfelet és a dokumentumokat — a saját jogosultságoddal. Árat csak jóváhagyott forrásból használ; minden módosítást te hagysz jóvá.</p>
            <div className="flex flex-wrap gap-2">
              {timothyQuickCommands(input.kind).map((q) => (
                <Button key={q} type="button" variant="outline" size="sm" className="h-auto whitespace-normal py-1.5 text-left text-xs" onClick={() => openWith("sales", q)}>{q}</Button>
              ))}
            </div>
            <label htmlFor="egyszeru-timothy-input" className="sr-only">Saját utasítás Timothynak</label>
            <Textarea id="egyszeru-timothy-input" rows={3} value={cmd} onChange={(e) => setCmd(e.target.value)} maxLength={4000} placeholder="Pl. Timothy, csak az erősáramot árazzuk, jelezd a hiányokat." />
            <Button type="button" className="w-full" disabled={!cmd.trim()} onClick={() => { openWith("sales", cmd.trim()); setCmd(""); }}>Megnyitás Timothynál</Button>
            <p className="text-xs text-muted-foreground">A szöveg a Timothy-panelbe kerül; ott a Küldés gombbal indítod.</p>
          </> : <p className="text-sm text-muted-foreground">Timothy a szerepköröd számára nem érhető el. Az árazást a szakértői beállításokban végezheted.</p>}
        </section>
      </div>

      <section id="egyszeru-ellenorzes" aria-labelledby="h-egyszeru-3" className="scroll-mt-40 space-y-4 rounded-xl border p-4">
        <h2 id="h-egyszeru-3" className="flex items-center gap-2 font-display text-base font-semibold"><Check className="h-4 w-4 text-primary" /> 3. Ellenőrzés és jóváhagyás</h2>
        {review}
      </section>

      <details id="egyszeru-utankovetes" className="scroll-mt-40 rounded-xl border p-4">
        <summary className="cursor-pointer font-display text-base font-semibold">Utánkövetés és állapot</summary>
        <div className="pt-4">{followup}</div>
      </details>

      <details className="rounded-xl border bg-muted/20 p-4" open={expertOpen} onToggle={(e) => setExpertOpen((e.target as HTMLDetailsElement).open)}>
        <summary className="flex cursor-pointer items-center gap-2 font-display text-base font-semibold"><Settings2 className="h-4 w-4" /> Szakértői beállítások</summary>
        <p className="mt-1 text-xs text-muted-foreground">Óradíjak, tartalék, árrés, kalkulációs mód, tervellenőrzés, verziók és sablon. Ugyanazok a beállítások, mint a részletes nézetben.</p>
        <div className="pt-4">{expert}</div>
      </details>
    </div>
  );
}
