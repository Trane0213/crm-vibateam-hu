import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { XCircle, RotateCcw, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-log";
import { humanizeSupabaseError } from "@/lib/db-hooks";
import { useLookup, fmtDate } from "@/components/resource/resource-page";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  LOST_REASON_LABEL,
  LEAD_STATUS_LABEL,
  type LostReason,
  type LeadStatus,
} from "@/lib/sales/constants";

// A mentett lost_stage értékből megmondja, melyik pipeline-státuszba
// kerüljön vissza a lead. A jelenlegi DB constraint csak két értéket
// enged: 'pre_pipeline' (Workspace-ből veszett el) és 'pipeline'
// (Pipeline kanbanról veszett el). Amíg a séma nem tárolja a pontos
// szakaszt, ez a térkép a kanonikus visszaállítás.
function resolveResumeStatus(lost_stage: string | null | undefined): LeadStatus {
  if (lost_stage === "pre_pipeline") return "contacted";
  if (lost_stage === "pipeline") return "quote_prep";
  // Felkészítve a jövőbeni pontos tárolásra: ha már magát a státuszt mentjük.
  if (
    lost_stage === "contacted" ||
    lost_stage === "quote_prep" ||
    lost_stage === "quote_sent" ||
    lost_stage === "follow_up" ||
    lost_stage === "contract"
  ) {
    return lost_stage as LeadStatus;
  }
  return "quote_prep";
}

type LostLead = {
  id: string;
  summary: string | null;
  company_id: string | null;
  source: string | null;
  status: string;
  lost_at: string | null;
  lost_reason: string | null;
  lost_note: string | null;
  lost_stage: string | null;
  created_at: string;
};

