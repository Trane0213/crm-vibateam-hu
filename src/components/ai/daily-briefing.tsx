import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, RefreshCw, TrendingUp, Hammer } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { runDailyBriefing } from "@/lib/ai-os/briefing.functions";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";

type Mode = "sales" | "pm";

function firstName(full: string | null | undefined, fallback?: string | null): string | null {
  const f = (full ?? "").trim();
  if (!f) return fallback?.trim() || null;
  const parts = f.split(/\s+/);
  return parts.length >= 2 ? parts[1] : parts[0];
}

export function DailyBriefing() {
  const { user } = useAuth();
  const { profile } = usePermissions();
  const name = firstName(profile?.full_name ?? null, user?.email?.split("@")[0] ?? null);
  const callBriefing = useServerFn(runDailyBriefing);

  const [mode, setMode] = useState<Mode>("sales");
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ran, setRan] = useState<{ sales: boolean; pm: boolean }>({ sales: false, pm: false });

  async function run(m: Mode) {
    setBusy(true);
    setError(null);
    setText(null);
    try {
      const res = await callBriefing({ data: { mode: m, name: name ?? null } });
      setText(res.text || "(üres válasz)");
      setRan((r) => ({ ...r, [m]: true }));
    } catch (e: any) {
      setError(e?.message ?? "AI hiba.");
    } finally {
      setBusy(false);
    }
  }

  // Auto-run sales briefing on first mount
  useEffect(() => { if (!ran.sales) run("sales"); /* eslint-disable-next-line */ }, []);

  function switchMode(m: Mode) {
    setMode(m);
    if (!ran[m]) run(m);
    else if (m !== mode) {
      // re-run is cheap; keep cached behavior: just re-run for fresh data
      run(m);
    }
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              Napi briefing
            </CardTitle>
            <CardDescription>
              {name ? `${name}, itt a mai helyzet.` : "Itt a mai helyzet."} A CRM aktuális adatai alapján.
            </CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant={mode === "sales" ? "default" : "outline"} onClick={() => switchMode("sales")} disabled={busy}>
              <TrendingUp className="mr-1.5 h-3.5 w-3.5" /> Sales
            </Button>
            <Button size="sm" variant={mode === "pm" ? "default" : "outline"} onClick={() => switchMode("pm")} disabled={busy}>
              <Hammer className="mr-1.5 h-3.5 w-3.5" /> PM
            </Button>
            <Button size="icon" variant="ghost" onClick={() => run(mode)} disabled={busy} title="Frissítés">
              <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {busy ? (
          <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> A {mode === "sales" ? "Sales" : "PM"} Agent dolgozik az aktuális CRM adatokon…
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">⚠️ {error}</p>
        ) : text ? (
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{text}</div>
        ) : (
          <p className="text-sm text-muted-foreground">Nincs még briefing.</p>
        )}
      </CardContent>
    </Card>
  );
}