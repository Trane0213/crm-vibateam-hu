// Tulajdonosi DRY-RUN nézet: levélszálak cég-összerendelési javaslatai. Semmit nem ír.
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMailRelinkReview, previewMailboxBackfill, RELINK_MAILBOXES } from "@/lib/gmail/relink-review.functions";
import type { RelinkCategory } from "@/lib/gmail/relink-analysis";

export const Route = createFileRoute("/_authenticated/import-review_/mail")({
  head: () => ({
    meta: [
      { title: "Levél–cég összerendelés ellenőrzése – VIBA CRM" },
      { name: "description", content: "A céges postafiókok levélszálainak cég-összerendelési javaslatai, csak olvasás." },
      { property: "og:title", content: "Levél–cég összerendelés ellenőrzése – VIBA CRM" },
      { property: "og:description", content: "Postafiókonkénti, bizonyítékkal ellátott összerendelési javaslatok." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MailRelinkPage,
});

const LABEL: Record<RelinkCategory | "all", string> = {
  all: "Mind", certain: "Biztosan kapcsolható", review: "Ellenőrizendő", conflict: "Ütközés",
  no_contact: "CRM-kontakt hiányzik", linked: "Már kapcsolt", internal: "Belső / teszt",
  self_other_company: "Viba-Team → másik cég", self_conflict: "Viba-Team, ellentmondásos",
  self_no_contact: "Viba-Team, nincs kontakt", self_bulk: "Viba-Team, körlevél", self_internal: "Viba-Team, valóban belső",
};

function BackfillPreview({ mailbox, gaps }: { mailbox: string; gaps: string[] }) {
  const fn = useServerFn(previewMailboxBackfill);
  const [after, setAfter] = useState(gaps[0] ?? "2026-09-07");
  const [before, setBefore] = useState("2026-10-30");
  const [res, setRes] = useState<{ query: string; listed: number; stored: number; missing: number; estimate: number | null; nextPageToken: string | null } | null>(null);
  const [tokens, setTokens] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (pageToken?: string) => {
    setBusy(true); setErr(null);
    try { const r = await fn({ data: { mailbox, after, before, pageToken } }); setRes(r); if (pageToken) setTokens(t => [...t, pageToken]); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <details className="text-sm"><summary className="cursor-pointer font-medium">Visszatöltési előnézet (DRY-RUN, Gmail-lekérdezés, semmit nem ment)</summary>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Input type="date" className="w-40" value={after} onChange={e => setAfter(e.target.value)} aria-label="Ettől" />
        <Input type="date" className="w-40" value={before} onChange={e => setBefore(e.target.value)} aria-label="Eddig" />
        <Button size="sm" variant="outline" disabled={busy} onClick={() => { setTokens([]); run(); }}>Első 100 üzenet összevetése</Button>
        {res?.nextPageToken && <Button size="sm" variant="outline" disabled={busy} onClick={() => run(res.nextPageToken!)}>Következő 100</Button>}
      </div>
      {err && <p className="text-destructive">{err}</p>}
      {res && <p className="mt-1">Lap {tokens.length + 1}: Gmail {res.listed} üzenet (becslés összesen: {res.estimate ?? "—"}), ebből tárolt {res.stored}, <b>hiányzik {res.missing}</b>. Tényleges visszatöltés csak külön tulajdonosi jóváhagyással.</p>}
    </details>
  );
}

function MailRelinkPage() {
  const [mailbox, setMailbox] = useState<string>(RELINK_MAILBOXES[0]);
  const [category, setCategory] = useState<RelinkCategory | "all">("certain");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sharedOnly, setSharedOnly] = useState(false);
  const fn = useServerFn(getMailRelinkReview);
  const q = useQuery({
    queryKey: ["mail-relink", mailbox, category, page, search, sharedOnly],
    queryFn: () => fn({ data: { mailbox, category, page, search, sharedOnly } }),
    placeholderData: keepPreviousData, staleTime: 5 * 60_000,
  });
  const d = q.data;
  const pages = d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1;
  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-2xl font-semibold">Levél–cég összerendelés ellenőrzése</h1>
        <p className="text-sm text-muted-foreground">Csak javaslat, semmi nem módosul. Pontos kontakt-email bizonyít, domain/név/tárgy nem. <Link to="/import-review" className="underline">Vissza az Adatellenőrzéshez</Link></p>
      </div>
      <div className="flex flex-wrap gap-2">
        {RELINK_MAILBOXES.map(m => <Button key={m} size="sm" variant={m === mailbox ? "default" : "outline"} onClick={() => { setMailbox(m); setPage(1); }}>{m}</Button>)}
      </div>
      {q.isLoading && <p className="text-sm text-muted-foreground">Elemzés folyamatban (nagy postafióknál fél percig is tarthat)…</p>}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {d && (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">Állapot – {d.mailbox}</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1">
              <p>{d.threads} szál, {d.messages} saját tárolt levél; {d.replied} szálban jött válasz kimenő megkeresésre; {d.selfLinked} szál a saját Viba-Team céghez mentve (nem számít helyes kapcsolásnak); {d.sharedThreads} szál másik céges postafiókban is.</p>
              <p>Utolsó szinkron: {d.lastSyncAt ? new Date(d.lastSyncAt).toLocaleString("hu-HU", { timeZone: "Europe/Budapest" }) : "—"}{d.authError ? " · engedélyezési hiba!" : ""}. A friss szinkron nem bizonyít teljes történeti lefedettséget.</p>
              <p>Szinkronhibák (utolsó {d.syncErrors.runsChecked} futás): {d.syncErrors.total} valódi hiba, ebből {d.syncErrors.http404} db 404; {d.syncErrors.crmReviewNotes} csak CRM-ellenőrzési jelzés.</p>
              {d.syncErrors.latest.length > 0 && <details><summary className="cursor-pointer">Legutóbbi hibák</summary><ul className="text-xs">{d.syncErrors.latest.map((e, i) => <li key={i}>{new Date(e.at).toLocaleString("hu-HU", { timeZone: "Europe/Budapest" })}: {e.error}</li>)}</ul></details>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Történeti lefedettség (tárolt levelek hetente)</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              <p>Első tárolt hét: {d.coverage.firstWeek ?? "—"} · utolsó: {d.coverage.lastWeek ?? "—"} · üres hetek: {d.coverage.gaps.length}. Üres hét a CRM-ben hiányt jelez; Gmail-oldali hiány csak az előnézettel igazolható.</p>
              {d.coverage.gaps.length > 0 && <ul className="text-xs">{d.coverage.gaps.map(g => <li key={g.week}>{g.week}: 0 tárolt levél · szinkronminta {g.sampleRunAt ? new Date(g.sampleRunAt).toLocaleString("hu-HU", { timeZone: "Europe/Budapest" }) : "nincs futás"}{g.invalidGrant ? " · invalid_grant (lejárt Google-engedély)" : ""}</li>)}</ul>}
              <details><summary className="cursor-pointer text-xs">Heti bontás</summary><p className="text-xs">{d.coverage.weeks.map(w => `${w.week}: ${w.messages}`).join(" · ")}</p></details>
              <BackfillPreview key={d.mailbox} mailbox={d.mailbox} gaps={d.coverage.gaps.map(g => g.week)} />
            </CardContent>
          </Card>
          <div className="flex flex-wrap gap-2 items-center">
            {(Object.keys(LABEL) as (RelinkCategory | "all")[]).map(c => (
              <Button key={c} size="sm" variant={c === category ? "default" : "outline"} onClick={() => { setCategory(c); setPage(1); }}>
                {LABEL[c]}{c !== "all" ? ` (${d.counts[c]})` : ""}
              </Button>
            ))}
            <Input className="max-w-xs" placeholder="Keresés tárgyban / címben" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
            <Button size="sm" variant={sharedOnly ? "default" : "outline"} onClick={() => { setSharedOnly(v => !v); setPage(1); }}>Csak több postafiókban közös</Button>
          </div>
          <div className="space-y-2">
            {d.rows.map(r => (
              <Card key={r.thread_id}><CardContent className="p-3 text-sm space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{LABEL[r.category]}</Badge>
                  {r.replied && <Badge>Válasz érkezett</Badge>}
                  {r.other_mailboxes.map(m => <Badge key={m} variant="secondary">{m} is</Badge>)}
                  <Link to="/emails/$threadId" params={{ threadId: r.thread_id }} className="font-medium underline">{r.subject}</Link>
                </div>
                <p className="text-muted-foreground">{r.outbound} kimenő / {r.inbound} bejövő · {r.external.join(", ")}</p>
                <p>Mentett cég: {r.saved_company_id ? <Link to="/customers/$id" params={{ id: r.saved_company_id }} className="underline">{r.saved_company_name ?? r.saved_company_id}</Link> : "—"}
                  {" · "}Javaslat: {r.suggested_company_id ? <Link to="/customers/$id" params={{ id: r.suggested_company_id }} className="underline">{r.suggested_company_name ?? r.suggested_company_id}</Link> : "—"}</p>
                <ul className="text-xs text-muted-foreground list-disc pl-4">{r.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
              </CardContent></Card>
            ))}
            {d.rows.length === 0 && <p className="text-sm text-muted-foreground">Nincs találat.</p>}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Előző</Button>
            <span className="text-sm">{page} / {pages} oldal · {d.total} szál</span>
            <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Következő</Button>
          </div>
        </>
      )}
    </div>
  );
}
