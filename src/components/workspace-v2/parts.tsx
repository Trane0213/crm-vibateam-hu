import type { ReactNode } from "react";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAiPanel } from "@/components/ai/ai-panel";
import { AGENT_META } from "@/components/ai/chat-shared";
import { cn } from "@/lib/utils";

/** Lépéssáv: a kész lépések pipát kapnak, az aktuális kiemelt. */
export function StepBar({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex flex-wrap gap-1.5" aria-label="Lépések">
      {steps.map((s, i) => (
        <li key={s} aria-current={i === current ? "step" : undefined}
          className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
            i < current ? "bg-status-success/15 text-status-success" : i === current ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
          <span className="grid h-4 w-4 place-items-center rounded-full bg-background/30 text-[10px]">{i < current ? <Check className="h-3 w-3" /> : i + 1}</span>
          {s}
        </li>
      ))}
    </ol>
  );
}

/** „Következő teendő” — mindig egy mondat és legfeljebb egy fő gomb. */
export function NextActionCard({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-l-4 border-l-primary bg-card p-4 shadow-[var(--shadow-card)]">
      <p className="min-w-0 text-sm"><span className="font-semibold">Következő teendő: </span>{text}</p>
      {action}
    </div>
  );
}

/** Mutatókártya. Ha nincs érték (pl. nincs beállított cél), „nincs beállítva” látszik, nem kitalált szám. */
export function KpiCard({ label, value, tone = "default" }: { label: string; value: string | number | null; tone?: "default" | "warning" | "danger" | "success" }) {
  const toneCls = { default: "text-primary", warning: "text-status-warning", danger: "text-status-danger", success: "text-status-success" }[tone];
  return (
    <div className="min-w-0 rounded-xl border bg-card p-3 text-center shadow-[var(--shadow-card)]">
      <div className={cn("font-display text-2xl font-bold", value === null ? "text-muted-foreground text-base" : toneCls)}>{value ?? "nincs beállítva"}</div>
      <div className="truncate text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

/**
 * Ügyön belüli asszisztens (Timothy / Scarlet): az aktuális rekordot az AI-panel az URL-ből
 * ismeri; a gombok csak előtöltik a kérést, magától semmit nem küld és nem ment.
 */
export function CaseAssistant({ agent, intro, prompts }: { agent: "sales" | "marketing"; intro?: string; prompts: { label: string; text: string }[] }) {
  const { openWith } = useAiPanel();
  const meta = AGENT_META[agent];
  return (
    <section aria-label={`${meta.firstName} segítsége`} className="rounded-xl border border-primary/20 bg-accent/40 p-4">
      <div className="flex items-center gap-2">
        <img src={meta.portrait} alt="" className="h-8 w-8 rounded-full object-cover ring-2 ring-primary/30" />
        <div className="min-w-0">
          <h3 className="font-display text-sm font-semibold">{meta.firstName}</h3>
          <p className="truncate text-[11px] text-muted-foreground">{intro ?? "Ennél az ügynél segít; mentés és küldés csak jóváhagyással."}</p>
        </div>
      </div>
      <div className="mt-3 grid gap-1.5">
        {prompts.map((p) => (
          <Button key={p.label} variant="outline" size="sm" className="h-auto justify-between whitespace-normal py-1.5 text-left" onClick={() => openWith(agent, p.text)}>
            <span className="min-w-0">{p.label}</span><ArrowRight className="h-3.5 w-3.5 shrink-0" />
          </Button>
        ))}
      </div>
    </section>
  );
}

/** Napi összefoglaló kártya a Ma képernyőkön (ugyanaz az asszisztens, előtöltött kéréssel). */
export function AiSuggestionCard({ agent, title, lines, prompt, cta = "Javaslatok megnyitása" }: { agent: "sales" | "marketing"; title: string; lines: string[]; prompt: string; cta?: string }) {
  const { openWith } = useAiPanel();
  return (
    <div className="rounded-xl border border-primary/20 bg-accent/40 p-4">
      <h3 className="font-display text-sm font-semibold">{title}</h3>
      {lines.length > 0 && (
        <ul className="mt-2 space-y-1.5 text-sm">
          {lines.map((l) => <li key={l} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-status-success" /><span className="min-w-0">{l}</span></li>)}
        </ul>
      )}
      <Button className="mt-3 w-full" onClick={() => openWith(agent, prompt)}>{cta}<ArrowRight className="h-4 w-4" /></Button>
    </div>
  );
}

export function WsPageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
      <div className="min-w-0">
        <h1 className="truncate font-display text-xl font-bold sm:text-2xl">{title}</h1>
        {subtitle && <p className="truncate text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {right}
    </header>
  );
}
