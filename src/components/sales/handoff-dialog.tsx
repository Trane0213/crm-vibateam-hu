import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type HandoffPayload = {
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  site_address: string;
  doc_url: string;
  start_date: string;
  note: string;
};

function emptyPayload(seed?: Partial<HandoffPayload>): HandoffPayload {
  return {
    contact_name: seed?.contact_name ?? "",
    contact_phone: seed?.contact_phone ?? "",
    contact_email: seed?.contact_email ?? "",
    site_address: seed?.site_address ?? "",
    doc_url: seed?.doc_url ?? "",
    start_date: seed?.start_date ?? "",
    note: seed?.note ?? "",
  };
}

export function HandoffDialog({
  open,
  onOpenChange,
  defaultTitle,
  seed,
  onConfirm,
  busy,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultTitle: string;
  seed?: Partial<HandoffPayload>;
  onConfirm: (p: { title: string; payload: HandoffPayload }) => void;
  busy?: boolean;
}) {
  const [title, setTitle] = useState(defaultTitle);
  const [p, setP] = useState<HandoffPayload>(emptyPayload(seed));

  const required = p.contact_name && p.contact_phone && p.site_address && p.start_date && title.trim();

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Projekt indítása megnyert leadből</DialogTitle>
          <DialogDescription>
            A handoff_payload mezői a projekt-rekorddal együtt mentésre kerülnek. A backend trigger ellenőrzi, hogy a lead state-je <code>won</code>.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label>Projekt cím *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Kapcsolattartó neve *</Label>
            <Input value={p.contact_name} onChange={(e) => setP({ ...p, contact_name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Telefon *</Label>
            <Input value={p.contact_phone} onChange={(e) => setP({ ...p, contact_phone: e.target.value })} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Email</Label>
            <Input type="email" value={p.contact_email} onChange={(e) => setP({ ...p, contact_email: e.target.value })} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Helyszín cím *</Label>
            <Input value={p.site_address} onChange={(e) => setP({ ...p, site_address: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Dokumentum URL</Label>
            <Input value={p.doc_url} onChange={(e) => setP({ ...p, doc_url: e.target.value })} placeholder="https://…" />
          </div>
          <div className="space-y-1.5">
            <Label>Kezdés dátuma *</Label>
            <Input type="date" value={p.start_date} onChange={(e) => setP({ ...p, start_date: e.target.value })} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Megjegyzés</Label>
            <Textarea rows={2} value={p.note} onChange={(e) => setP({ ...p, note: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Mégse</Button>
          <Button disabled={!required || busy} onClick={() => onConfirm({ title: title.trim(), payload: p })}>
            {busy ? "Mentés…" : "Projekt létrehozása"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
