import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Play, ScanSearch, ShieldAlert, Bot } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { aiReviewCollectNow, aiReviewOverview, aiReviewRunNow, aiReviewUpdateConfig } from "@/lib/ai-review/ai-review.functions";
import { AREA_LABEL, type ReviewAgent } from "@/lib/ai-review/model";
import { OrgSignalsPanel } from "@/components/george/org-signals-panel";
import { isOrgDomain, type OrgDomain } from "@/lib/george/org-signals";

export const Route = createFileRoute("/_authenticated/settings/ai-review")({
  head: () => ({ meta: [
    { title: "Automatikus AI-felülvizsgálat | VIBA CRM" },
    { name: "description", content: "Óránkénti, AI nélküli változásfigyelés és George célzott szakértői vizsgálata jóváhagyott kereten belül." },
    { property: "og:title", content: "Automatikus AI-felülvizsgálat | VIBA CRM" },
    { property: "og:description", content: "Változásfigyelés, súlyos jelzések, költségkeret és vizsgálati előzmények." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  // `?domain=`: a George-jelzések területszűrőjének kezdőértéke (pl. a Mai vezetői munka „átadás” linkjéről).
  validateSearch: (s: Record<string, unknown>): { domain?: OrgDomain } => (isOrgDomain(s.domain) ? { domain: s.domain } : {}),
  component: AiReviewPage,
});

const SEV: Record<string, { label: string; variant: "destructive" | "secondary" | "outline" }> = {
  critical: { label: "Súlyos", variant: "destructive" }, warning: { label: "Figyelmeztetés", variant: "secondary" }, info: { label: "Tájékoztató", variant: "outline" },
};
const REVIEW_STATUS: Record<string, string> = { pending: "Vizsgálatra vár", in_review: "Vizsgálat alatt", reviewed: "Megvizsgálva", failed: "Sikertelen — kézi döntés", not_needed: "Csak nyilvántartva (AI nem szükséges)", resolved: "Megszűnt" };
const RUN_STATUS: Record<string, string> = { running: "Fut", ok: "Kész", skipped: "Kihagyva", error: "Hiba", paused: "Szüneteltetve" };
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString("hu-HU", { timeZone: "Europe/Budapest" }) : "—");
const num = (n: number) => n.toLocaleString("hu-HU");

function AiReviewPage() {
  const { domain } = Route.useSearch();
  const qc = useQueryClient();
  const overview = useServerFn(aiReviewOverview);
  const save = useServerFn(aiReviewUpdateConfig);
  const collect = useServerFn(aiReviewCollectNow);
  const review = useServerFn(aiReviewRunNow);
  const q = useQuery({ queryKey: ["ai-review"], queryFn: () => overview() });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["ai-review"] });

  const cfg = q.data?.config;
  const [form, setForm] = useState({ enabled: false, dailyReviewLimit: 6, dailyTokenLimit: 1500000, maxReviewsPerRun: 1, confirmBudget: false });
  useEffect(() => {
    if (cfg) setForm({ enabled: cfg.enabled, dailyReviewLimit: cfg.daily_review_limit, dailyTokenLimit: cfg.daily_token_limit, maxReviewsPerRun: cfg.max_reviews_per_run, confirmBudget: false });
  }, [cfg]);

  const saveM = useMutation({
    mutationFn: (resume: boolean) => save({ data: { ...form, resume } }),
    onSuccess: (_r, resume) => { toast.success(resume ? "Az AI-vizsgálat újra indítható." : "Beállítás mentve."); refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "A mentés nem sikerült."),
  });
  const collectM = useMutation({
    mutationFn: () => collect(),
    onSuccess: (r) => { toast.success(r.status === "locked" ? "Egy ellenőrzés épp fut, próbáld újra egy perc múlva." : `Ellenőrzés kész: ${r.new ?? 0} új jelzés, ${r.resolved ?? 0} megszűnt. AI-hívás: 0.`); refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Az ellenőrzés nem futott le."),
  });
  const reviewM = useMutation({
    mutationFn: () => review(),
    onSuccess: (r) => {
      const msg = r.status === "no_change" ? "Nincs vizsgálandó jelzés — AI-hívás nem indult."
        : r.status === "budget" ? "A napi keret elfogyott vagy szüneteltetve van — AI-hívás nem indult."
        : r.status === "paused" ? "AI-kredit vagy rate-limit hiba: a vizsgálat biztonságosan leállt."
        : `${r.llmReviews} George-vizsgálat kész (${num(r.tokens)} token). Az eredmény a közös hibajegyzékben látható.`;
      (r.status === "paused" ? toast.error : toast.success)(msg); refresh();
    },
    onError: (e) => { toast.error(e instanceof Error ? e.message : "A vizsgálat nem futott le."); refresh(); },
  });

  const signals = q.data?.signals ?? [];
  const groups = useMemo(() => {
    const g = new Map<string, typeof signals>();
    for (const s of signals) { const k = s.agent as string; g.set(k, [...(g.get(k) ?? []), s]); }
    return [...g.entries()];
  }, [signals]);
  const pendingCount = signals.filter((s) => s.review_status === "pending" && s.severity !== "info").length;
  const criticalOpen = signals.filter((s) => s.severity === "critical" && ["pending", "in_review", "failed"].includes(s.review_status)).length;

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Betöltés…</p>;
  if (q.isError || !cfg) return <div className="space-y-6"><p className="text-sm text-destructive">{q.error instanceof Error ? q.error.message : "Az állapot nem tölthető be."}</p><OrgSignalsPanel initialDomain={domain} /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold"><ScanSearch className="h-5 w-5" /> Automatikus AI-felülvizsgálat</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Óránként egy <b>AI nélküli, ingyenes</b> ellenőrzés nézi végig a változásokat (lejárt lépések, bizonyíték nélküli küldés, feldolgozatlan kérések, hibák, bejelentések).
          Ha nincs érdemi változás, nem indul AI-hívás. Vizsgálandó jelzésnél George csak az érintett szakértőt kérdezi meg, és az eredmény a közös hibajegyzékbe kerül.
          A jelzés gyanú, nem igazolt hiba. Üzleti adatot, jogosultságot nem módosít, nem küld és nem publikál.
        </p>
      </div>

      {cfg.paused_reason && (
        <Card className="border-destructive">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm">
            <span className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-destructive" /> Az AI-vizsgálat szüneteltetve ({fmt(cfg.paused_at)}): AI-kredit vagy rate-limit hiba. Az AI nélküli ellenőrzés tovább fut.</span>
            <Button size="sm" variant="outline" onClick={() => saveM.mutate(true)} disabled={saveM.isPending}>Egyenleg rendben — folytatás</Button>
          </CardContent>
        </Card>
      )}

      <OrgSignalsPanel initialDomain={domain} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bekapcsolás és költségkeret</CardTitle>
            <CardDescription>Az óránkénti ellenőrzés alapból kikapcsolt. Bekapcsoláshoz jóvá kell hagyni a napi AI-keretet.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="ai-review-enabled">Óránkénti automatikus ellenőrzés (AI nélkül)</Label>
              <Switch id="ai-review-enabled" checked={form.enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))} />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1"><Label htmlFor="ai-review-daily">George-vizsgálat / nap</Label><Input id="ai-review-daily" type="number" min={1} max={48} value={form.dailyReviewLimit} onChange={(e) => setForm((f) => ({ ...f, dailyReviewLimit: Number(e.target.value) }))} /></div>
              <div className="space-y-1"><Label htmlFor="ai-review-tokens">Token / nap</Label><Input id="ai-review-tokens" type="number" min={10000} max={20000000} step={10000} value={form.dailyTokenLimit} onChange={(e) => setForm((f) => ({ ...f, dailyTokenLimit: Number(e.target.value) }))} /></div>
              <div className="space-y-1"><Label htmlFor="ai-review-run">Vizsgálat / indítás</Label><Input id="ai-review-run" type="number" min={1} max={4} value={form.maxReviewsPerRun} onChange={(e) => setForm((f) => ({ ...f, maxReviewsPerRun: Number(e.target.value) }))} /></div>
            </div>
            {form.enabled && (
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={form.confirmBudget} onCheckedChange={(v) => setForm((f) => ({ ...f, confirmBudget: v === true }))} />
                <span>Jóváhagyom ezt a napi keretet. Elérésekor aznap több AI-vizsgálat nem indul.</span>
              </label>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" onClick={() => saveM.mutate(false)} disabled={saveM.isPending || (form.enabled && !form.confirmBudget)}>{saveM.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Mentés</Button>
              <span className="text-xs text-muted-foreground">Állapot: {cfg.enabled ? "BEKAPCSOLVA" : "KIKAPCSOLVA"}{cfg.approved_at ? ` · jóváhagyva ${fmt(cfg.approved_at)}` : ""}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mai felhasználás és indítás</CardTitle>
            <CardDescription>A gombok kézzel is indíthatók, bekapcsolt automatizmus nélkül is.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="outline">George-vizsgálat ma: {q.data!.usage.reviewsToday} / {cfg.daily_review_limit}</Badge>
              <Badge variant="outline">Token ma: {num(q.data!.usage.tokensToday)} / {num(cfg.daily_token_limit)}</Badge>
              <Badge variant={criticalOpen ? "destructive" : "outline"}>Nyitott súlyos jelzés: {criticalOpen}</Badge>
              <Badge variant="secondary">Vizsgálatra vár: {pendingCount}</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => collectM.mutate()} disabled={collectM.isPending || reviewM.isPending}>
                {collectM.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanSearch className="mr-2 h-4 w-4" />}Ellenőrzés most (AI nélkül)
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" disabled={reviewM.isPending || collectM.isPending || !!cfg.paused_reason}>
                    {reviewM.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}George célzott vizsgálata
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>George célzott vizsgálata</AlertDialogTitle>
                    <AlertDialogDescription>
                      Legfeljebb {cfg.max_reviews_per_run} fizetős AI-vizsgálat indul (OpenAI), csak a vizsgálatra váró jelzésekre, az érintett szakértővel.
                      Egy vizsgálat néhány percig is tarthat. Az eredmény hibajegyként a közös hibajegyzékbe kerül; üzleti adat nem változik. Az elhasznált token nem visszavonható.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Mégse</AlertDialogCancel>
                    <AlertDialogAction onClick={() => reviewM.mutate()}>Vizsgálat indítása</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            {reviewM.isPending && <p className="text-xs text-muted-foreground">George vizsgál és egyeztet a szakértővel… ne zárd be az oldalt.</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Jelzéstábla területenként (óránkénti, AI nélküli gyűjtő)</CardTitle>
          <CardDescription>Ismétlődő jelzés a korábbihoz kapcsolódik (észlelésszám). Megszűnt állapot automatikusan lezárul.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!groups.length && <p className="text-sm text-muted-foreground">Még nincs jelzés. Futtasd az „Ellenőrzés most” gombot.</p>}
          {groups.map(([agent, list]) => (
            <div key={agent} className="space-y-1">
              <div className="text-sm font-medium">{AREA_LABEL[agent as ReviewAgent] ?? agent} · {list.length}</div>
              <ul className="divide-y rounded-md border text-sm">
                {list.slice(0, 40).map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span className="flex min-w-0 items-center gap-2"><Badge variant={SEV[s.severity]?.variant ?? "outline"}>{SEV[s.severity]?.label ?? s.severity}</Badge><span className="truncate">{s.title}</span></span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {REVIEW_STATUS[s.review_status] ?? s.review_status} · {s.occurrences}× · utoljára {fmt(s.last_seen_at)}
                      {s.issue_id && <> · <Link to="/help" search={{ from: "/settings/ai-review", issue: s.issue_id }} className="underline">hibajegy</Link></>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Legutóbbi futások</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y rounded-md border text-sm">
              {(q.data!.runs ?? []).map((r) => (
                <li key={r.id} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                  <span>{r.kind === "collect" ? "Ellenőrzés (AI nélkül)" : "George-vizsgálat"} · {r.trigger === "cron" ? "óránkénti" : "kézi"} · {RUN_STATUS[r.status] ?? r.status}</span>
                  <span className="text-xs text-muted-foreground">{fmt(r.started_at)} · jelzés {r.signal_count} (új {r.new_signal_count}) · AI {r.llm_reviews} · {num(r.tokens_used)} token</span>
                </li>
              ))}
              {!q.data!.runs.length && <li className="px-3 py-2 text-muted-foreground">Még nem volt futás.</li>}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">AI-felhasználás modellenként (minden AI-futás)</CardTitle>
            <CardDescription>Tokenben mérve; a pénzbeli költség az OpenAI-számlán ellenőrizhető.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y rounded-md border text-sm">
              {Object.entries(q.data!.perModel).map(([model, m]) => (
                <li key={model} className="flex flex-wrap justify-between gap-2 px-3 py-2"><span className="font-mono text-xs">{model}</span><span className="text-xs text-muted-foreground">ma {num(m.tokensToday)} · 30 nap {num(m.tokens30d)} token · {m.runs} futás</span></li>
              ))}
              {!Object.keys(q.data!.perModel).length && <li className="px-3 py-2 text-muted-foreground">Nincs AI-futás az elmúlt 30 napban.</li>}
            </ul>
          </CardContent>
        </Card>
      </div>
      <p className="text-xs text-muted-foreground"><Play className="mr-1 inline h-3 w-3" />Az óránkénti ellenőrzés a CRM adatbázisán belül fut; a fizetős George-vizsgálat jelenleg kézzel indul.</p>
    </div>
  );
}
