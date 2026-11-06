// Kampánytervezetek: mentés, újranyitás, szerkesztés, archiválás és tárolt küldés előtti ellenőrzés.
// KÜLDÉS TILTOTT: nincs jóváhagyás, nincs kiküldés ebben a körben.
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listCampaignDrafts, saveCampaignDraft, setCampaignArchived, precheckAndStoreCampaign, getCampaignDraft } from "@/lib/marketing/campaign-drafts.functions";
import type { EligibilityStatus } from "@/lib/marketing/campaign-eligibility";

const LABEL: Record<EligibilityStatus | "all", string> = {
  all: "Mind", ready: "Kész előkészítésre", contacted: "Már megkeresett", replied: "Válasz érkezett",
  uncertain: "CRM/adatkapcsolat bizonytalan", invalid: "Hibás/tiltott cím",
};
const STATUS: Record<string, string> = { draft: "Tervezet", prechecked: "Ellenőrzött (nem küldési engedély)", archived: "Archivált" };
const fmt = (d: string | null) => (d ? new Date(d).toLocaleString("hu-HU", { timeZone: "Europe/Budapest" }) : "—");

export function CampaignDraftPrecheck({ companyIds }: { companyIds: string[] }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listCampaignDrafts);
  const saveFn = useServerFn(saveCampaignDraft);
  const archFn = useServerFn(setCampaignArchived);
  const checkFn = useServerFn(precheckAndStoreCampaign);
  const getFn = useServerFn(getCampaignDraft);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [elig, setElig] = useState<EligibilityStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);

  const list = useQuery({ queryKey: ["campaign-drafts"], queryFn: () => listFn() });
  const detail = useQuery({
    queryKey: ["campaign-draft", selected, elig, page],
    queryFn: () => getFn({ data: { id: selected!, eligibility: elig, page } }),
    enabled: !!selected, placeholderData: keepPreviousData,
  });
  const camp = detail.data?.campaign;
  useEffect(() => { if (camp) { setName(camp.name); setTarget(camp.target_group ?? ""); } }, [camp?.id, camp?.updated_at]);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["campaign-drafts"] }); qc.invalidateQueries({ queryKey: ["campaign-draft"] }); };
  const act = async (f: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await f(); toast.success(ok); refresh(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  if (list.error) return null; // nem Owner/Marketing: a panel nem jelenik meg
  const d = detail.data;
  const pages = d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1;
  const archived = camp?.status === "archived";
  const dirty = !!camp && (name.trim() !== camp.name || (target.trim() || null) !== (camp.target_group ?? null));

  return (
    <Card><CardContent className="space-y-3 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Kampánytervezetek</span>
        <Badge variant="destructive">Kiküldés tiltott</Badge>
        <select className="h-8 rounded-md border bg-background px-2" value={selected ?? ""} onChange={e => { setSelected(e.target.value || null); setPage(1); setElig("all"); if (!e.target.value) { setName(""); setTarget(""); } }} aria-label="Kampánytervezet">
          <option value="">+ Új tervezet</option>
          {(list.data?.campaigns ?? []).map(c => <option key={c.id} value={c.id}>{c.name} · {STATUS[c.status] ?? c.status}{list.data?.role === "owner" && c.created_by !== list.data.userId ? " · más felhasználóé" : ""}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input className="max-w-xs" placeholder="Kampány neve" value={name} disabled={archived} onChange={e => setName(e.target.value)} />
        <Input className="max-w-xs" placeholder="Célcsoport" value={target} disabled={archived} onChange={e => setTarget(e.target.value)} />
        <Button size="sm" disabled={busy || archived || !name.trim() || (!!camp && !dirty)} onClick={() => act(async () => {
          const r = await saveFn({ data: { id: selected, name, target_group: target } });
          setSelected(r.id);
        }, "Tervezet mentve.")}>{selected ? "Módosítás mentése" : "Tervezet mentése"}</Button>
        <span className="text-xs text-muted-foreground">
          {!selected ? "Nincs mentve." : dirty ? "Nem mentett módosítás." : `Mentve: ${fmt(camp?.updated_at ?? null)}`}
        </span>
      </div>
      {camp && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{STATUS[camp.status] ?? camp.status}</Badge>
          <span className="text-xs">Utolsó ellenőrzés: {fmt(camp.prechecked_at)}</span>
          {d?.staleness.stale && <Badge variant="destructive">Elavult ellenőrzés: {d.staleness.reasons.join(" ")}</Badge>}
          <Button size="sm" variant="outline" disabled={busy || archived || !companyIds.length} onClick={() => act(async () => {
            const r = await checkFn({ data: { id: camp.id, companyIds: companyIds.slice(0, 2000) } });
            if (!r.historyComplete) toast.warning("Az előzményvizsgálat hiányos volt — a kampány tervezet maradt.");
            if (r.skippedDuplicates) toast.info(`${r.skippedDuplicates} duplikált cím kihagyva.`);
          }, "Címzettek ellenőrizve és mentve.")}>
            Címzettek: a szűrt {Math.min(companyIds.length, 2000)} cég kontaktjainak ellenőrzése és mentése
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => archFn({ data: { id: camp.id, archived: !archived } }), archived ? "Visszaállítva tervezetbe." : "Archiválva.")}>
            {archived ? "Visszaállítás" : "Archiválás"}
          </Button>
        </div>
      )}
      {busy && <p className="text-muted-foreground">Folyamatban… (előzmények ellenőrzése a céges postafiókokban)</p>}
      {detail.error && <p className="text-destructive">{(detail.error as Error).message}</p>}
      {d && (<>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(LABEL) as (EligibilityStatus | "all")[]).map(s => (
            <Button key={s} size="sm" variant={s === elig ? "default" : "outline"} onClick={() => { setElig(s); setPage(1); }}>
              {LABEL[s]}{s !== "all" ? ` (${d.counts[s]})` : ""}
            </Button>
          ))}
        </div>
        <ul className="divide-y">
          {d.rows.map(r => (
            <li key={r.contact_id} className="py-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{LABEL[r.eligibility]}</Badge>
                <span className="font-medium">{r.email || "(nincs email)"}</span>
                <span className="text-muted-foreground">{r.name}</span>
                {r.company_id && <Link to="/customers/$id" params={{ id: r.company_id }} className="underline">{r.company_name ?? "cég"}</Link>}
                {r.last_at && <span className="text-xs text-muted-foreground">utolsó előzmény: {new Date(r.last_at).toLocaleDateString("hu-HU", { timeZone: "Europe/Budapest" })}</span>}
              </div>
              {r.reasons.length > 0 && <p className="text-xs text-muted-foreground">{r.reasons.join(" ")}</p>}
            </li>
          ))}
          {d.rows.length === 0 && <li className="py-2 text-muted-foreground">Nincs tárolt címzett ebben a csoportban.</li>}
        </ul>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Előző</Button>
          <span>{page} / {pages} oldal · {d.total} cím</span>
          <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Következő</Button>
          <Button size="sm" disabled title="Ebben a körben a kiküldés tiltott">Kiküldés (tiltott)</Button>
        </div>
      </>)}
    </CardContent></Card>
  );
}
