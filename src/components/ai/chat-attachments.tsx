/**
 * Fájl csatolása az AI-chathez és a szerepköri mappák böngészése.
 * Feltöltés kizárólag a meglévő `/api/r2-upload` úton (purpose=chat): a szerver dönti el a
 * mappát és a tárolási kulcsot, a sort a felhasználó saját jogosultságával menti.
 * Megnyitás a meglévő `useOpenDocument` (r2PresignDownload), törlés a meglévő `r2DeleteDocument`.
 */
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileText, FolderOpen, Image as ImageIcon, Link2, Loader2, Paperclip, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/use-permissions";
import { useAuth } from "@/hooks/use-auth";
import { useOpenDocument } from "@/components/documents/use-open-document";
import { r2DeleteDocument } from "@/lib/r2.functions";
import { formatBytes, searchKey } from "@/lib/documents/document-access";
import { formatDateTime } from "@/lib/format";
import type { RecordContext } from "@/lib/ai-panel-context";
import type { ChatFolder } from "@/lib/r2-policy";
import {
  CHAT_FOLDER_LABEL, MAX_ATTACHMENTS_PER_MESSAGE, canDeleteChatUpload, chatLinkTarget, ownChatFolder, visibleChatFolders,
  type ChatAttachment, type ChatLinkTarget,
} from "@/lib/chat-uploads/chat-attachments";

const isImageName = (n: string) => /\.(png|jpe?g|gif|webp|heic|heif)$/i.test(n);
const LINK_KIND_LABEL: Record<string, string> = { project_documents: "Projekthez is mentve", company_documents: "Ügyfélhez is mentve", quote_documents: "Ajánlathoz is mentve" };

async function uploadOne(file: File, agent: string, link: ChatLinkTarget | null): Promise<ChatAttachment & { linked: boolean }> {
  const fd = new FormData();
  fd.append("file", file, file.name); fd.append("purpose", "chat"); fd.append("agentId", agent);
  if (link) { fd.append("linkKind", link.kind); fd.append("linkId", link.id); }
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  const res = await fetch("/api/r2-upload", { method: "POST", body: fd, headers: token ? { authorization: `Bearer ${token}` } : {} });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j?.upload?.id) throw new Error(j?.error ?? `Feltöltés sikertelen (HTTP ${res.status})`);
  const u = j.upload;
  return { id: u.id, name: u.name, folder: u.folder, fileKey: u.file_url, mime: u.mime_type ?? null, size: u.size_bytes ?? null, linked: !!u.link };
}

/** Csatolás állapota egy chatfelülethez. */
export function useChatAttachments() {
  const [pending, setPending] = useState<ChatAttachment[]>([]);
  return { pending, add: (a: ChatAttachment) => setPending((p) => p.some((x) => x.id === a.id) ? p : [...p, a].slice(0, MAX_ATTACHMENTS_PER_MESSAGE)), remove: (id: string) => setPending((p) => p.filter((x) => x.id !== id)), clear: () => setPending([]) };
}
export type ChatAttachmentsState = ReturnType<typeof useChatAttachments>;

