import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  ResourcePage,
  fmtDate,
  useLookup,
} from "@/components/resource/resource-page";
import { formatHuf } from "@/lib/format";

const QUOTE_STATUS = [
  { value: "draft", label: "Készül" },
  { value: "sent", label: "Kiküldve" },
  { value: "negotiation", label: "Tárgyalás" },
  { value: "won", label: "Megnyert" },
  { value: "lost", label: "Elveszett" },
];

const STATUS_TONE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  sent: "bg-primary/10 text-primary border-primary/30",
  negotiation: "bg-[color:var(--status-warning)]/15 text-[color:var(--status-warning)] border-[color:var(--status-warning)]/30",
  won: "bg-[color:var(--status-success)]/15 text-[color:var(--status-success)] border-[color:var(--status-success)]/30",
  lost: "bg-destructive/10 text-destructive border-destructive/30",
};

function QuotesPage() {
  const projectLabel = useLookup("projects", "title");
  return (
    <ResourcePage
      title="Ajánlatok"
      description="Kiküldött és nyitott ajánlatok, státuszokkal és összegekkel."
      emptyTitle="Itt kezelheted az ajánlatokat."
      emptyDescription={`A „Új ajánlat” gombbal készíthetsz új ajánlatot — projekthez és ügyfélhez kötve.`}
      newButtonLabel="Új ajánlat"
      icon={FileText}
      table="quotes"
      fields={[
        {
          name: "project_id",
          label: "Projekt",
          type: "ref",
          ref: { table: "projects", labelColumn: "title" },
          required: true,
        },
        { name: "version", label: "Verzió", type: "number" },
        { name: "status", label: "Státusz", type: "select", options: QUOTE_STATUS, required: true },
        { name: "total_amount", label: "Összérték (HUF)", type: "number" },
      ]}
      columns={[
        {
          key: "project",
          label: "Projekt",
          className: "font-medium",
          render: (r) =>
            r.project_id ? (
              <Link
                to="/projects/$id"
                params={{ id: r.project_id }}
                className="text-primary hover:underline"
              >
                {projectLabel(r.project_id)}
              </Link>
            ) : (
              "—"
            ),
        },
        { key: "version", label: "Verzió", className: "tabular-nums" },
        {
          key: "status",
          label: "Státusz",
          render: (r) => (
            <Badge variant="outline" className={STATUS_TONE[r.status] ?? ""}>
              {QUOTE_STATUS.find((o) => o.value === r.status)?.label ?? r.status ?? "—"}
            </Badge>
          ),
        },
        {
          key: "total_amount",
          label: "Összérték",
          className: "text-right tabular-nums font-medium",
          render: (r) => (r.total_amount != null ? formatHuf(Number(r.total_amount)) : "—"),
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

export const Route = createFileRoute("/_authenticated/quotes/")({
  component: QuotesPage,
});