// Kampánytervezetek: mentés, újranyitás, szerkesztés, archiválás és tárolt küldés előtti ellenőrzés.
// KÜLDÉS TILTOTT: nincs jóváhagyás, nincs kiküldés ebben a körben.
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { campaignPreview, explicitContactIds } from "@/lib/marketing/campaign-preparation";
import { ContactProvenanceSummary } from "@/components/customers/contact-provenance";
import { listCampaignDrafts, saveCampaignDraft, setCampaignArchived, precheckAndStoreCampaign, getCampaignDraft, addCampaignTargetCompany } from "@/lib/marketing/campaign-drafts.functions";
import { CampaignTestControl } from "@/components/marketing/campaign-test-control";
import type { EligibilityStatus } from "@/lib/marketing/campaign-eligibility";
import { campaignEntryContacts } from '@/lib/marketing/campaign-entry';
import { GmailDraftPicker } from './gmail-draft-picker';
import { CampaignHtmlPreview } from './campaign-html-preview';
import { detachGmailCampaignSource } from '@/lib/marketing/gmail-drafts.functions';

const LABEL: Record<EligibilityStatus | "all", string> = {
  all: "Mind", ready: "Kész előkészítésre", contacted: "Már megkeresett", replied: "Válasz érkezett",
  uncertain: "CRM/adatkapcsolat bizonytalan", invalid: "Hibás/tiltott cím",
};
const STATUS: Record<string, string> = { draft: "Tervezet", prechecked: "Ellenőrzött (nem küldési engedély)", archived: "Archivált" };
const fmt = (d: string | null) => (d ? new Date(d).toLocaleString("hu-HU", { timeZone: "Europe/Budapest" }) : "—");

