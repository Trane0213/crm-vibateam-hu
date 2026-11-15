import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listCampaignDrafts } from "@/lib/marketing/campaign-drafts.functions";
import { campaignOverview, CAMPAIGN_STAGE_LABEL, type CampaignStage } from "@/lib/marketing/marketing-day-flow";
import { WsPageHeader, StepBar, NextActionCard, AiSuggestionCard } from "@/components/workspace-v2/parts";
import { StatusBadge, type WsStatus } from "@/components/workspace-v2/status-badge";
import { formatDateTime } from "@/lib/format";
import { wsHead } from "@/lib/workspace-v2/head";

export const Route = createFileRoute("/_authenticated/munka/marketing/kampanyok")({
  head: () => wsHead("E-mail-kampányok", "Kampánytervezetek állapota, ellenőrzés, TESZT-küldés és ütemezés."),
  component: CampaignsPage,
});

const STEPS = ["Címzettek", "Üzenet, előnézet, TESZT", "Jóváhagyás és ütemezés"];
const STAGE_STATUS: Record<CampaignStage, WsStatus> = { draft: "missing", prechecked: "review", scheduled: "done", paused: "approval", stopped: "planned", archived: "planned" };

/** Kampányáttekintés; a szerkesztés, ellenőrzés, TESZT-küldés és ütemezés a meglévő, jóváhagyásos kampányoldalon marad. */
function CampaignsPage() {
  const list = useServerFn(listCampaignDrafts);
  const q = useQuery({ queryKey: ["campaign-drafts"], queryFn: () => list() });
  const ov = campaignOverview(q.data?.campaigns);
  const first = ov.open[0];
  return (
    <>
      <WsPageHeader title="E-mail-kampányok" subtitle="Napi 40 levél / fiók keret; ügyfélküldés külön jóváhagyással"
        right={<Button asChild size="sm"><Link to="/campaign-list" search={{}}><Plus className="h-4 w-4" />Új kampány</Link></Button>} />
      {first && <NextActionCard text={`${first.name}: ${first.next}`} action={<Button asChild size="sm"><Link to="/campaign-list" search={{ campaignId: first.id }}>Kampány szerkesztése</Link></Button>} />}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]">
          <h2 className="font-display text-base font-semibold">Nyitott kampányok ({q.isSuccess ? ov.active : "…"})</h2>
          {q.isLoading ? <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Betöltés…</div>
            : q.isError ? <p role="alert" className="py-3 text-sm text-destructive">{q.error instanceof Error ? q.error.message : "Nem tölthető be."}</p>
            : ov.open.length === 0 ? <p className="py-3 text-sm text-muted-foreground">Nincs nyitott kampánytervezet.</p>
            : (
              <ul className="mt-2 space-y-3">
                {ov.open.map((c) => (
                  <li key={c.id} className="rounded-lg border p-3">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                      <Link to="/campaign-list" search={{ campaignId: c.id }} className="min-w-0 truncate text-sm font-medium hover:underline">{c.name}</Link>
                      <StatusBadge status={STAGE_STATUS[c.stage]} label={CAMPAIGN_STAGE_LABEL[c.stage]} />
                    </div>
                    <div className="mt-2"><StepBar steps={STEPS} current={c.stage === "scheduled" ? 3 : c.step - 1} /></div>
                    <p className="mt-2 text-xs text-muted-foreground">{c.next} · frissítve: {formatDateTime(c.updated_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">Archivált: {ov.counts.archived}. Megnyitás/kattintás mérés nincs bekötve (tervezett).</p>
        </section>
        <AiSuggestionCard agent="marketing" title="Scarlet – kampány-előkészítés"
          lines={["Célcsoport- és tárgysor-javaslat", "Szövegtervezet a kijelölt kampányhoz", "Küldést nem indít"]}
          prompt="Javasolj a nyitott kampánytervezeteimhez következő lépést, tárgysort és rövid szövegtervezetet. Jelezd a hiányzó címzetteket vagy kizárt cégeket. Ne küldj és ne ments semmit." />
      </div>
    </>
  );
}
