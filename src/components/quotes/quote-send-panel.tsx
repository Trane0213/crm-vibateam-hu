import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link2, Send, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/use-permissions";
import { formatDateTime } from "@/lib/format";
import { humanizeSupabaseError } from "@/lib/db-hooks";
import { checkOutboundSize, checkReferencedAttachment } from "@/lib/quotes/send-policy";
import { quoteLinkSentEmail } from "@/lib/quotes/quote-send.functions";
import { QUOTE_DOC_LABEL } from "@/components/quotes/quote-document-manager";

type Props = { quote: { id: string; lead_id: string | null; project_id: string | null; title: string | null; version: number | null; alternative_key?: string; contact_id?: string | null }; companyId: string | null };

const STATUS_LABEL: Record<string, string> = { sent: "Kiküldve (CRM)", recorded: "Gmailből rögzítve", failed: "Sikertelen", sending: "Folyamatban" };

/** S4: kiküldés a meglévő CRM-levelezésből, vagy Gmailben küldött levél hozzákapcsolása. */
export function QuoteSendPanel({ quote, companyId }: Props) {
  const qc = useQueryClient();
  const { profile } = usePermissions();
  const link = useServerFn(quoteLinkSentEmail);
  const [open, setOpen] = useState<null | "send" | "link">(null);
  const [idemKey, setIdemKey] = useState("");
  const [to, setTo] = useState(""); const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(""); const [body, setBody] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);

  const sends = useQuery({
    queryKey: ["quote_sends", quote.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("quote_sends" as any).select("*").eq("quote_id", quote.id).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const docs = useQuery({
    queryKey: ["quote_documents", quote.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("quote_documents" as any).select("*").eq("quote_id", quote.id).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const contact = useQuery({
    queryKey: ["contacts", "one", quote.contact_id],
    enabled: !!quote.contact_id,
    queryFn: async () => (await supabase.from("contacts").select("id,name,email").eq("id", quote.contact_id!).maybeSingle()).data as any,
  });
  const candidates = useQuery({
    queryKey: ["emails", "quote-link", quote.id, quote.lead_id, companyId],
    enabled: open === "link" && !!(quote.lead_id || companyId),
    queryFn: async () => {
      let qb = supabase.from("emails").select("id,subject,to_email,internal_date").eq("is_outbound", true).order("internal_date", { ascending: false }).limit(50);
      qb = quote.lead_id && companyId ? qb.or(`lead_id.eq.${quote.lead_id},company_id.eq.${companyId}`) : quote.lead_id ? qb.eq("lead_id", quote.lead_id) : qb.eq("company_id", companyId!);
      const { data, error } = await qb;
      if (error) throw error;
      return data ?? [];
    },
  });

  const sizeErr = useMemo(() => checkOutboundSize((docs.data ?? []).filter((d) => picked.includes(d.id)).map((d) => d.size_bytes)), [docs.data, picked]);
  const attachmentErr = checkReferencedAttachment(body, picked.length);

  const openSend = () => {
    setIdemKey(crypto.randomUUID()); setConfirm(false);
    setTo(contact.data?.email ?? ""); setCc("");
    setSubject(`Ajánlat – ${quote.title ?? "VIBA-TEAM"} (v${quote.version ?? 1})`);
    setBody("Tisztelt Partnerünk!\n\nMellékelten küldjük ajánlatunkat.\n\nÜdvözlettel:\nVIBA-TEAM");
    setPicked((docs.data ?? []).filter((d) => d.document_type === "sent_offer").map((d) => d.id));
    setOpen("send");
  };

  const send = useMutation({
    mutationFn: async () => {
      if (attachmentErr) throw new Error(attachmentErr);
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const r = await fetch("/api/gmail/send", {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          to, cc: cc || undefined, subject, body, expectedMailbox: profile?.gmail_email ?? undefined,
          lead_id: quote.lead_id ?? undefined, project_id: quote.project_id ?? undefined, company_id: companyId ?? undefined,
          contact_id: quote.contact_id ?? undefined,
          quote_id: quote.id, quote_document_ids: picked, idempotency_key: idemKey,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) throw new Error(j?.error ?? `Küldés sikertelen (HTTP ${r.status})`);
      return j;
    },
    onSuccess: (j: any) => { if (j.warning) toast.warning(j.warning); else toast.success(j.duplicate ? "Ez az ajánlat már elment — nem küldtük újra" : "Ajánlat elküldve"); setOpen(null); qc.invalidateQueries({ queryKey: ["quotes"] }); qc.invalidateQueries({ queryKey: ["quote_sends"] }); },
    onError: (e: any) => { toast.error("Nem ment ki — az ajánlat nem lett kiküldöttként jelölve", { description: e?.message }); qc.invalidateQueries({ queryKey: ["quote_sends"] }); },
  });
  const linkM = useMutation({
    mutationFn: async (emailId: string) => link({ data: { quoteId: quote.id, emailId } }),
    onSuccess: () => { toast.success("Levél hozzákapcsolva"); setOpen(null); qc.invalidateQueries({ queryKey: ["quotes"] }); qc.invalidateQueries({ queryKey: ["quote_sends"] }); },
    onError: (e: any) => toast.error("Nem sikerült", { description: humanizeSupabaseError(e) }),
  });

  const noMailbox = !profile?.gmail_email;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Kiküldés</h2>
        <div className="flex gap-2">
          <Button size="sm" onClick={openSend} disabled={noMailbox} title={noMailbox ? "Nincs csatlakoztatott saját Gmail-fiók" : undefined}><Send className="mr-1.5 h-4 w-4" /> Küldés CRM-ből</Button>
          <Button size="sm" variant="outline" onClick={() => setOpen("link")}><Link2 className="mr-1.5 h-4 w-4" /> Gmailben küldött levél rögzítése</Button>
        </div>
      </div>
      {(sends.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">Ez a verzió még nem ment ki. A piszkozat vagy a Pipeline „Ajánlat kiadva” fázisa nem számít kiküldésnek.</p>
      ) : (
        <ul className="divide-y rounded-md border text-sm">
          {(sends.data ?? []).map((s) => (
            <li key={s.id} className="p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={s.status === "failed" ? "destructive" : s.status === "sending" ? "secondary" : "default"}>{STATUS_LABEL[s.status] ?? s.status}</Badge>
                <span>{formatDateTime(s.sent_at ?? s.created_at)}</span>
                <span className="text-muted-foreground">→ {(s.to_emails ?? []).join(", ") || "—"}{s.cc_emails?.length ? ` (másolat: ${s.cc_emails.join(", ")})` : ""}</span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">Tárgy: {s.subject ?? "—"} · Mellékletek: {(s.attachments ?? []).map((a: any) => a.name).join(", ") || "nincs"}{s.error ? ` · Hiba: ${s.error}` : ""}</div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open === "send"} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Ajánlat küldése – v{quote.version} / {quote.alternative_key ?? "A"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <p className="text-xs text-muted-foreground">Küldő: {profile?.gmail_email}</p>
            <div className="grid gap-1.5"><Label htmlFor="qs-to">Címzett</Label><Input id="qs-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="nev@ceg.hu" /></div>
            <div className="grid gap-1.5"><Label htmlFor="qs-cc">Másolat</Label><Input id="qs-cc" value={cc} onChange={(e) => setCc(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label htmlFor="qs-sub">Tárgy</Label><Input id="qs-sub" value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label htmlFor="qs-body">Kísérőlevél</Label><Textarea id="qs-body" rows={6} value={body} onChange={(e) => setBody(e.target.value)} /></div>
            <div className="grid gap-1.5">
              <Label>Mellékletek az ajánlat dokumentumai közül</Label>
              {(docs.data ?? []).length === 0 && <p className="text-xs text-muted-foreground">Nincs feltöltött dokumentum.</p>}
              {(docs.data ?? []).map((d) => (
                <label key={d.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={picked.includes(d.id)} onCheckedChange={(c) => setPicked((p) => (c ? [...p, d.id] : p.filter((x) => x !== d.id)))} />
                  <span>{d.name}</span><span className="text-xs text-muted-foreground">{QUOTE_DOC_LABEL[d.document_type as keyof typeof QUOTE_DOC_LABEL] ?? d.document_type} · {((d.size_bytes ?? 0) / 1024 / 1024).toFixed(1)} MB</span>
                </label>
              ))}
              {sizeErr && <p className="flex items-center gap-1 text-sm text-destructive"><AlertTriangle className="h-4 w-4" /> {sizeErr}</p>}
              {attachmentErr && <p role="alert" className="flex items-center gap-1 text-sm text-destructive"><AlertTriangle className="h-4 w-4" /> {attachmentErr}</p>}
            </div>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={confirm} onCheckedChange={(c) => setConfirm(!!c)} /> Ellenőriztem a címzettet és a mellékleteket, jóváhagyom a kiküldést.</label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(null)}>Mégse</Button>
            <Button disabled={!confirm || !to.trim() || !subject.trim() || !!sizeErr || !!attachmentErr || send.isPending} onClick={() => send.mutate()}>
              <Send className="mr-1.5 h-4 w-4" /> {send.isPending ? "Küldés…" : "Küldés"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open === "link"} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Gmailben már elküldött ajánlatlevél rögzítése</DialogTitle></DialogHeader>
          {!quote.lead_id && !companyId ? (
            <p className="text-sm text-muted-foreground">Az ajánlathoz nincs ügy vagy cég kapcsolva, így nem kereshető levél.</p>
          ) : candidates.isLoading ? <p className="text-sm text-muted-foreground">Betöltés…</p> : (candidates.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nincs ehhez az ügyhöz/céghez szinkronizált elküldött levél.</p>
          ) : (
            <ul className="max-h-[50vh] divide-y overflow-y-auto rounded-md border text-sm">
              {(candidates.data ?? []).map((e: any) => (
                <li key={e.id} className="flex items-center justify-between gap-2 p-2">
                  <div className="min-w-0"><div className="truncate font-medium">{e.subject ?? "(nincs tárgy)"}</div><div className="text-xs text-muted-foreground">{formatDateTime(e.internal_date)} → {e.to_email}</div></div>
                  <Button size="sm" variant="outline" disabled={linkM.isPending} onClick={() => linkM.mutate(e.id)}>Hozzákapcsolás</Button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