export function CampaignDraftPrecheck({ companyIds, candidates, entryContactId, entryCompanyId }: { companyIds: string[]; entryContactId?: string; entryCompanyId?: string; candidates: { id:string; name:string|null; email:string|null; company_id:string; company_name:string }[] }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listCampaignDrafts);
  const saveFn = useServerFn(saveCampaignDraft);
  const archFn = useServerFn(setCampaignArchived);
  const checkFn = useServerFn(precheckAndStoreCampaign);
  const getFn = useServerFn(getCampaignDraft);
  const addTargetFn = useServerFn(addCampaignTargetCompany);
  const detachFn = useServerFn(detachGmailCampaignSource);
  const [detachConfirmed, setDetachConfirmed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [contactIds, setContactIds] = useState<string[]>([]);
  const [previewId,setPreviewId] = useState<string|null>(null);
  const [elig, setElig] = useState<EligibilityStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const initialized = useRef<string|null>(null);
  const entryApplied = useRef<string | null>(null);

  const list = useQuery({ queryKey: ["campaign-drafts"], queryFn: () => listFn() });
  const detail = useQuery({
    queryKey: ["campaign-draft", selected, elig, page],
    queryFn: () => { if (!selected) throw new Error("Nincs kijelölt tervezet."); return getFn({ data: { id: selected, eligibility: elig, page } }); },
    enabled: !!selected, placeholderData: previous => previous?.campaign.id === selected ? previous : undefined,
  });
  const camp = detail.data?.campaign.id === selected ? detail.data.campaign : undefined;
  const choices = [...new Map([...(detail.data?.savedCandidates ?? []),...candidates].map(c=>[c.id,c])).values()];
  useEffect(()=>{ if(camp && initialized.current!==camp.id){ initialized.current=camp.id;setContactIds([...new Set([...(detail.data?.savedCandidates ?? []).map(c=>c.id), ...campaignEntryContacts(entryContactId, entryCompanyId, candidates)])]); } },[camp?.id]);
  useEffect(() => {
    const ids = campaignEntryContacts(entryContactId, entryCompanyId, candidates);
    const key = `${selected ?? 'new'}:${entryContactId ?? ''}:${entryCompanyId ?? ''}`;
    if (!ids.length || entryApplied.current === key) return;
    entryApplied.current = key;
    setContactIds(previous => [...new Set([...previous, ...ids])]);
  }, [entryContactId, entryCompanyId, candidates, selected]);
  useEffect(() => { if (camp) { setName(camp.name); setTarget(camp.target_group ?? ""); setSubject(camp.message_subject ?? ""); setBody(camp.message_body ?? ""); } }, [camp?.id, camp?.updated_at]);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["campaign-drafts"] }); qc.invalidateQueries({ queryKey: ["campaign-draft"] }); };
  const act = async (f: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await f(); toast.success(ok); refresh(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  if (list.error) return null; // nem Owner/Marketing: a panel nem jelenik meg
  const d = camp ? detail.data : undefined;
  const pages = d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1;
  const archived = camp?.status === "archived";
  const sourceLocked = !!camp?.gmail_draft_source;
  const dirty = !!camp && (name.trim() !== camp.name || (target.trim() || null) !== (camp.target_group ?? null) || subject !== (camp.message_subject ?? "") || body !== (camp.message_body ?? ""));
  const picked = explicitContactIds(contactIds,choices.map(c=>c.id));
  const selectedCompanyIds = [...new Set(choices.filter(c=>picked.includes(c.id)).map(c=>c.company_id))];
  const previewRow = d?.rows.find(r=>r.contact_id===previewId);
  const preview = camp && previewRow ? campaignPreview(camp.message_subject ?? "",camp.message_body ?? "",previewRow) : null;

  return (
    <Card><CardContent className="space-y-3 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Kampánytervezetek</span>
        <Badge variant="destructive">Kiküldés tiltott</Badge>
        <select disabled={busy} className="h-8 max-w-full rounded-md border bg-background px-2" value={selected ?? ""} onChange={e => { initialized.current=null;setContactIds([]);setSelected(e.target.value || null); setPage(1); setElig("all"); setPreviewId(null); if (!e.target.value) { setName(""); setTarget(""); setSubject(""); setBody(""); } }} aria-label="Kampánytervezet">
          <option value="">+ Új tervezet</option>
          {(list.data?.campaigns ?? []).map(c => <option key={c.id} value={c.id}>{c.name} · {STATUS[c.status] ?? c.status}{list.data?.role === "owner" && c.created_by !== list.data.userId ? " · más felhasználóé" : ""}</option>)}
        </select>
      </div>
      {camp && entryCompanyId && <Button size="sm" variant="outline" disabled={busy || archived || dirty || camp.target_company_ids?.includes(entryCompanyId)} onClick={() => act(async () => {
        await addTargetFn({ data: { campaignId: camp.id, companyId: entryCompanyId, expectedUpdatedAt: camp.updated_at } });
        qc.invalidateQueries({ queryKey: ['email_campaign_recipients'] });
      }, 'Cég mentve a kampány célcégei közé; címzettküldés nem történt.')}>
        {camp.target_company_ids?.includes(entryCompanyId) ? 'Cég már mentett kampánycél' : 'Kiválasztott cég mentése kampánycélként'}
      </Button>}
      {!!d?.targetCompanies?.length && <section className="space-y-1 border-y py-2"><h3 className="font-medium">Mentett célcégek · {d.targetCompanies.length}</h3>{d.targetCompanies.map(company => <p key={company.id} className="text-xs"><Link to="/customers/$id" params={{ id: company.id }} className="text-primary underline">{company.name}</Link>{company.marketing_blocked && ' · Cégszintű marketingtiltás'} · A célcég nem küldési jogosultság.</p>)}</section>}
      <div className="flex flex-wrap items-center gap-2">
        <Input className="max-w-xs" placeholder="Kampány neve" value={name} disabled={archived || busy} onChange={e => setName(e.target.value)} />
        <Input className="max-w-xs" placeholder="Célcsoport" value={target} disabled={archived || busy} onChange={e => setTarget(e.target.value)} />
        <Button size="sm" disabled={busy || (selected && !camp) || archived || !name.trim() || (!!camp && !dirty)} onClick={() => act(async () => {
          const r = await saveFn({ data: { id: selected, expectedUpdatedAt: camp?.updated_at ?? null, name, target_group: target, message_subject: subject, message_body: body } });
          setSelected(r.id);
        }, "Tervezet mentve.")}>{selected ? "Módosítás mentése" : "Tervezet mentése"}</Button>
        <span className="text-xs text-muted-foreground">
          {!selected ? "Nincs mentve." : dirty ? "Nem mentett módosítás." : `Mentve: ${fmt(camp?.updated_at ?? null)}`}
        </span>
      </div>
      <div className="space-y-2">
        <label className="block">Tárgy<Input aria-label="Kampányüzenet tárgya" value={subject} maxLength={500} disabled={archived || busy || sourceLocked} onChange={e=>setSubject(e.target.value)} /></label>
        <label className="block">Üzenet<Textarea aria-label="Kampányüzenet szövege" value={body} maxLength={20000} disabled={archived || busy || sourceLocked} rows={5} onChange={e=>setBody(e.target.value)} /></label>
      </div>
      {sourceLocked && camp && <section className="space-y-2 border-y py-3">
        <h3 className="font-medium">Mentett Gmail-piszkozatmásolat</h3>
        <p className="break-all text-xs text-muted-foreground">{String(camp.gmail_draft_source?.mailbox ?? '')} · {String(camp.gmail_draft_source?.draft_id ?? '')} · {fmt(String(camp.gmail_draft_source?.read_at ?? ''))}</p>
        {camp.message_html && <CampaignHtmlPreview html={camp.message_html} />}
        <label className="flex items-start gap-2"><Checkbox checked={detachConfirmed} disabled={busy || archived || dirty || !body.trim()} onCheckedChange={v => setDetachConfirmed(v === true)} />Csak a szöveges változatot tartom meg, a HTML és forráskapcsolat leválasztását jóváhagyom</label>
        <Button size="sm" variant="outline" disabled={busy || archived || dirty || !detachConfirmed || !body.trim()} onClick={() => act(async () => { await detachFn({ data: { campaignId: camp.id, revision: camp.updated_at, confirmed: true } }); setDetachConfirmed(false); }, 'Szöveges tervezetre váltva; a Gmail-piszkozat változatlan.')}>Váltás szöveges tervezetre</Button>
      </section>}
      <GmailDraftPicker key={`${selected ?? 'new'}:${camp?.updated_at ?? ''}`} plainCopyDisabled={sourceLocked} campaign={camp ? { id: camp.id, revision: camp.updated_at } : undefined} onImported={() => { refresh(); toast.success('Teljes piszkozatmásolat mentve; címzettek és Gmail változatlanok.'); }} disabled={busy || !!archived || !!dirty || (!camp && (!!subject || !!body))} onCopy={copy => { setSubject(copy.subject); setBody(copy.body); setPreviewId(null); toast.info('Szöveges változat átvéve; a tervezet még nincs mentve.'); }} />
      {choices.length>0 && <fieldset disabled={busy || archived} className="space-y-2"><legend className="font-medium">Kontaktkijelölés · {picked.length} címzett</legend>
        <div className="max-h-52 overflow-auto divide-y">{choices.map(c=><label key={c.id} className="flex items-start gap-2 py-2"><Checkbox checked={picked.includes(c.id)} aria-label={`${c.email ?? c.name ?? c.id} kampánykontakt`} onCheckedChange={v=>setContactIds(prev=>v===true ? [...new Set([...prev,c.id])] : prev.filter(id=>id!==c.id))}/><span className="min-w-0 break-words">{c.company_name} · {c.email ?? "Nincs email"} · {c.name}</span></label>)}</div>
      </fieldset>}
      {camp && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{STATUS[camp.status] ?? camp.status}</Badge>
          <span className="text-xs">Utolsó ellenőrzés: {fmt(camp.prechecked_at)}</span>
          {d?.staleness.stale && <Badge variant="destructive">Elavult ellenőrzés: {d.staleness.reasons.join(" ")}</Badge>}
          <Button size="sm" variant="outline" disabled={busy || archived || dirty || !picked.length || selectedCompanyIds.length>2000} onClick={() => act(async () => {
            const r = await checkFn({ data: { id: camp.id, companyIds:selectedCompanyIds, contactIds:picked, expectedUpdatedAt:camp.updated_at } });
            if (!r.historyComplete) toast.warning("Az előzményvizsgálat hiányos volt — a kampány tervezet maradt.");
            if (r.skippedDuplicates) toast.info(`${r.skippedDuplicates} duplikált cím kihagyva.`);
          }, "Címzettek ellenőrizve és mentve.")}>
            {picked.length} kijelölt kontakt ellenőrzése és mentése
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => archFn({ data: { id: camp.id, archived: !archived, expectedUpdatedAt:camp.updated_at } }), archived ? "Visszaállítva tervezetbe." : "Archiválva.")}>
            {archived ? "Visszaállítás" : "Archiválás"}
          </Button>
        </div>
      )}
      {selectedCompanyIds.length>2000 && <p className="text-destructive">Legfeljebb 2000 cég ellenőrizhető egyszerre; csökkentsd a kijelölést.</p>}
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
              <ContactProvenanceSummary contact={r} />
              <Button size="sm" variant="ghost" onClick={()=>setPreviewId(r.contact_id)}>Üzenet előnézete</Button>
              {r.reasons.length > 0 && <p className="text-xs text-muted-foreground">{r.reasons.join(" ")}</p>}
            </li>
          ))}
          {d.rows.length === 0 && <li className="py-2 text-muted-foreground">Nincs tárolt címzett ebben a csoportban.</li>}
        </ul>
        {preview && previewRow && <section className="border-y py-3 space-y-2"><h3 className="font-medium">Mentett üzenet · {previewRow.email}</h3><p className="break-words">{preview.subject || "(Üres tárgy)"}</p><p className="whitespace-pre-wrap break-words">{preview.body || "(Üres üzenet)"}</p>{dirty && <Badge variant="outline">Nem mentett változások nélkül</Badge>}</section>}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Előző</Button>
          <span>{page} / {pages} oldal · {d.total} cím</span>
          <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Következő</Button>
          <Button size="sm" disabled title="Ebben a körben a kiküldés tiltott">Kiküldés (tiltott)</Button>
        </div>
      </>)}
      {camp && <CampaignTestControl key={`${camp.id}:${camp.updated_at}`} campaignId={camp.id} revision={camp.updated_at} disabled={busy || archived || dirty || !camp.message_subject?.trim() || !camp.message_body?.trim()} />}
    </CardContent></Card>
  );
}
