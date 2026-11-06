import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { listOwnGmailDrafts, readOwnGmailDraft } from '@/lib/marketing/gmail-drafts.functions';
import { draftTextCopy, type DraftSource } from '@/lib/marketing/gmail-draft-source';

export function GmailDraftPicker({ disabled, onCopy }: { disabled: boolean; onCopy: (copy: { subject: string; body: string }) => void }) {
  const listFn = useServerFn(listOwnGmailDrafts);
  const readFn = useServerFn(readOwnGmailDraft);
  const [page, setPage] = useState<Awaited<ReturnType<typeof listFn>> | null>(null);
  const [source, setSource] = useState<DraftSource | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draftId, setDraftId] = useState('');
  async function load(token?: string) {
    setBusy(true); setError(''); setSource(null); setDraftId(''); setPage(null);
    try { setPage(await listFn({ data: { pageToken: token } })); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function read(copy: boolean) {
    setBusy(true); setError(''); setSource(null);
    try {
      const fresh = await readFn({ data: { draftId } });
      setSource(fresh);
      if (copy) onCopy(draftTextCopy(fresh));
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const blocked = disabled || busy;
  return <section className="space-y-2 border-y py-3">
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" disabled={blocked} onClick={() => load()}>Saját Gmail-piszkozatok</Button>
      {page && <span className="break-all text-xs text-muted-foreground">{page.mailbox} · {page.drafts.length} piszkozat ezen az oldalon</span>}
    </div>
    {page && <div className="flex flex-wrap gap-2">
      <select className="h-8 max-w-full rounded-md border bg-background px-2 text-sm" aria-label="Saját Gmail-piszkozat" value={draftId} disabled={blocked} onChange={e => { setDraftId(e.target.value); setSource(null); setError(''); }}>
        <option value="">Piszkozat kiválasztása</option>
        {page.drafts.map(d => <option key={d.id} value={d.id}>Gmail · {d.id}</option>)}
      </select>
      <Button size="sm" variant="outline" disabled={blocked || !draftId} onClick={() => read(false)}>Megtekintés</Button>
      {page.nextPageToken && <Button size="sm" variant="outline" disabled={blocked} onClick={() => load(page.nextPageToken ?? undefined)}>Következő oldal</Button>}
      {!page.drafts.length && <p className="text-muted-foreground">Nincs piszkozat ezen az oldalon.</p>}
    </div>}
    {source && <div className="space-y-2">
      <p className="break-words font-medium">{source.subject || '(Üres tárgy)'}</p>
      <p className="break-all text-xs text-muted-foreground">Gmail-piszkozat · {source.draftId} · {source.mailbox} · {new Date(source.readAt).toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' })}</p>
      <Textarea aria-label="Piszkozat szöveges változata" readOnly value={source.text ?? ''} rows={5} />
      {source.html !== null && <details><summary className="cursor-pointer">Eredeti HTML-forrás</summary><Textarea aria-label="Piszkozat eredeti HTML-forrása" readOnly value={source.html} rows={5} /></details>}
      {source.attachments > 0 && <p className="text-destructive">Mellékletes piszkozat · {source.attachments} melléklet · másolás tiltott</p>}
      <Button size="sm" variant="outline" disabled={blocked || source.attachments > 0 || !source.text?.trim()} onClick={() => read(true)}>Szöveges változat átvétele</Button>
      <p className="text-xs text-muted-foreground">Csak a szöveges változat kerül a nem mentett tervezetbe. A HTML és az eredeti Gmail-piszkozat változatlan marad.</p>
    </div>}
    {busy && <p className="text-muted-foreground">Piszkozat olvasása…</p>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
  </section>;
}