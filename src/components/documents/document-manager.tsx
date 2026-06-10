import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, Download, Trash2, FileText, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/page-header";
import { formatDateTime } from "@/lib/format";
import { humanizeSupabaseError } from "@/lib/db-hooks";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { r2DeleteObject, r2GetStatus, r2PresignDownload, r2PresignUpload } from "@/lib/r2.functions";
import { toast } from "sonner";

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
function getCategory(row: any): DocCategory {
  const c = String(row.document_type ?? "other").toLowerCase();
  if ((CATEGORIES as string[]).includes(c)) return c as DocCategory;
  return "other";
}
function getKey(row: any): string | null {
  return row.file_url ?? null;
}
function getName(row: any): string {
  return row.name ?? "Névtelen";
}

export function DocumentManager({ projectId }: { projectId?: string | null }) {
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadCategory, setUploadCategory] = useState<DocCategory>("other");
  const [filter, setFilter] = useState<"all" | DocCategory>("all");
  const [deleting, setDeleting] = useState<any | null>(null);
  const [uploading, setUploading] = useState(false);

  const presignUpload = useServerFn(r2PresignUpload);
  const presignDownload = useServerFn(r2PresignDownload);
  const deleteR2 = useServerFn(r2DeleteObject);
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
      const ts = Date.now();
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const key = `${projectId ?? "global"}/${uploadCategory}/${ts}-${safe}`;
      // Server-side proxy upload — elkerüli a böngésző→R2 CORS preflight hibát.
      const fd = new FormData();
      fd.append("file", file, file.name);
      fd.append("key", key);
      if (file.type) fd.append("contentType", file.type);
      let putRes: Response;
      try {
        putRes = await fetch("/api/r2-upload", { method: "POST", body: fd });
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
    },
    onError: (e: any) =>
      toast.error("Feltöltési hiba", {
        description: e?.message ?? humanizeSupabaseError(e),
        duration: 10000,
      }),
    onSettled: () => setUploading(false),
  });

  const download = useMutation({
    mutationFn: async (row: any) => {
      const key = getKey(row);
      if (!key) throw new Error("Hiányzó fájl-kulcs a rekordban.");
      const { url } = await presignDownload({ data: { key } });
      window.open(url, "_blank", "noopener,noreferrer");
    },
    onError: (e: any) => toast.error("Letöltési hiba", { description: humanizeSupabaseError(e) }),
  });

  const remove = useMutation({
    mutationFn: async (row: any) => {
      const key = getKey(row);
      if (key) {
        try { await deleteR2({ data: { key } }); } catch (e) { console.warn("R2 delete failed:", e); }
      }
      const { error } = await supabase.from("project_documents").delete().eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Törölve");
      qc.invalidateQueries({ queryKey: ["project_documents"] });
      setDeleting(null);
    },
    onError: (e: any) => toast.error("Törlési hiba", { description: humanizeSupabaseError(e) }),
  });

  const rows = (docs.data ?? []).filter((r) => filter === "all" || getCategory(r) === filter);
  const r2Ok = r2.data?.ok === true;

  return (
    <div className="space-y-4">
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
          <SelectTrigger className="h-9 w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" disabled={!r2Ok || uploading} onClick={() => fileInput.current?.click()}>
          {uploading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
          Feltöltés
        </Button>
        {!r2.isLoading && !r2Ok && (
          <Badge variant="destructive" className="gap-1">
            <AlertCircle className="h-3 w-3" /> R2 nem elérhető: {r2.data?.error ?? "ismeretlen"}
          </Badge>
        )}
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
        <TabsList>
          <TabsTrigger value="all">Mind ({docs.data?.length ?? 0})</TabsTrigger>
          {CATEGORIES.map((c) => (
            <TabsTrigger key={c} value={c}>{CATEGORY_LABEL[c]}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {docs.isLoading ? (
        <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Dokumentumok betöltése…
        </div>
      ) : docs.error ? (
        <EmptyState icon={AlertCircle} title="Nem sikerült betölteni" description={humanizeSupabaseError(docs.error)} />
      ) : rows.length === 0 ? (
        <EmptyState icon={FileText} title="Még nincs dokumentum" description="Tölts fel egy fájlt a feltöltés gombbal." />
      ) : (
        <div className="overflow-hidden rounded-md border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Fájl</th>
                <th className="px-3 py-2 text-left">Kategória</th>
                <th className="px-3 py-2 text-left">Feltöltve</th>
                <th className="px-3 py-2 text-right">Művelet</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium">{getName(r)}</td>
                  <td className="px-3 py-2"><Badge variant="secondary">{CATEGORY_LABEL[getCategory(r)]}</Badge></td>
                  <td className="px-3 py-2">{formatDateTime(r.created_at)}</td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => download.mutate(r)} title="Letöltés">
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleting(r)} title="Törlés">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
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
            <AlertDialogDescription>
              Biztosan törlöd: <strong>{deleting ? getName(deleting) : ""}</strong>? Ez a művelet nem visszavonható.
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