/** Gemkapocs gomb + mappák gomb + függő csatolmányok + „Hova mentsem?” kérdés. */
export function ChatAttachControls({ agent, state, recordCtx, ctxLabel, disabled }: {
  agent: string; state: ChatAttachmentsState; recordCtx: RecordContext | null; ctxLabel?: string | null; disabled?: boolean;
}) {
  const { role, isLoading: roleLoading } = usePermissions();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState<File[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [browse, setBrowse] = useState(false);
  const folder = ownChatFolder(role);
  const link = chatLinkTarget(recordCtx, role);
  const linkName = ctxLabel ?? recordCtx?.label ?? "ügy";

  async function run(files: File[], withLink: boolean) {
    setChosen(null);
    const room = MAX_ATTACHMENTS_PER_MESSAGE - state.pending.length;
    if (room <= 0) { toast.error(`Egy üzenethez legfeljebb ${MAX_ATTACHMENTS_PER_MESSAGE} fájl csatolható.`); return; }
    setUploading(true);
    let ok = 0;
    for (const f of files.slice(0, room)) {
      try {
        const a = await uploadOne(f, agent, withLink ? link : null);
        state.add({ ...a, linkLabel: a.linked ? linkName : null }); ok++;
      } catch (e) { toast.error(`„${f.name}” nem tölthető fel`, { description: (e as Error).message }); }
    }
    setUploading(false);
    if (ok) {
      qc.invalidateQueries({ queryKey: ["documents"] });
      toast.success(ok === 1 ? "Fájl mentve" : `${ok} fájl mentve`, { description: `${folder ? CHAT_FOLDER_LABEL[folder] : "Mappa"}${withLink && link ? ` + ${linkName}` : ""}` });
    }
    if (files.length > room) toast.warning(`Csak ${room} fájl fért az üzenethez.`);
  }

  function onPick(list: FileList | null) {
    const files = Array.from(list ?? []); if (inputRef.current) inputRef.current.value = "";
    if (!files.length) return;
    if (link) setChosen(files); else void run(files, false);
  }

  if (roleLoading || !folder) return null;
  return (
    <>
      <div className="flex items-center gap-1">
        <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => onPick(e.target.files)} aria-hidden tabIndex={-1} />
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={disabled || uploading} title="Fájl vagy kép csatolása" aria-label="Fájl vagy kép csatolása" onClick={() => inputRef.current?.click()}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
        </Button>
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8" title="Feltöltött fájlok (mappák)" aria-label="Feltöltött fájlok (mappák)" onClick={() => setBrowse(true)}>
          <FolderOpen className="h-4 w-4" />
        </Button>
      </div>
      <Dialog open={!!chosen} onOpenChange={(o) => { if (!o) setChosen(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Hova mentsem a fájlt?</DialogTitle>
            <DialogDescription>
              {chosen?.length === 1 ? `„${chosen[0].name}”` : `${chosen?.length ?? 0} fájl`} mindenképp bekerül ide: {CHAT_FOLDER_LABEL[folder]}. Kérésre ennek az ügynek a dokumentumai közé is: <span className="font-medium text-foreground">{recordCtx?.label}: {linkName}</span>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => chosen && run(chosen, false)}>Csak a mappába</Button>
            <Button onClick={() => chosen && run(chosen, true)}><Link2 className="mr-1.5 h-4 w-4" />Mappába és az ügyhöz is</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Sheet open={browse} onOpenChange={setBrowse}>
        <SheetContent side="right" className="flex w-full flex-col gap-3 sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Feltöltött fájlok</SheetTitle>
            <SheetDescription>A chatbe feltöltött fájlok szerepkörönként külön mappában. Bármelyiket újra csatolhatod a beszélgetéshez.</SheetDescription>
          </SheetHeader>
          <ChatUploadsBrowser onAttach={(a) => { state.add(a); toast.success("Csatolva a következő üzenethez", { description: a.name }); }} className="min-h-0 flex-1" />
        </SheetContent>
      </Sheet>
    </>
  );
}

/** Küldés előtti csatolmány-sor a beviteli mező felett. */
export function PendingAttachments({ state, disabled }: { state: ChatAttachmentsState; disabled?: boolean }) {
  if (!state.pending.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Csatolt fájlok">
      {state.pending.map((a) => (
        <span key={a.id} className="inline-flex max-w-full items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs">
          {isImageName(a.name) ? <ImageIcon className="h-3 w-3 shrink-0 text-primary" /> : <FileText className="h-3 w-3 shrink-0 text-primary" />}
          <span className="max-w-[180px] truncate">{a.name}</span>
          {a.linkLabel && <Link2 className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Az ügyhöz is mentve" />}
          <button type="button" disabled={disabled} className="ml-0.5 rounded-full p-0.5 hover:bg-muted" aria-label={`${a.name} eltávolítása az üzenetből`} onClick={() => state.remove(a.id)}><X className="h-3 w-3" /></button>
        </span>
      ))}
    </div>
  );
}

/** Elküldött üzenet csatolmányai — megnyitás a jogosultság-ellenőrzött úton. */
export function MessageAttachments({ items }: { items: ChatAttachment[] }) {
  const { open, pending } = useOpenDocument();
  return (
    <div className="mt-1.5 flex flex-wrap justify-end gap-1.5">
      {items.map((a) => (
        <button key={a.id} type="button" onClick={() => open({ uid: `ai_chat_uploads:${a.id}`, fileKey: a.fileKey, name: a.name })}
          className="inline-flex max-w-full items-center gap-1 rounded-md border border-primary-foreground/30 bg-primary-foreground/10 px-2 py-0.5 text-xs hover:bg-primary-foreground/20" title="Megnyitás">
          {pending === `ai_chat_uploads:${a.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : isImageName(a.name) ? <ImageIcon className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
          <span className="max-w-[200px] truncate">{a.name}</span>
          {a.linkLabel && <Link2 className="h-3 w-3" aria-label="Az ügyhöz is mentve" />}
        </button>
      ))}
    </div>
  );
}

type UploadRow = { id: string; name: string; file_url: string; mime_type: string | null; size_bytes: number | null; folder: ChatFolder; uploaded_by: string; uploader_name: string | null; link_table: string | null; created_at: string };
export const CHAT_UPLOAD_LIMIT = 300;

/** Szerepköri mappák böngészője (chat oldalsáv és Dokumentumtár). Csak az RLS szerint látható sorok. */
export function ChatUploadsBrowser({ onAttach, className }: { onAttach?: (a: ChatAttachment) => void; className?: string }) {
  const { role, isLoading: roleLoading } = usePermissions();
  const { user } = useAuth();
  const qc = useQueryClient();
  const folders = roleLoading ? [] : visibleChatFolders(role);
  // A szerepkör betöltése előtt nem választunk mappát (betöltés közben a felület a legszűkebb szerepkört feltételezi).
  const [picked, setFolder] = useState<ChatFolder | "all" | null>(null);
  const folder: ChatFolder | "all" = picked && (picked === "all" ? role === "owner" : folders.includes(picked)) ? picked : role === "owner" ? "all" : (folders[0] ?? "all");
  const [query, setQuery] = useState("");
  const { open, pending, failures } = useOpenDocument();
  const del = useServerFn(r2DeleteDocument);
  const list = useQuery({
    queryKey: ["documents", "ai_chat_uploads", folder],
    enabled: folders.length > 0,
    queryFn: async () => {
      let q = supabase.from("ai_chat_uploads").select("id,name,file_url,mime_type,size_bytes,folder,uploaded_by,uploader_name,link_table,created_at", { count: "exact" });
      if (folder !== "all") q = q.eq("folder", folder);
      const { data, error, count } = await q.order("created_at", { ascending: false }).limit(CHAT_UPLOAD_LIMIT);
      if (error) throw error;
      return { rows: (data ?? []) as UploadRow[], count: count ?? 0 };
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => del({ data: { table: "ai_chat_uploads", id } }),
    onSuccess: () => { toast.success("Fájl törölve a mappából"); qc.invalidateQueries({ queryKey: ["documents"] }); },
    onError: (e: Error) => toast.error("A fájl nem törölhető", { description: e.message }),
  });
  const rows = useMemo(() => {
    const terms = searchKey(query).split(" ").filter(Boolean);
    return (list.data?.rows ?? []).filter((r) => terms.every((t) => searchKey(`${r.name} ${r.uploader_name ?? ""}`).includes(t)));
  }, [list.data, query]);

  if (roleLoading) return <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Betöltés…</div>;
  if (!folders.length) return <p className="text-sm text-muted-foreground">A szerepköröddel nincs chat-mappa.</p>;
  return (
    <div className={`flex min-h-0 flex-col gap-2 ${className ?? ""}`}>
      {folders.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Mappák">
          {(["all", ...folders] as const).map((f) => (
            <Button key={f} size="sm" variant={folder === f ? "default" : "outline"} className="h-7 rounded-full px-3 text-xs" onClick={() => setFolder(f)} role="tab" aria-selected={folder === f}>
              {f === "all" ? "Minden mappa" : CHAT_FOLDER_LABEL[f]}
            </Button>
          ))}
        </div>
      )}
      {folders.length === 1 && <div className="text-xs text-muted-foreground">{CHAT_FOLDER_LABEL[folders[0]]} — a szerepköröd minden tagja látja, és a Tulajdonos.</div>}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Keresés fájlnév vagy feltöltő szerint" className="pl-8" aria-label="Keresés a feltöltött fájlok között" />
      </div>
      {list.isLoading ? <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Betöltés…</div>
        : list.error ? <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">NINCS ADAT — a mappa most nem olvasható. <Button size="sm" variant="link" onClick={() => list.refetch()}>Újra</Button></div>
        : rows.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{query ? "Nincs találat." : "Ebben a mappában még nincs feltöltött fájl."}</p>
        : (
          <ul className="min-h-0 flex-1 divide-y overflow-y-auto rounded-md border" aria-label="Feltöltött fájlok">
            {rows.map((r) => {
              const uidKey = `ai_chat_uploads:${r.id}`;
              const att: ChatAttachment = { id: r.id, name: r.name, folder: r.folder, fileKey: r.file_url, mime: r.mime_type, size: r.size_bytes };
              return (
                <li key={r.id} className="flex flex-col gap-1.5 p-2.5 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    {isImageName(r.name) ? <ImageIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{r.name}</div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                        <span>{formatDateTime(r.created_at)}</span>
                        {formatBytes(r.size_bytes) && <span>{formatBytes(r.size_bytes)}</span>}
                        <span>{r.uploader_name ?? "Munkatárs"}</span>
                        {folder === "all" && <Badge variant="outline" className="h-4 px-1.5 text-[10px]">{CHAT_FOLDER_LABEL[r.folder]}</Badge>}
                        {r.link_table && <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{LINK_KIND_LABEL[r.link_table]}</Badge>}
                      </div>
                      {failures[uidKey] && <div className="text-[11px] text-destructive">{failures[uidKey].title}</div>}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1 self-end sm:self-auto">
                    {onAttach && <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => onAttach(att)} title="Csatolás a következő üzenethez"><Plus className="mr-1 h-3.5 w-3.5" />Chathez</Button>}
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => open({ uid: uidKey, fileKey: r.file_url, name: r.name })} disabled={pending === uidKey} title="Megnyitás">
                      {pending === uidKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    </Button>
                    {canDeleteChatUpload(role, user?.id, r) && (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" title="Törlés a mappából" disabled={remove.isPending}
                        onClick={() => { if (window.confirm(`Biztosan törlöd: „${r.name}”? Ha az ügyhöz is mentetted, ott megmarad.`)) remove.mutate(r.id); }}>
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      {(list.data?.count ?? 0) > CHAT_UPLOAD_LIMIT && <p className="text-[11px] text-muted-foreground">Hiányos lista: a legutóbbi {CHAT_UPLOAD_LIMIT} fájl látszik ({list.data?.count} összesen). Keress névre a régebbiekért.</p>}
    </div>
  );
}
