import { useEffect, useMemo, useState } from "react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { postSendPlan } from "@/lib/quotes/send-policy";
import { localDateTimeToIso } from "@/lib/sales/next-step-input";
import { usePipelineLeadMutations } from "@/components/pipeline/use-pipeline-lead-mutations";
import type { LeadStatus } from "@/lib/sales/constants";

/** P5: ajánlatcsomagból előkészített levéltervezet. Csak kitölti a meglévő küldési párbeszédet — küldés továbbra is kézi megerősítéssel, a meglévő /api/gmail/send úton. */
export type SendDraft = { token: number; subject: string; body: string; documentIds: string[]; fingerprint: string; approvedBy: string | null };
type Props = { quote: { id: string; lead_id: string | null; project_id: string | null; title: string | null; version: number | null; alternative_key?: string; contact_id?: string | null }; companyId: string | null; draft?: SendDraft | null };

const STATUS_LABEL: Record<string, string> = { sent: "Kiküldve (CRM)", recorded: "Gmailből rögzítve", failed: "Sikertelen", sending: "Folyamatban" };

/** S4: kiküldés a meglévő CRM-levelezésből, vagy Gmailben küldött levél hozzákapcsolása. */
export function QuoteSendPanel({ quote, companyId, draft = null }: Props) {
  const qc = useQueryClient();
  const { profile } = usePermissions();
  const link = useServerFn(quoteLinkSentEmail);
  const [open, setOpen] = useState<null | "send" | "link">(null);
  const [idemKey, setIdemKey] = useState("");
  const [to, setTo] = useState(""); const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(""); const [body, setBody] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [fromDraft, setFromDraft] = useState<SendDraft | null>(null);
  const [draftRevoked, setDraftRevoked] = useState(false);
  // Válasz az eredeti beérkező szálban vagy új levél; utánkövetés kötelező (nincs kitalált alapidő).
  const [mode, setMode] = useState<"reply" | "new">("new");
  const [threadPick, setThreadPick] = useState("");
  const [fu, setFu] = useState({ date: "", time: "", type: "phone" as "phone" | "email" });
  const [after, setAfter] = useState<null | { followup: "ok" | "failed" | "skipped"; pipeline: "ok" | "failed" | "skipped" | "not_applicable"; note?: string }>(null);
  const { statusMut } = usePipelineLeadMutations();

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

  // Az ügyhöz / kapcsolattartóhoz kötött, a saját postafiókodban lévő levélszálak (RLS + saját hozzárendelés).
  const threads = useQuery({
    queryKey: ["email_threads", "quote-reply", quote.id, quote.lead_id, quote.contact_id, companyId],
    enabled: open === "send" && !!(quote.lead_id || quote.contact_id || companyId),
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id; if (!uid) return [];
      const ors = [quote.lead_id && `lead_id.eq.${quote.lead_id}`, quote.contact_id && `contact_id.eq.${quote.contact_id}`, companyId && `company_id.eq.${companyId}`].filter(Boolean).join(",");
      const { data, error } = await supabase.from("email_threads").select("id,gmail_thread_id,subject,last_message_at,lead_id,contact_id,email_thread_access!inner(user_id)")
        .or(ors).eq("email_thread_access.user_id", uid).not("gmail_thread_id", "is", null).order("last_message_at", { ascending: false }).limit(20);
      if (error) throw error;
      const rank = (t: any) => (t.lead_id === quote.lead_id && quote.lead_id ? 0 : t.contact_id === quote.contact_id && quote.contact_id ? 1 : 2);
      return ((data ?? []) as any[]).sort((a, b) => rank(a) - rank(b));
    },
  });
  useEffect(() => {
    if (open !== "send" || !threads.isSuccess) return;
    const first = (threads.data ?? [])[0];
    if (first && !threadPick) { setThreadPick(first.id); setMode("reply"); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, threads.isSuccess]);
  const replyThread = (threads.data ?? []).find((t: any) => t.id === threadPick) ?? null;
  useEffect(() => {
    // Válasznál a szál tárgya marad (Gmail így tartja egy szálban).
    if (mode === "reply" && replyThread?.subject) setSubject(/^re:/i.test(replyThread.subject) ? replyThread.subject : `Re: ${replyThread.subject}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, replyThread?.id]);
  const followupDue = localDateTimeToIso(fu.date, fu.time);

  const sizeErr = useMemo(() => checkOutboundSize((docs.data ?? []).filter((d) => picked.includes(d.id)).map((d) => d.size_bytes)), [docs.data, picked]);
  const attachmentErr = checkReferencedAttachment(body, picked.length);

  useEffect(() => {
    // P7: ha a csomag az átadás után megváltozott/elavult, a tervezet már nem „csomagból előkészített” (csak a címke változik, a küldés nem).
    if (!draft) { if (fromDraft) { setFromDraft(null); setDraftRevoked(true); } return; }
    setIdemKey(crypto.randomUUID()); setConfirm(false); setFromDraft(draft); setDraftRevoked(false); setAfter(null); setThreadPick(""); setMode("new");
    setTo(contact.data?.email ?? ""); setCc(""); setSubject(draft.subject); setBody(draft.body); setPicked(draft.documentIds);
    setOpen("send");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.token]);

  const openSend = () => {
    setIdemKey(crypto.randomUUID()); setConfirm(false); setFromDraft(null); setDraftRevoked(false); setAfter(null); setThreadPick(""); setMode("new");
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
          // Válasz módban a szerver olvassa ki a szál Message-ID/References fejléceit a saját postafiókból.
          threadId: mode === "reply" && replyThread ? replyThread.gmail_thread_id : undefined,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) throw new Error(j?.error ?? `Küldés sikertelen (HTTP ${r.status})`);
      return j;
    },
    onSuccess: async (j: any) => {
      if (j.warning) toast.warning(j.warning); else toast.success(j.duplicate ? "Ez az ajánlat már elment — nem küldtük újra" : "Ajánlat elküldve");
      setOpen(null); qc.invalidateQueries({ queryKey: ["quotes"] }); qc.invalidateQueries({ queryKey: ["quote_sends"] });
      await runAfterSend(j);
    },
    onError: (e: any) => { toast.error("Nem ment ki — az ajánlat nem lett kiküldöttként jelölve", { description: e?.message }); qc.invalidateQueries({ queryKey: ["quote_sends"] }); },
  });
  // Igazolt kiküldés után: utánkövetés (meglévő quote_schedule_followup) és Pipeline „Ajánlat kiadva” (meglévő közös státuszútvonal).
  async function runAfterSend(j: { ok: boolean; duplicate?: boolean; warning?: string | null }) {
    let leadStatus: string | null = null;
    if (quote.lead_id) {
      const r = await supabase.from("leads").select("status").eq("id", quote.lead_id).maybeSingle();
      leadStatus = r.data?.status ?? null;
    }
    const plan = postSendPlan({ ok: j.ok, duplicate: j.duplicate, warning: j.warning, leadStatus, hasLead: !!quote.lead_id });
    if (!plan.scheduleFollowup) { setAfter({ followup: "skipped", pipeline: "skipped", note: j.warning ? "A kiküldés nem teljesen igazolt, ezért utánkövetés és Pipeline-léptetés nem történt automatikusan. Ellenőrizd a Gmail Elküldött mappát." : "Ismételt kérés — nem léptettünk újra." }); return; }
    let followup: "ok" | "failed" = "failed";
    if (followupDue) {
      const { error } = await (supabase.rpc as any)("quote_schedule_followup", { p_quote_id: quote.id, p_due: followupDue, p_type: fu.type, p_note: "Ajánlat utánkövetése" });
      followup = error ? "failed" : "ok";
      qc.invalidateQueries({ queryKey: ["followups"] });
    }
    let pipeline: "ok" | "failed" | "not_applicable" = "not_applicable";
    if (plan.advancePipeline && followup === "ok" && quote.lead_id) {
      try { await statusMut.mutateAsync({ lead: { id: quote.lead_id, status: leadStatus as LeadStatus }, next: "quote_sent" }); pipeline = "ok"; }
      catch { pipeline = "failed"; }
    } else if (plan.advancePipeline) pipeline = "failed";
    setAfter({ followup, pipeline });
  }
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
      {after && <div role="status" className="rounded-md border p-3 text-sm">
        <p className="font-medium">Kiküldés utáni lépések</p>
        <ul className="mt-1 space-y-0.5 text-xs">
          <li>Utánkövetés: {after.followup === "ok" ? "rögzítve" : after.followup === "failed" ? "NEM sikerült — rögzítsd lent, az „Utánkövetés” résznél" : "nem történt"}</li>
          {quote.lead_id && <li>Pipeline: {after.pipeline === "ok" ? "„Ajánlat kiadva” szakaszba lépett" : after.pipeline === "failed" ? "NEM léptetett — léptesd a Pipeline-ban" : after.pipeline === "not_applicable" ? "nem változott (az ügy nem „Ajánlat előkészítése” / „Utánkövetés” szakaszban volt)" : "nem történt"}</li>}
        </ul>
        {after.note && <p className="mt-1 text-xs text-muted-foreground">{after.note}</p>}
      </div>}
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
            {draftRevoked && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs">Az ajánlatcsomag az átadás óta megváltozott vagy elavult — ez a levél már NEM a belső jóváhagyás-előkészítésen átment csomag. Állítsd össze és add át újra a csomagot.</p>}
            {fromDraft && <p className="rounded-md border bg-muted/30 p-2 text-xs">Ajánlatcsomagból előkészítve · ujjlenyomat {fromDraft.fingerprint.slice(0, 12)}… · belső jóváhagyás-előkészítés: {fromDraft.approvedBy ?? "—"} (nem mentett jóváhagyás). A levél csak a lenti megerősítés és a Küldés gomb után megy ki.</p>}
            <div className="grid gap-2 rounded-md border p-3">
              <Label>Hogyan menjen ki?</Label>
              <RadioGroup value={mode} onValueChange={(v) => setMode(v as "reply" | "new")} className="gap-2">
                <label className="flex items-start gap-2 text-sm"><RadioGroupItem value="reply" disabled={!(threads.data ?? []).length} className="mt-0.5" />
                  <span>Válasz az ügyfél eredeti levélszálában{!(threads.data ?? []).length && <span className="block text-xs text-muted-foreground">{threads.isLoading ? "Levélszálak betöltése…" : threads.isError ? "A levélszálak nem tölthetők be." : "Nincs ehhez az ügyhöz kötött levélszál a postafiókodban."}</span>}</span></label>
                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="new" /> Új e-mail</label>
              </RadioGroup>
              {mode === "reply" && (threads.data ?? []).length > 0 && <Select value={threadPick} onValueChange={setThreadPick}>
                <SelectTrigger aria-label="Levélszál"><SelectValue placeholder="Válassz levélszálat" /></SelectTrigger>
                <SelectContent>{(threads.data ?? []).map((t: any) => <SelectItem key={t.id} value={t.id}>{t.subject ?? "(nincs tárgy)"}{t.last_message_at ? ` · ${formatDateTime(t.last_message_at)}` : ""}{t.lead_id === quote.lead_id && quote.lead_id ? " · ehhez az ügyhöz" : ""}</SelectItem>)}</SelectContent>
              </Select>}
              {mode === "reply" && replyThread && <p className="text-xs text-muted-foreground">A levél a kiválasztott szálban, válaszként megy ki; a tárgy maradhat a szál tárgya.</p>}
            </div>
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
            <div className="grid gap-1.5 rounded-md border p-3">
              <Label>Utánkövetés (kötelező)</Label>
              <div className="grid grid-cols-3 gap-2">
                <Input type="date" aria-label="Utánkövetés dátuma" value={fu.date} onChange={(e) => setFu((f) => ({ ...f, date: e.target.value }))} />
                <Input type="time" aria-label="Utánkövetés időpontja" value={fu.time} onChange={(e) => setFu((f) => ({ ...f, time: e.target.value }))} />
                <Select value={fu.type} onValueChange={(v) => setFu((f) => ({ ...f, type: v as "phone" | "email" }))}>
                  <SelectTrigger aria-label="Utánkövetés módja"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="phone">Telefon</SelectItem><SelectItem value="email">E-mail</SelectItem></SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">Sikeres kiküldés után ez lesz az ügy következő lépése{quote.lead_id ? ", és az ügy „Ajánlat kiadva” szakaszba lép" : ""}.</p>
            </div>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={confirm} onCheckedChange={(c) => setConfirm(!!c)} /> Ellenőriztem a címzettet és a mellékleteket, jóváhagyom a kiküldést.</label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(null)}>Mégse</Button>
            <Button disabled={!confirm || !to.trim() || !subject.trim() || !!sizeErr || !!attachmentErr || !followupDue || (mode === "reply" && !replyThread) || picked.length === 0 || send.isPending} onClick={() => send.mutate()}>
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
