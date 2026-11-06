import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CONTACT_KIND, CONTACT_SOURCE, contactProvenanceInput, contactProvenanceLabel, type ContactProvenance } from '@/lib/contact-provenance';
import { saveContactProvenance } from '@/lib/contact-provenance.functions';
import { ContactSuppression } from '@/components/marketing/contact-suppression';
import { usePermissions } from '@/hooks/use-permissions';

export function ContactProvenanceSummary({ contact }: { contact: ContactProvenance }) {
  return <div className="space-y-1 text-xs text-muted-foreground">
    <div>{contactProvenanceLabel(contact)}</div>
    {contact.data_source && <div>{Object.entries(CONTACT_SOURCE).find(([key]) => key === contact.data_source)?.[1]}</div>}
    {contact.verified_at && <div>{new Date(contact.verified_at).toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' })}</div>}
  </div>;
}

export function ContactProvenanceEditor({ contact, disabled = false }: { contact: ContactProvenance & { id: string; [key:string]: unknown }; disabled?: boolean }) {
  const { profile } = usePermissions();
  const rawRole = String(profile?.roles?.name ?? '').toLowerCase();
  const canWrite = ['owner','tulajdonos','admin','superadmin','marketing'].includes(rawRole);
  const qc = useQueryClient();
  const [kind,setKind] = useState('unknown'); const [source,setSource] = useState('manual');
  const [state,setState] = useState('unverified'); const [reference,setReference] = useState('');
  useEffect(() => { setKind(contact.contact_kind ?? 'unknown'); setSource(contact.data_source ?? 'manual'); setState(contact.verification_state ?? 'unverified'); setReference(contact.verification_reference ?? ''); }, [contact]);
  const data = { contactId: contact.id, expected: contact, kind, source, state, reference };
  const valid = contactProvenanceInput.safeParse(data);
  const dirty = kind !== contact.contact_kind || source !== contact.data_source || state !== contact.verification_state || reference !== (contact.verification_reference ?? '');
  const mutation = useMutation({
    mutationFn: async () => saveContactProvenance({ data: contactProvenanceInput.parse(data) }),
    onSuccess: () => { toast.success('Kapcsolattartó besorolása mentve'); qc.invalidateQueries({ queryKey: ['contacts'] }); qc.invalidateQueries({ queryKey: ['customers'] }); qc.invalidateQueries({ queryKey: ['campaign-list'] }); },
    onError: (error: Error) => { toast.error('Ellenőrzöttség mentése sikertelen', { description: error.message }); qc.invalidateQueries({ queryKey: ['contacts'] }); },
  });
  if (!canWrite) return <ContactProvenanceSummary contact={contact} />;
  return <section className="space-y-3 border-t pt-4">
    <h2 className="text-sm font-semibold">Adatforrás és ellenőrzöttség</h2>
    <ContactProvenanceSummary contact={contact} />
    <ContactSuppression contactId={contact.id} disabled={disabled} />
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1"><Label>Besorolás</Label><Select value={kind} onValueChange={setKind} disabled={disabled || mutation.isPending}><SelectTrigger aria-label="Besorolás"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(CONTACT_KIND).map(([key,label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1"><Label>Adatforrás</Label><Select value={source} onValueChange={setSource} disabled={disabled || mutation.isPending}><SelectTrigger aria-label="Adatforrás"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(CONTACT_SOURCE).map(([key,label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div>
    </div>
    <div className="space-y-1"><Label>Ellenőrzöttség</Label><Select value={state} onValueChange={setState} disabled={disabled || mutation.isPending}><SelectTrigger aria-label="Ellenőrzöttség"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unverified">Nem ellenőrzött</SelectItem><SelectItem value="human_verified">Ember által ellenőrzött</SelectItem></SelectContent></Select></div>
    <div className="space-y-1"><Label htmlFor={`evidence-${contact.id}`}>Emberi ellenőrzés hivatkozása</Label><Input id={`evidence-${contact.id}`} value={reference} onChange={e => setReference(e.target.value)} maxLength={500} disabled={disabled || mutation.isPending} /></div>
    <div className="flex justify-end"><Button variant="outline" disabled={disabled || mutation.isPending || !valid.success || !dirty} onClick={() => mutation.mutate()}><Save className="mr-2 h-4 w-4" />{mutation.isPending ? 'Mentés…' : 'Besorolás mentése'}</Button></div>
  </section>;
}