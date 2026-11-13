import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, Download, Trash2, FileText, Loader2, AlertCircle } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { DocumentProcessingBadge, DocumentProcessingNotice, useDocumentProcessing } from "@/components/documents/document-processing-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/page-header";
import { formatDateTime } from "@/lib/format";
import { humanizeSupabaseError } from "@/lib/db-hooks";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/use-permissions";
import { r2DeleteDocument, r2GetStatus, r2PresignDownload } from "@/lib/r2.functions";
import { QUOTE_DOC_CATEGORIES } from "@/lib/r2-policy";

type Cat = (typeof QUOTE_DOC_CATEGORIES)[number];
export const QUOTE_DOC_LABEL: Record<Cat, string> = {
  unpriced_budget: "Árazatlan költségvetés (megrendelőtől)",
  priced_budget: "Árazott Excel-költségvetés",
  technical_plan: "Műszaki terv / dokumentáció",
  technical_scope: "Műszaki lehatárolás",
  contract_terms: "Szerződési / fizetési feltételek",
  sent_offer: "Kiküldött ajánlat",
  other: "Egyéb melléklet",
};

/** Ajánlati dokumentumok — a meglévő védett R2 tárolón (1/C szabályok). */
export function QuoteDocumentManager({ quoteId }: { quoteId: string }) {
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [cat, setCat] = useState<Cat>("unpriced_budget");
  const [deleting, setDeleting] = useState<any | null>(null);
  const [uploading, setUploading] = useState(false);
  const { role, profile } = usePermissions();
  const presign = useServerFn(r2PresignDownload);
  const del = useServerFn(r2DeleteDocument);
  const status = useServerFn(r2GetStatus);
  const r2 = useQuery({ queryKey: ["r2-status"], queryFn: () => status({}), staleTime: 60_000 });
  const key = ["quote_documents", quoteId];

  const docs = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.from("quote_documents" as any).select("*")
        .eq("quote_id", quoteId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      setUploading(true);
      const fd = new FormData();
      fd.append("file", file, file.name);
      fd.append("purpose", "quote");
      fd.append("targetId", quoteId);
      fd.append("category", cat);
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const res = await fetch("/api/r2-upload", { method: "POST", body: fd, headers: token ? { authorization: `Bearer ${token}` } : {} });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.key) throw new Error(j?.error ?? `Feltöltés sikertelen (HTTP ${res.status})`);
      const ins = await supabase.from("quote_documents" as any).insert({
        quote_id: quoteId, name: file.name, file_url: j.key, document_type: cat,
        mime_type: file.type || null, size_bytes: file.size ?? null,
      });
      if (ins.error) throw ins.error;
    },
    onSuccess: () => { toast.success("Dokumentum feltöltve"); qc.invalidateQueries({ queryKey: ["quote_documents"] }); },
    onError: (e: any) => toast.error("Feltöltési hiba", { description: e?.message ?? humanizeSupabaseError(e) }),
    onSettled: () => setUploading(false),
  });

  const download = useMutation({
    mutationFn: async (row: any) => {
      const { url } = await presign({ data: { key: row.file_url } });
      window.open(url, "_blank", "noopener,noreferrer");
    },
    onError: (e: any) => toast.error("Letöltési hiba", { description: humanizeSupabaseError(e) }),
  });

  const remove = useMutation({
    mutationFn: async (row: any) => { await del({ data: { table: "quote_documents", id: row.id } }); },
    onSuccess: () => { toast.success("Törölve"); qc.invalidateQueries({ queryKey: ["quote_documents"] }); setDeleting(null); },
    onError: (e: any) => toast.error("Törlési hiba", { description: humanizeSupabaseError(e) }),
  });

  const r2Ok = r2.data?.ok === true;
  const rows = docs.data ?? [];
  const processing = useDocumentProcessing("quote_documents", (docs.data ?? []).map((d: any) => d.id as string));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Ajánlati dokumentumok</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileInput} type="file" className="hidden" onChange={(e) => {
            const f = e.target.files?.[0]; if (f) upload.mutate(f); if (fileInput.current) fileInput.current.value = "";
          }} />
          <Select value={cat} onValueChange={(v) => setCat(v as Cat)}>
            <SelectTrigger className="h-9 w-[280px]" aria-label="Dokumentum típusa"><SelectValue /></SelectTrigger>
            <SelectContent>
              {QUOTE_DOC_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{QUOTE_DOC_LABEL[c]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" disabled={!r2Ok || uploading} onClick={() => fileInput.current?.click()}>
            {uploading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />} Feltöltés
          </Button>
        </div>
      </div>
      {!r2.isLoading && !r2Ok && (
        <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" /> Tárhely nem elérhető</Badge>
      )}
      {docs.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Betöltés…</div>
      ) : docs.error ? (
        <EmptyState icon={AlertCircle} title="Nem sikerült betölteni" description={humanizeSupabaseError(docs.error)} />
      ) : rows.length === 0 ? (
        <EmptyState icon={FileText} title="Még nincs dokumentum" description="Töltsd fel az eredeti költségvetést vagy a kész ajánlatot." />
      ) : (
        <div className="overflow-hidden rounded-md border">
          <DocumentProcessingNotice map={processing.data} />
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="px-3 py-2 text-left">Fájl</th><th className="px-3 py-2 text-left">Típus</th><th className="px-3 py-2 text-left">Feltöltve</th><th className="px-3 py-2 text-right">Művelet</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2 font-medium"><div>{r.name}</div><div className="mt-0.5"><DocumentProcessingBadge row={processing.data?.get(r.id)} loading={processing.isLoading || !!processing.error} /></div></td>
                  <td className="px-3 py-2"><Badge variant={r.document_type === "sent_offer" ? "default" : "secondary"}>{QUOTE_DOC_LABEL[r.document_type as Cat] ?? r.document_type}</Badge></td>
                  <td className="px-3 py-2">{formatDateTime(r.created_at)}</td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => download.mutate(r)} aria-label="Letöltés"><Download className="h-4 w-4" /></Button>
                    {(role === "owner" || (!!profile?.id && r.uploaded_by === profile.id)) && (
                      <Button size="sm" variant="ghost" onClick={() => setDeleting(r)} aria-label="Törlés"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dokumentum törlése</AlertDialogTitle>
            <AlertDialogDescription>Biztosan törlöd: <strong>{deleting?.name}</strong>? Nem visszavonható.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Mégse</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && remove.mutate(deleting)}>Törlés</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
