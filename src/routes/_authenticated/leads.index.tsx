import { createFileRoute } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  ResourcePage,
  fmtDate,
  useLookup,
} from "@/components/resource/resource-page";

const STATUS_OPTIONS = [
  { value: "new", label: "Új" },
  { value: "contacted", label: "Felvettük" },
  { value: "qualified", label: "Minősített" },
  { value: "converted", label: "Konvertált" },
  { value: "lost", label: "Elveszett" },
];

const STATUS_TONE: Record<string, string> = {
  new: "bg-[color:var(--status-info)]/15 text-[color:var(--status-info)] border-[color:var(--status-info)]/30",
  contacted: "bg-primary/10 text-primary border-primary/30",
  qualified: "bg-[color:var(--status-warning)]/15 text-[color:var(--status-warning)] border-[color:var(--status-warning)]/30",
  converted: "bg-[color:var(--status-success)]/15 text-[color:var(--status-success)] border-[color:var(--status-success)]/30",
  lost: "bg-destructive/10 text-destructive border-destructive/30",
};

function LeadsPage() {
  const companyLabel = useLookup("companies", "name");
  const contactLabel = useLookup("contacts", "name");
  return (
    <ResourcePage
      title="Leadek"
      description="Új érdeklődők és potenciális ügyfelek."
      emptyTitle="Itt jelennek meg az új érdeklődők."
      emptyDescription={`A „Új lead” gombbal rögzíthetsz egy beérkezett megkeresést — később ajánlattá és projektté alakítható.`}
      newButtonLabel="Új lead"
      icon={Sparkles}
      table="leads"
      fields={[
        {
          name: "company_id",
          label: "Cég",
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
        { key: "company", label: "Cég", render: (r) => companyLabel(r.company_id) },
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