function LostLeadsPage() {
  const qc = useQueryClient();
  const companyLabel = useLookup("companies", "name");
  const [search, setSearch] = useState("");
  const [reactivateTarget, setReactivateTarget] = useState<LostLead | null>(null);

  const leadsQ = useQuery({
    queryKey: ["leads", "lost"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select(
          "id, summary, company_id, source, status, lost_at, lost_reason, lost_note, lost_stage, created_at",
        )
        .eq("status", "lost")
        .order("lost_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as LostLead[];
    },
  });

  const leadIds = useMemo(() => (leadsQ.data ?? []).map((l) => l.id), [leadsQ.data]);

  // Utolsó aktivitás minden látható elveszett leadre — egyetlen lekérdezés.
  const lastActivityQ = useQuery({
    queryKey: ["leads", "lost", "last-activity", leadIds.join(",")],
    enabled: leadIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activities")
        .select("created_at, details")
        .eq("details->>entity_type", "leads")
        .in("details->>entity_id", leadIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const map = new Map<string, string>();
      for (const r of (data ?? []) as any[]) {
        const id = r.details?.entity_id as string | undefined;
        if (id && !map.has(id)) map.set(id, r.created_at);
      }
      return map;
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (leadsQ.data ?? []).filter((l) => {
      if (!q) return true;
      const hay = `${l.summary ?? ""} ${companyLabel(l.company_id) ?? ""} ${
        l.source ?? ""
      } ${l.lost_note ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [leadsQ.data, search, companyLabel]);

  const reactivate = useMutation({
    mutationFn: async (lead: LostLead) => {
      const resume = resolveResumeStatus(lead.lost_stage);
      const patch: Record<string, any> = {
        status: resume,
        lost_at: null,
        lost_reason: null,
        lost_note: null,
        lost_stage: null,
      };
      // Ha Pipeline-ra kerül vissza és még nem volt belépve, állítsuk be.
      if (resume !== "contacted") {
        patch.pipeline_entered_at = new Date().toISOString();
      }
      const { error } = await supabase.from("leads").update(patch).eq("id", lead.id);
      if (error) throw error;
      await logActivity("leads", "status_change", lead.id, {
        from: "lost",
        to: resume,
        reason: "reactivated",
      });
      return resume;
    },
    onError: (e: any) =>
      toast.error("Újra aktiválás sikertelen", { description: humanizeSupabaseError(e) }),
    onSuccess: (resume) => {
      toast.success(`Lead újra aktiválva — ${LEAD_STATUS_LABEL[resume]}`);
      setReactivateTarget(null);
      qc.invalidateQueries({ queryKey: ["leads"] });
      // A Pipeline kanban külön cache-en él — frissítsük, hogy a visszahozott
      // lead azonnal megjelenjen, ha az értékesítő a Pipeline tabon van.
      qc.invalidateQueries({ queryKey: ["pipeline"] });
    },
  });

  return (
    <div className="flex h-full flex-col">
      <header className="border-b bg-background/60 px-6 py-3">
        <div className="flex items-center gap-2">
          <XCircle className="h-4 w-4 text-destructive" />
          <h1 className="text-sm font-medium">Elveszett leadek</h1>
          <Badge variant="outline" className="ml-2 text-[10px]">
            {leadsQ.data?.length ?? 0}
          </Badge>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Minden elveszett lead — Workspace-ből és Pipeline-ból egyaránt. Az „Újra aktiválás” gomb
          visszaviszi a leadet arra a szakaszra, ahonnan elveszett.
        </p>
      </header>

      <div className="border-b px-6 py-2">
        <Input
          placeholder="Keresés név, cég, forrás, megjegyzés szerint…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 max-w-md text-sm"
        />
      </div>

      <div className="flex-1 overflow-auto">
        {leadsQ.isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Töltés…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Nincs elveszett lead. Ha egy leadet „Elveszett”-nek jelölsz a Workspace-en vagy a
            Pipeline-on, itt jelenik meg.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Cég</TableHead>
                <TableHead>Honnan</TableHead>
                <TableHead>Elvesztés oka</TableHead>
                <TableHead>Elvesztés dátuma</TableHead>
                <TableHead>Utolsó aktivitás</TableHead>
                <TableHead className="text-right">Művelet</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((l) => {
                const resume = resolveResumeStatus(l.lost_stage);
                const last = lastActivityQ.data?.get(l.id) ?? null;
                return (
                  <TableRow key={l.id}>
                    <TableCell className="max-w-[280px]">
                      <div className="truncate font-medium">{l.summary ?? "—"}</div>
                      {l.source && (
                        <div className="text-[11px] text-muted-foreground">{l.source}</div>
                      )}
                    </TableCell>
                    <TableCell>{companyLabel(l.company_id) ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {l.lost_stage === "pre_pipeline"
                          ? "Workspace"
                          : l.lost_stage === "pipeline"
                            ? "Pipeline"
                            : l.lost_stage
                              ? LEAD_STATUS_LABEL[l.lost_stage as LeadStatus] ?? l.lost_stage
                              : "—"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {l.lost_reason ? (
                        <span>{LOST_REASON_LABEL[l.lost_reason as LostReason] ?? l.lost_reason}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                      {l.lost_note && (
                        <div
                          className="text-[11px] text-muted-foreground line-clamp-1"
                          title={l.lost_note}
                        >
                          {l.lost_note}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{fmtDate(l.lost_at)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {last ? fmtDate(last) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setReactivateTarget(l)}
                        className="gap-1.5"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Újra aktiválás
                        <ArrowRight className="h-3 w-3 opacity-60" />
                        <span className="text-[10px] text-muted-foreground">
                          {LEAD_STATUS_LABEL[resume]}
                        </span>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog
        open={!!reactivateTarget}
        onOpenChange={(v) => {
          if (!reactivate.isPending && !v) setReactivateTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lead újra aktiválása</DialogTitle>
            <DialogDescription>
              {reactivateTarget && (() => {
                const resume = resolveResumeStatus(reactivateTarget.lost_stage);
                const target =
                  resume === "contacted"
                    ? `a Workspace „${LEAD_STATUS_LABEL[resume]}” szakaszába`
                    : `a Pipeline „${LEAD_STATUS_LABEL[resume]}” szakaszába`;
                return `A lead visszakerül ${target}. Az elvesztés oka és megjegyzése törlődik.`;
              })()}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReactivateTarget(null)}
              disabled={reactivate.isPending}
            >
              Mégse
            </Button>
            <Button
              onClick={() => reactivateTarget && reactivate.mutate(reactivateTarget)}
              disabled={reactivate.isPending}
            >
              {reactivate.isPending ? "Újra aktiválás…" : "Újra aktiválás"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/leads/lost")({
  component: LostLeadsPage,
});