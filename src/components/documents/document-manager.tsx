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
import { useLookup } from "@/components/resource/resource-page";
import { humanizeSupabaseError } from "@/lib/db-hooks";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/use-permissions";
import { useServerFn } from "@tanstack/react-start";
import { r2DeleteDocument, r2GetStatus } from "@/lib/r2.functions";
import { toast } from "sonner";
import { DocumentList } from "@/components/documents/document-list";
import { canDeleteDoc, canUploadDoc, normalizeDoc, type UnifiedDoc } from "@/lib/documents/document-access";

export type DocCategory = "quote" | "contract" | "plan" | "technical" | "photo" | "other";

export const CATEGORY_LABEL: Record<DocCategory, string> = {
  quote: "Ajánlat",
  contract: "Szerződés",
  plan: "Tervrajz",
  technical: "Műszaki dokumentáció",
  photo: "Fénykép",
  other: "Egyéb",
};

const CATEGORIES: DocCategory[] = ["quote", "contract", "plan", "technical", "photo", "other"];

// A public.project_documents tényleges sémája:
// id, project_id, name, file_url, document_type, created_at, uploaded_by

/** `initialFilter`: projektadatlapról pl. „Fénykép” nézettel nyitható; a feltöltési kategória is ehhez igazodik. */
/** `categoryFilter={false}`: a projekt adatlapon a kategória-csempék szűrnek, a lista nem ismétli őket. */
export function DocumentManager({ projectId, initialFilter = "all", categoryFilter = true }: { projectId?: string | null; initialFilter?: "all" | DocCategory; categoryFilter?: boolean }) {
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadCategory, setUploadCategory] = useState<DocCategory>(initialFilter === "all" ? "other" : initialFilter);
  const [deleting, setDeleting] = useState<UnifiedDoc | null>(null);
  const { role, profile } = usePermissions();
  const projectLabel = useLookup("projects", "title");
  const [uploading, setUploading] = useState(false);

  const deleteR2 = useServerFn(r2DeleteDocument);
  const getR2Status = useServerFn(r2GetStatus);

  const r2 = useQuery({ queryKey: ["r2-status"], queryFn: () => getR2Status({}), staleTime: 60_000 });

  const listKey = ["project_documents", "list", projectId ?? "all"];
  const docs = useQuery({
    queryKey: listKey,
    queryFn: async () => {
      let q = supabase.from("project_documents").select("*").order("created_at", { ascending: false });
      if (projectId) q = q.eq("project_id", projectId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      setUploading(true);
      // Server-side proxy upload — elkerüli a böngésző→R2 CORS preflight hibát.
      const fd = new FormData();
      fd.append("file", file, file.name);
      fd.append("purpose", "project");
      fd.append("targetId", projectId ?? "");
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
      // DB rekord — valós séma. uploaded_by FK → users_profile.id, ezért
      // auth.uid-ról át kell mapelni users_profile.id-ra.
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
        project_id: projectId ?? null,
        name: file.name,
        file_url: key,
        document_type: uploadCategory,
      };
      if (profileId) payload.uploaded_by = profileId;
      const ins = await supabase.from("project_documents").insert(payload);
      if (ins.error) throw ins.error;
    },
    onSuccess: () => {
      toast.success("Dokumentum feltöltve");
      qc.invalidateQueries({ queryKey: ["project_documents"] });
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
      await deleteR2({ data: { table: "project_documents", id: row.id } });
    },
    onSuccess: () => {
      toast.success("Törölve");
      qc.invalidateQueries({ queryKey: ["project_documents"] });
      qc.invalidateQueries({ queryKey: ["documents"] });
      setDeleting(null);
    },
    onError: (e: any) => toast.error("Törlési hiba", { description: humanizeSupabaseError(e) }),
  });

  const r2Ok = r2.data?.ok === true;
  const canUpload = canUploadDoc(role, "project_documents");
  const unified = (docs.data ?? []).map((r: any) => {
    const label = r.project_id ? projectLabel(r.project_id) : null;
    return normalizeDoc("project_documents", r, label && label !== "—" ? label : null);
  });

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
          <Select value={uploadCategory} onValueChange={(v) => setUploadCategory(v as DocCategory)}>
            <SelectTrigger className="h-9 w-full sm:w-[200px]" aria-label="Feltöltés kategóriája"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>)}
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
          {!projectId && (
            <p className="w-full text-xs text-muted-foreground">
              Itt projekt nélkül töltesz fel (NINCS ÖSSZEKÖTVE). Projekthez tartozó fájlt a projekt Dokumentumok fülén tölts fel, hogy a projektvezetői napi munkában és az átadásban is megjelenjen.
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">A te munkakörödben itt csak megnyitni lehet a dokumentumokat; feltölteni a projektvezető, a Sales vagy a tulajdonos tud.</p>
      )}

      <DocumentList
        docs={unified}
        loading={docs.isLoading}
        error={docs.error}
        onRetry={() => docs.refetch()}
        showParent={!projectId}
        initialCategory={initialFilter}
        categoryFilter={categoryFilter}
        emptyTitle="Még nincs dokumentum"
        emptyDescription={canUpload ? "Válaszd ki a kategóriát a feltöltés gomb mellett, majd tölts fel egy fájlt." : undefined}
        ariaLabel={projectId ? "Projekt dokumentumai" : "Projektdokumentumok"}
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