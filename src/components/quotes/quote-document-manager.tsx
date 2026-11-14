import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, Trash2, Loader2, AlertCircle } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { DocumentList } from "@/components/documents/document-list";
import { canDeleteDoc, canUploadDoc, normalizeDoc, type UnifiedDoc } from "@/lib/documents/document-access";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { humanizeSupabaseError } from "@/lib/db-hooks";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/use-permissions";
import { r2DeleteDocument, r2GetStatus } from "@/lib/r2.functions";
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
/** `locked`: zárolt (kiküldött) ajánlat — a „Kiküldött ajánlat” fájl törlését az adatbázis tiltja, a gomb sem látszik. */
export function QuoteDocumentManager({ quoteId, locked = false }: { quoteId: string; locked?: boolean }) {
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [cat, setCat] = useState<Cat>("unpriced_budget");
  const [deleting, setDeleting] = useState<UnifiedDoc | null>(null);
  const [uploading, setUploading] = useState(false);
  const { role, profile } = usePermissions();
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
    onSuccess: () => { toast.success("Dokumentum feltöltve"); qc.invalidateQueries({ queryKey: ["quote_documents"] }); qc.invalidateQueries({ queryKey: ["documents"] }); },
    onError: (e: any) => toast.error("Feltöltési hiba", { description: e?.message ?? humanizeSupabaseError(e) }),
    onSettled: () => setUploading(false),
  });

  const remove = useMutation({
    mutationFn: async (row: UnifiedDoc) => { await del({ data: { table: "quote_documents", id: row.id } }); },
    onSuccess: () => { toast.success("Törölve"); qc.invalidateQueries({ queryKey: ["quote_documents"] }); qc.invalidateQueries({ queryKey: ["documents"] }); setDeleting(null); },
    onError: (e: any) => toast.error("Törlési hiba", { description: humanizeSupabaseError(e) }),
  });

  const r2Ok = r2.data?.ok === true;
  const canUpload = canUploadDoc(role, "quote_documents");
  const unified = (docs.data ?? []).map((r: any) => normalizeDoc("quote_documents", r));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold">Ajánlati dokumentumok</h2>
        {canUpload && (
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileInput} type="file" className="hidden" onChange={(e) => {
              const f = e.target.files?.[0]; if (f) upload.mutate(f); if (fileInput.current) fileInput.current.value = "";
            }} />
            <Select value={cat} onValueChange={(v) => setCat(v as Cat)}>
              <SelectTrigger className="h-9 w-full sm:w-[280px]" aria-label="Dokumentum típusa"><SelectValue /></SelectTrigger>
              <SelectContent>
                {QUOTE_DOC_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{QUOTE_DOC_LABEL[c]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" disabled={!r2Ok || uploading} onClick={() => fileInput.current?.click()}>
              {uploading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />} Feltöltés
            </Button>
          </div>
        )}
      </div>
      {canUpload && !r2.isLoading && !r2Ok && (
        <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" /> A fájltár nem elérhető, feltöltés most nem lehetséges</Badge>
      )}
      <DocumentList
        docs={unified}
        loading={docs.isLoading}
        error={docs.error}
        onRetry={() => docs.refetch()}
        emptyTitle="Még nincs dokumentum"
        emptyDescription={canUpload ? "Töltsd fel az eredeti költségvetést vagy a kész ajánlatot." : undefined}
        ariaLabel="Ajánlati dokumentumok"
        renderActions={(d) => canDeleteDoc(role, profile?.id, d, { quoteLocked: locked }) ? (
          <Button size="sm" variant="ghost" className="h-9 sm:h-8" onClick={() => setDeleting(d)} aria-label={`${d.name} törlése`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
        ) : null}
      />
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
