import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAiPanel } from "@/components/ai/ai-panel";
import { useVisibleAgents } from "@/hooks/use-visible-agents";
import { timothyQuickCommands } from "@/lib/quotes/simple-workspace";

/**
 * Timothy az ajánlaton belül: a gombok csak előre kitöltik az oldalpanelt (ennek az ajánlatnak
 * a saját beszélgetésében); küldés, jóváhagyás és mentés a felhasználóé.
 */
export function QuoteTimothyHelp({ kind, step }: { kind: unknown; step: "pricing" | "offer" }) {
  const { openWith } = useAiPanel();
  const { visibleAgentIds } = useVisibleAgents();
  const [cmd, setCmd] = useState("");
  if (!visibleAgentIds.has("sales")) return null;
  return (
    <details className="rounded-md border bg-primary/[0.04] p-3">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium"><Sparkles className="h-4 w-4 text-primary" /> Timothy segít ebben a lépésben</summary>
      <p className="mt-1 text-xs text-muted-foreground">Timothy ezt az ajánlatot, az ügyfelet és a csatolt fájlokat látja, a saját jogosultságoddal. Árat nem talál ki, és fájlt nem ment helyetted: amit javasol, azt te veszed át a gombokkal.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {timothyQuickCommands(kind, step).map((q) => (
          <Button key={q} type="button" variant="outline" size="sm" className="h-auto whitespace-normal py-1.5 text-left text-xs" onClick={() => openWith("sales", q)}>{q}</Button>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <Textarea aria-label="Saját kérdés Timothynak" rows={2} value={cmd} onChange={(e) => setCmd(e.target.value)} maxLength={4000} placeholder="Saját kérdés vagy utasítás…" />
        <Button type="button" className="self-end" disabled={!cmd.trim()} onClick={() => { openWith("sales", cmd.trim()); setCmd(""); }}>Timothyhoz</Button>
      </div>
    </details>
  );
}
