import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles, LayoutDashboard, List } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ResourcePage,
  fmtDate,
  useLookup,
} from "@/components/resource/resource-page";
import { LeadWorkspace } from "@/components/lead-workspace/lead-workspace";
import { usePermissions } from "@/hooks/use-permissions";

const STATUS_OPTIONS = [
  { value: "new", label: "Új" },
  { value: "contacted", label: "Felvettük" },
  { value: "quote_prep", label: "Ajánlat előkészítés" },
  { value: "quote_sent", label: "Ajánlat kiadva" },
  { value: "follow_up", label: "Utánkövetés" },
  { value: "contract", label: "Szerződés" },
  { value: "won", label: "Megnyert" },
  { value: "lost", label: "Elveszett" },
];

const STATUS_TONE: Record<string, string> = {
  new: "bg-[color:var(--status-info)]/15 text-[color:var(--status-info)] border-[color:var(--status-info)]/30",
  contacted: "bg-primary/10 text-primary border-primary/30",
  quote_prep: "bg-[color:var(--status-warning)]/15 text-[color:var(--status-warning)] border-[color:var(--status-warning)]/30",
  quote_sent: "bg-[color:var(--status-warning)]/15 text-[color:var(--status-warning)] border-[color:var(--status-warning)]/30",
  follow_up: "bg-primary/10 text-primary border-primary/30",
  contract: "bg-[color:var(--status-success)]/15 text-[color:var(--status-success)] border-[color:var(--status-success)]/30",
  won: "bg-[color:var(--status-success)]/15 text-[color:var(--status-success)] border-[color:var(--status-success)]/30",
  lost: "bg-destructive/10 text-destructive border-destructive/30",
};

function LeadsPage() {
  const { role } = usePermissions();
  const mode: "marketing" | "sales" = role === "sales" ? "sales" : "marketing";
  // Alap a munkafelület — a marketinges itt végzi a napi munkát egyetlen képernyőn.
  const [view, setView] = useState<"workspace" | "list">("workspace");

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b bg-background/60 px-6 py-2">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Érdeklődők</div>
        <div className="flex gap-1 rounded-md border bg-muted/30 p-0.5 text-[11px]">
          <Button
            size="sm" variant={view === "workspace" ? "default" : "ghost"}
            className="h-7 px-2 text-[11px]"
            onClick={() => setView("workspace")}
          >
            <LayoutDashboard className="mr-1 h-3.5 w-3.5" /> Munkafelület
          </Button>
          <Button
            size="sm" variant={view === "list" ? "default" : "ghost"}
            className="h-7 px-2 text-[11px]"
            onClick={() => setView("list")}
          >
            <List className="mr-1 h-3.5 w-3.5" /> Lista
          </Button>
        </div>
      </div>
      {view === "workspace" ? <LeadWorkspace mode={mode} /> : <LeadsListView />}
    </div>
  );
}

function LeadsListView() {
  const companyLabel = useLookup("companies", "name");
  const contactLabel = useLookup("contacts", "name");
  return (
    <ResourcePage
      title="Érdeklődők"
      description="Új érdeklődők és potenciális ügyfelek."
      emptyTitle="Itt jelennek meg az új érdeklődők."
      emptyDescription={`A „Új érdeklődő” gombbal rögzíthetsz egy beérkezett megkeresést — később ajánlattá és projektté alakítható.`}
      newButtonLabel="Új érdeklődő"
      icon={Sparkles}
      table="leads"
      fields={[
        {
          name: "company_id",
          label: "Ügyfél",
          type: "ref",
          ref: { table: "companies", labelColumn: "name" },
        },
        {
          name: "contact_id",
          label: "Kapcsolattartó",
          type: "ref",
          ref: { table: "contacts", labelColumn: "name" },
        },
        { name: "source", label: "Forrás", type: "text", placeholder: "pl. Weboldal, Ajánlás" },
        { name: "project_type", label: "Projekt típus", type: "text" },
        { name: "status", label: "Státusz", type: "select", options: STATUS_OPTIONS, required: true },
        { name: "summary", label: "Összefoglaló", type: "textarea" },
      ]}
      columns={[
        { key: "summary", label: "Összefoglaló", className: "font-medium max-w-[300px] truncate" },
        {
          key: "company",
          label: "Ügyfél",
          render: (r) =>
            r.company_id ? (
              <Link
                to="/customers/$id"
                params={{ id: r.company_id }}
                className="text-primary hover:underline"
              >
                {companyLabel(r.company_id)}
              </Link>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
        },
        { key: "contact", label: "Kapcsolattartó", render: (r) => contactLabel(r.contact_id) },
        { key: "source", label: "Forrás" },
        { key: "project_type", label: "Típus" },
        {
          key: "status",
          label: "Státusz",
          render: (r) => (
            <Badge variant="outline" className={STATUS_TONE[r.status] ?? ""}>
              {STATUS_OPTIONS.find((o) => o.value === r.status)?.label ?? r.status ?? "—"}
            </Badge>
          ),
        },
        {
          key: "created_at",
          label: "Létrejött",
          className: "text-muted-foreground",
          render: (r) => fmtDate(r.created_at),
        },
      ]}
    />
  );
}

export const Route = createFileRoute("/_authenticated/leads/")({
  component: LeadsPage,
});