import { useState } from "react";
import { Bot, Loader2, Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { runAiSummary } from "@/lib/ai-os/summary.functions";

type Props = {
  title: string;
  description?: string;
  triggerLabel?: string;
  /** A kontextus aszinkron betöltése (sosem fut, amíg a felhasználó rá nem kattint). */
  loadContext: () => Promise<string>;
  /** A kérdés/utasítás, amit az AI-nak küldünk a kontextus mellé. */
  prompt: string;
  /** Opcionális gomb-variáns. */
  variant?: "outline" | "default" | "secondary";
  size?: "sm" | "default";
};

export function AiSummaryDialog({
  title, description, triggerLabel = "AI összefoglaló", loadContext, prompt,
  variant = "outline", size = "sm",
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setAnswer(null);
    try {
      const context = await loadContext();
      const res = await runAiSummary({ data: { context, prompt } });
      setAnswer(res.text || "(üres válasz)");
    } catch (err: any) {
      const msg = err?.message ?? "AI hiba.";
      toast.error(msg);
      setAnswer(`⚠️ Hiba: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v && !answer) run(); }}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size}>
          <Sparkles className="mr-1.5 h-3.5 w-3.5" /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" /> {title}
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          <div className="px-1 py-2">
            {busy ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Az AI az aktuális CRM adatok alapján dolgozik…
              </div>
            ) : answer ? (
              <div className="whitespace-pre-wrap text-sm leading-relaxed">{answer}</div>
            ) : (
              <p className="text-sm text-muted-foreground">Nincs még válasz.</p>
            )}
          </div>
        </ScrollArea>
        <div className="flex justify-end">
          <Button size="sm" variant="ghost" onClick={run} disabled={busy}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Újragenerálás
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}