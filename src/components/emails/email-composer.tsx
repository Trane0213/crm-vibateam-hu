import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Paperclip, Send, X, Bold, Italic, Link as LinkIcon, List, ListOrdered } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Attachment = { key: string; filename: string; mime_type: string; size_bytes: number };

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Nincs bejelentkezett munkamenet.");
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  return fetch(path, { ...init, headers });
}

export function EmailComposer({
  open,
  onOpenChange,
  defaultTo,
  defaultSubject,
  defaultBody,
  gmailThreadId,
  inReplyTo,
  references,
  companyId,
  contactId,
  leadId,
  onSent,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultTo?: string;
  defaultSubject?: string;
  defaultBody?: string;
  gmailThreadId?: string;
  inReplyTo?: string;
  references?: string;
  companyId?: string;
  contactId?: string;
  leadId?: string;
  onSent?: () => void;
}) {
  const [to, setTo] = useState(defaultTo ?? "");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [subject, setSubject] = useState(defaultSubject ?? "");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // A defaultTo / defaultSubject gyakran csak a dialog megnyitása UTÁN érkezik meg
  // (a contact/lead query aszinkron), ezért minden nyitáskor szinkronizálunk.
  // Csak akkor írjuk felül, ha a mező még üres — így a már gépelt szöveg nem
  // tűnik el, ha közben befut a query.
  useEffect(() => {
    if (!open) return;
    setTo((cur) => (cur && cur.trim() ? cur : (defaultTo ?? "")));
    setSubject((cur) => (cur && cur.trim() ? cur : (defaultSubject ?? "")));
  }, [open, defaultTo, defaultSubject]);

  // defaultBody-t csak akkor töltjük be, ha a szerkesztő üres — így a már
  // megírt tartalom nem tűnik el, ha egy második sablonválasztás történik.
  useEffect(() => {
    if (!open) return;
    if (!defaultBody) return;
    const el = editorRef.current;
    if (!el) return;
    const current = el.innerHTML.replace(/<br\s*\/?>(\s*)?/g, "").trim();
    if (!current) el.innerHTML = defaultBody;
  }, [open, defaultBody]);

  const exec = (cmd: string, val?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, val);
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const next: Attachment[] = [];
      for (const f of Array.from(files)) {
        if (f.size > 20 * 1024 * 1024) {
          toast.error(`Túl nagy: ${f.name}`, { description: "Max 20 MB / fájl" });
          continue;
        }
        const safe = f.name.replace(/[^\w.\-]+/g, "_");
        const key = `outbound-attachments/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
        const fd = new FormData();
        fd.append("file", f, f.name);
        fd.append("key", key);
        fd.append("contentType", f.type || "application/octet-stream");
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        const put = await fetch("/api/r2-upload", {
          method: "POST",
          body: fd,
          headers: token ? { authorization: `Bearer ${token}` } : {},
        });
        if (!put.ok) {
          const j = await put.json().catch(() => ({}));
          throw new Error(`R2 feltöltés (${put.status}) ${j?.error ?? ""}`.trim());
        }
        next.push({ key, filename: f.name, mime_type: f.type || "application/octet-stream", size_bytes: f.size });
      }
      setAttachments((a) => [...a, ...next]);
    } catch (e: any) {
      toast.error("Feltöltés", { description: e?.message ?? String(e) });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeAttachment = (key: string) => setAttachments((a) => a.filter((x) => x.key !== key));

  const handleSend = async () => {
    const html = editorRef.current?.innerHTML ?? "";
    if (!to.trim()) { toast.error("Címzett kötelező"); return; }
    if (!subject.trim()) { toast.error("Tárgy kötelező"); return; }
    setBusy(true);
    try {
      const r = await authedFetch("/api/gmail/send", {
        method: "POST",
        body: JSON.stringify({
          to: to.trim(),
          cc: cc.trim() || undefined,
          bcc: bcc.trim() || undefined,
          subject: subject.trim(),
          html,
          attachments,
          threadId: gmailThreadId,
          inReplyTo,
          references,
          company_id: companyId,
          contact_id: contactId,
          lead_id: leadId,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Küldés sikertelen");
      toast.success("Email elküldve");
      onSent?.();
      onOpenChange(false);
      // reset
      setTo(""); setCc(""); setBcc(""); setSubject(""); setAttachments([]);
      if (editorRef.current) editorRef.current.innerHTML = "";
    } catch (e: any) {
      toast.error("Küldés", { description: e?.message ?? String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{gmailThreadId ? "Válasz" : "Új email"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-2">
            <Label htmlFor="to" className="text-xs uppercase tracking-wider text-muted-foreground">Címzett</Label>
            <Input id="to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="nev@cég.hu, masik@cég.hu" />
          </div>
          {!showCcBcc ? (
            <button type="button" onClick={() => setShowCcBcc(true)} className="text-xs text-primary hover:underline">
              + Cc / Bcc hozzáadása
            </button>
          ) : (
            <>
              <div className="grid gap-2">
                <Label htmlFor="cc" className="text-xs uppercase tracking-wider text-muted-foreground">Cc</Label>
                <Input id="cc" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="másolat@cég.hu" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bcc" className="text-xs uppercase tracking-wider text-muted-foreground">Bcc</Label>
                <Input id="bcc" value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="rejtett@cég.hu" />
              </div>
            </>
          )}
          <div className="grid gap-2">
            <Label htmlFor="subject" className="text-xs uppercase tracking-wider text-muted-foreground">Tárgy</Label>
            <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="rounded-md border">
            <div className="flex items-center gap-1 border-b bg-muted/30 px-2 py-1">
              <Button type="button" size="sm" variant="ghost" onClick={() => exec("bold")} title="Félkövér"><Bold className="h-3.5 w-3.5" /></Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => exec("italic")} title="Dőlt"><Italic className="h-3.5 w-3.5" /></Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => exec("insertUnorderedList")} title="Lista"><List className="h-3.5 w-3.5" /></Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => exec("insertOrderedList")} title="Számozott lista"><ListOrdered className="h-3.5 w-3.5" /></Button>
              <Button
                type="button" size="sm" variant="ghost" title="Link"
                onClick={() => {
                  const u = window.prompt("URL:", "https://");
                  if (u) exec("createLink", u);
                }}
              ><LinkIcon className="h-3.5 w-3.5" /></Button>
            </div>
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              className="min-h-[200px] max-h-[40vh] overflow-auto px-3 py-2 text-sm leading-relaxed outline-none [&_a]:text-primary [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
              data-placeholder="Írj ide…"
            />
          </div>
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {attachments.map((a) => (
                <Badge key={a.key} variant="secondary" className="gap-1.5 pr-1">
                  <Paperclip className="h-3 w-3" />
                  <span className="max-w-[200px] truncate">{a.filename}</span>
                  <span className="text-muted-foreground">{Math.round(a.size_bytes / 1024)} KB</span>
                  <button type="button" onClick={() => removeAttachment(a.key)} className="ml-1 rounded p-0.5 hover:bg-muted">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>
        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <div>
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <Button
              type="button" variant="outline" size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              <Paperclip className="mr-1.5 h-4 w-4" />
              {uploading ? "Feltöltés…" : "Csatolmány"}
            </Button>
          </div>
          <Button type="button" onClick={handleSend} disabled={busy || uploading}>
            <Send className="mr-1.5 h-4 w-4" />
            {busy ? "Küldés…" : "Küldés"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}