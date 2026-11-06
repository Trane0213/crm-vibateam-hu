// Kampány-tervezet DRY-RUN ellenőrzés. NEM ÉLES KAMPÁNYMENTÉS, nincs küldés, semmi nem íródik.
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { precheckCampaign } from "@/lib/marketing/campaign-precheck.functions";
import type { EligibilityStatus } from "@/lib/marketing/campaign-eligibility";

const LABEL: Record<EligibilityStatus | "all", string> = {
  all: "Mind", ready: "Kész előkészítésre", contacted: "Már megkeresett", replied: "Válasz érkezett",
  uncertain: "CRM/adatkapcsolat bizonytalan", invalid: "Hibás/tiltott cím",
};

export function CampaignDraftPrecheck({ companyIds }: { companyIds: string[] }) {
  const fn = useServerFn(precheckCampaign);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [ids, setIds] = useState<string[] | null>(null);
  const [status, setStatus] = useState<EligibilityStatus | "all">("ready");
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ["campaign-precheck", ids, status, page],
    queryFn: () => fn({ data: { companyIds: ids!, status, page } }),
    enabled: !!ids?.length, placeholderData: keepPreviousData, staleTime: 5 * 60_000,
  });
  const d = q.data;
  const pages = d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1;
  return (
    <Card><CardContent className="space-y-3 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Kampány-tervezet ellenőrzése</span>
        <Badge variant="outline">DRY-RUN · egyelőre NEM éles kampánymentés · küldés kikapcsolva</Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="Kampány neve (nem mentődik)" value={name} onChange={e => setName(e.target.value)} />
        <Input className="max-w-xs" placeholder="Célcsoport (nem mentődik)" value={target} onChange={e => setTarget(e.target.value)} />
        <Button size="sm" disabled={!companyIds.length || q.isFetching} onClick={() => { setIds(companyIds.slice(0, 2000)); setPage(1); }}>
          A szűrt {Math.min(companyIds.length, 2000)} cég kontaktjainak ellenőrzése
        </Button>
      </div>
      {q.isFetching && <p className="text-muted-foreground">Előzmények ellenőrzése a céges postafiókokban…</p>}
      {q.error && <p className="text-destructive">{(q.error as Error).message}</p>}
      {d && (<>
        <p>{name || "Névtelen tervezet"}{target ? ` · ${target}` : ""}: {d.companies} cég, {d.contacts} kontakt, {d.historyMessages} előzmény-találat.{!d.historyComplete && <b className="text-destructive"> Az előzményvizsgálat időkorlát miatt hiányos — minden nem talált cím bizonytalan.</b>}</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(LABEL) as (EligibilityStatus | "all")[]).map(s => (
            <Button key={s} size="sm" variant={s === status ? "default" : "outline"} onClick={() => { setStatus(s); setPage(1); }}>
              {LABEL[s]}{s !== "all" ? ` (${d.counts[s]})` : ""}
            </Button>
          ))}
        </div>
        <ul className="divide-y">
          {d.rows.map(r => (
            <li key={r.contact_id} className="py-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{LABEL[r.status]}</Badge>
                <span className="font-medium">{r.email || "(nincs email)"}</span>
                <span className="text-muted-foreground">{r.name}</span>
                {r.company_id && <Link to="/customers/$id" params={{ id: r.company_id }} className="underline">{r.company_name ?? "cég"}</Link>}
                {r.last_at && <span className="text-xs text-muted-foreground">utolsó: {new Date(r.last_at).toLocaleDateString("hu-HU", { timeZone: "Europe/Budapest" })}</span>}
                {r.mailboxes.map(m => <Badge key={m} variant="secondary">{m}</Badge>)}
              </div>
              {r.reasons.length > 0 && <p className="text-xs text-muted-foreground">{r.reasons.join(" ")}</p>}
            </li>
          ))}
          {d.rows.length === 0 && <li className="py-2 text-muted-foreground">Nincs találat.</li>}
        </ul>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Előző</Button>
          <span>{page} / {pages} oldal · {d.total} cím</span>
          <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Következő</Button>
          <Button size="sm" disabled title="Éles küldés csak a jogosultsági migráció és tulajdonosi jóváhagyás után">Kiküldés (kikapcsolva)</Button>
        </div>
      </>)}
    </CardContent></Card>
  );
}
