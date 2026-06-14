import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { SalesShell } from "@/components/sales/sales-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/sales/handoff")({
  component: SalesHandoffPage,
});

function SalesHandoffPage() {
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["sales", "won-without-project"],
    queryFn: async () => {
      const { data: wonLeads, error } = await supabase
        .from("leads")
        .select("id, summary, source, won_at, company_id")
        .eq("status", "won")
        .order("won_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const ids = (wonLeads ?? []).map((l: any) => l.id);
      if (ids.length === 0) return [];
      const { data: projects } = await supabase
        .from("projects")
        .select("lead_id")
        .in("lead_id", ids);
      const taken = new Set((projects ?? []).map((p: any) => p.lead_id));
      return (wonLeads ?? []).filter((l: any) => !taken.has(l.id));
    },
  });

  return (
    <SalesShell
      title="Megnyert → Projekt átadás"
      description="Megnyert leadek, amelyekből még nem indult projekt. A létrehozás itt csak váz."
    >
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Betöltés…</div>
          ) : (data?.length ?? 0) === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              Minden megnyert lead már projektté vált.
            </div>
          ) : (
            <ul className="divide-y">
              {data!.map((l: any) => (
                <li key={l.id} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/40">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {l.summary || `Lead #${String(l.id).slice(0, 8)}`}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      megnyerve: {l.won_at ? new Date(l.won_at).toLocaleDateString("hu-HU") : "—"} • forrás: {l.source ?? "—"}
                    </div>
                  </div>
                  <Link to="/leads/$id" params={{ id: l.id }} className="text-xs text-primary hover:underline">
                    lead
                  </Link>
                  <Button size="sm" onClick={() => setOpenLeadId(l.id)}>
                    Projekt indítása
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <HandoffSkeletonDialog leadId={openLeadId} onClose={() => setOpenLeadId(null)} />
    </SalesShell>
  );
}

function HandoffSkeletonDialog({ leadId, onClose }: { leadId: string | null; onClose: () => void }) {
  return (
    <Dialog open={!!leadId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Projekt indítása leadből</DialogTitle>
          <DialogDescription>
            Csak váz. A létrehozás (handoff_payload + projects insert) a Sales UI v2 fázisban
            jön. A backend trigger már ellenőrzi a <code>status='won'</code> szabályt.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Kapcsolattartó" placeholder="Név" />
          <Field label="Telefon" placeholder="+36 …" />
          <Field label="Email" placeholder="email@example.com" />
          <Field label="Cím" placeholder="Település, utca, házszám" />
          <Field label="Szerződés URL" placeholder="https://…" />
          <Field label="Start dátum" type="date" />
          <div className="sm:col-span-2">
            <Label className="text-xs">Megjegyzés</Label>
            <Textarea disabled placeholder="Hamarosan." className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Mégse</Button>
          <Button disabled title="Hamarosan">Létrehozás</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, placeholder, type = "text" }: { label: string; placeholder?: string; type?: string }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input disabled placeholder={placeholder} type={type} className="mt-1" />
    </div>
  );
}