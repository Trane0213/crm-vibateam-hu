import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, Trash2, Loader2, AlertCircle } from "lucide-react";
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
import { useServerFn } from "@tanstack/react-start";
import { r2DeleteDocument, r2GetStatus } from "@/lib/r2.functions";
import { toast } from "sonner";
import { DocumentList } from "@/components/documents/document-list";
import { canDeleteDoc, canUploadDoc, normalizeDoc, type UnifiedDoc } from "@/lib/documents/document-access";

/**
 * Cég-szintű dokumentumkezelő.
 *
 * Tábla:    public.company_documents
 * FK:       company_id → companies.id (CASCADE)
 * Storage:  R2 — kulcs prefix: company-documents/<companyId>/<category>/<ts>-<safe>
 *
 * A marketing folyamatban (Scarlet → kampánycég → email → dokumentum → minősítés
 * → sales átadás) még nincs projekt, ezért NEM a project_documents táblát
 * használjuk. Sales/PM oldalon a projekt-szintű DocumentManager párhuzamosan
 * fut tovább.
 */

export type CompanyDocCategory =
  | "quote"
  | "contract"
  | "plan"
  | "technical"
  | "photo"
  | "marketing"
  | "other";

export const COMPANY_CATEGORY_LABEL: Record<CompanyDocCategory, string> = {
  quote: "Ajánlat",
  contract: "Szerződés",
  plan: "Tervrajz",
  technical: "Műszaki dokumentáció",
  photo: "Fénykép",
  marketing: "Marketing anyag",
  other: "Egyéb",
};

const CATEGORIES: CompanyDocCategory[] = [
  "marketing", "quote", "contract", "plan", "technical", "photo", "other",
];

export function CompanyDocumentManager({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadCategory, setUploadCategory] = useState<CompanyDocCategory>("marketing");
  const [deleting, setDeleting] = useState<UnifiedDoc | null>(null);
  const { role, profile } = usePermissions();
  const [uploading, setUploading] = useState(false);

  const deleteR2 = useServerFn(r2DeleteDocument);
  const getR2Status = useServerFn(r2GetStatus);

  const r2 = useQuery({ queryKey: ["r2-status"], queryFn: () => getR2Status({}), staleTime: 60_000 });

  const listKey = ["company_documents", "list", companyId];
  const docs = useQuery({
    queryKey: listKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_documents" as any)
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      setUploading(true);
      // Server-side proxy upload — elkerüli a böngésző→R2 CORS preflight hibát.
      const fd = new FormData();
      fd.append("file", file, file.name);
      fd.append("purpose", "company");
      fd.append("targetId", companyId);
      fd.append("category", uploadCategory);
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      let putRes: Response;
      try {
        putRes = await fetch("/api/r2-upload", {
          method: "POST",
          body: fd,
          headers: token ? { authorization: `Bearer ${token}` } : {},
        });
      } catch (netErr: any) {
        throw new Error(`Hálózati hiba a szerverhez: ${netErr?.message ?? netErr}`);
      }
      if (!putRes.ok) {
        let detail = "";
        try {
          const j = await putRes.json();
          detail = j?.error ?? j?.body ?? `${j?.status ?? putRes.status} ${j?.statusText ?? ""}`.trim();
        } catch {
          detail = await putRes.text().catch(() => "");
        }
        throw new Error(`R2 feltöltés sikertelen (HTTP ${putRes.status}): ${detail || "ismeretlen hiba"}`);
      }
      const { key } = (await putRes.json()) as { key: string };
      // uploaded_by FK → users_profile.id (lásd project_documents minta).
      const { data: userRes } = await supabase.auth.getUser();
      const authUid = userRes.user?.id ?? null;
      let profileId: string | null = null;
      if (authUid) {
        const { data: prof } = await supabase
          .from("users_profile")
          .select("id")
          .eq("auth_user_id", authUid)
          .maybeSingle();
        profileId = (prof as any)?.id ?? null;
      }
      const payload: any = {
        company_id: companyId,
        name: file.name,
        file_url: key,
        document_type: uploadCategory,
        mime_type: file.type || null,
        size_bytes: file.size ?? null,
        source: "manual",
      };
      if (profileId) payload.uploaded_by = profileId;
      const ins = await supabase.from("company_documents" as any).insert(payload);
      if (ins.error) throw ins.error;
    },
    onSuccess: () => {
      toast.success("Dokumentum feltöltve");
      qc.invalidateQueries({ queryKey: ["company_documents"] });
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: any) =>
      toast.error("Feltöltési hiba", {
        description: e?.message ?? humanizeSupabaseError(e),
        duration: 10000,
      }),
    onSettled: () => setUploading(false),
  });

  const remove = useMutation({
    mutationFn: async (row: UnifiedDoc) => {
      // 1/C: a szerver törli előbb a rekordot (jogosultsággal), utána a fájlt.
      await deleteR2({ data: { table: "company_documents", id: row.id } });
    },
    onSuccess: () => {
      toast.success("Törölve");
      qc.invalidateQueries({ queryKey: ["company_documents"] });
      qc.invalidateQueries({ queryKey: ["documents"] });
      setDeleting(null);
    },
    onError: (e: any) => toast.error("Törlési hiba", { description: humanizeSupabaseError(e) }),
  });

  const r2Ok = r2.data?.ok === true;
  const canUpload = canUploadDoc(role, "company_documents");
  const unified = (docs.data ?? []).map((r: any) => normalizeDoc("company_documents", r));

  return (
    <div className="space-y-4">
      {canUpload ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload.mutate(f);
              if (fileInput.current) fileInput.current.value = "";
            }}
          />
          <Select value={uploadCategory} onValueChange={(v) => setUploadCategory(v as CompanyDocCategory)}>
            <SelectTrigger className="h-9 w-full sm:w-[220px]" aria-label="Feltöltés kategóriája"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{COMPANY_CATEGORY_LABEL[c]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" disabled={!r2Ok || uploading} onClick={() => fileInput.current?.click()}>
            {uploading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
            Feltöltés
          </Button>
          {r2.isLoading && <span className="text-xs text-muted-foreground">Fájltár ellenőrzése…</span>}
          {!r2.isLoading && !r2Ok && (
            <Badge variant="destructive" className="gap-1">
              <AlertCircle className="h-3 w-3" /> A fájltár nem elérhető, feltöltés most nem lehetséges
            </Badge>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">A te munkakörödben itt csak megnyitni lehet a dokumentumokat.</p>
      )}

      <DocumentList
        docs={unified}
        loading={docs.isLoading}
        error={docs.error}
        onRetry={() => docs.refetch()}
        emptyTitle="Még nincs ügyfél-dokumentum"
        emptyDescription={canUpload ? "Tölts fel egy fájlt a feltöltés gombbal." : undefined}
        ariaLabel="Ügyfél dokumentumai"
        renderActions={(d) => canDeleteDoc(role, profile?.id, d) ? (
          <Button size="sm" variant="ghost" className="h-9 sm:h-8" onClick={() => setDeleting(d)} aria-label={`${d.name} törlése`} title="Törlés">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        ) : null}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dokumentum törlése</AlertDialogTitle>
            <AlertDialogDescription>
              Biztosan törlöd: <strong>{deleting?.name ?? ""}</strong>? Ez a művelet nem visszavonható.
            </AlertDialogDescription>
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