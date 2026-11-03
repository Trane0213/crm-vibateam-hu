import type { EmailSendAction } from '@/lib/ai-os/email-send-action';
export function EmailSendApproval({ action }: { action: EmailSendAction }) {
  const m = action.message;
  return <div className="space-y-2 border-t pt-2 text-xs break-words">
    <p><strong>Feladó:</strong> {m.mailbox}</p>
    <p><strong>Címzett:</strong> {m.to.join(', ')}</p>
    {m.cc.length>0 && <p><strong>Másolat:</strong> {m.cc.join(', ')}</p>}
    {m.bcc.length>0 && <p><strong>Titkos másolat:</strong> {m.bcc.join(', ')}</p>}
    <p><strong>Ügy:</strong> {String(action.context.lead.summary ?? m.leadId)} · {m.leadId}</p>
    <p><strong>Cég:</strong> {String(action.context.company.name ?? '')}</p>
    {m.quoteId && <p><strong>Ajánlat:</strong> {m.quoteId} · v{String(action.context.quote?.version ?? '')} · {String(action.context.quote?.alternative_key ?? '')}</p>}
    <p><strong>Tárgy:</strong> {m.subject}</p>
    <p className="whitespace-pre-wrap border-y py-2">{m.body}</p>
    <p><strong>Mellékletek:</strong> {action.attachments.length || 'Nincs'}</p>
    {action.attachments.map(a=><div key={a.document_id} className="border-b pb-1">
      <p>{a.name} · {a.size.toLocaleString('hu-HU')} bájt</p>
      <p className="text-muted-foreground">{a.document_id} · SHA-256: {a.sha256}</p>
    </div>)}
  </div>;
}