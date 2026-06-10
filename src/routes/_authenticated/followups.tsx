import { createFileRoute } from "@tanstack/react-router";
import { BellRing, Check } from "lucide-react";
import {
  ResourcePage,
  fmtDateTime,
  useLookup,
} from "@/components/resource/resource-page";

function FollowupsPage() {
  const projectLabel = useLookup("projects", "title");
  const companyLabel = useLookup("companies", "name");
  return (
    <ResourcePage
      title="Follow-up"
      description="Lejárt, ma esedékes és közelgő utánkövetések."
      icon={BellRing}
      table="followups"
      order="due_date"
      ascending={true}
      fields={[
        {
          name: "project_id",
          label: "Projekt",
          type: "ref",
          ref: { table: "projects", labelColumn: "title" },
        },
        {
          name: "company_id",
          label: "Cég",
          type: "ref",
          ref: { table: "companies", labelColumn: "name" },
        },
        {
          name: "quote_id",
          label: "Ajánlat",
          type: "ref",
          ref: { table: "quotes", labelColumn: "id" },
        },
        {
          name: "followup_type",
          label: "Típus",
          type: "select",
          options: [
            { value: "call", label: "Telefon" },
            { value: "email", label: "E-mail" },
            { value: "meeting", label: "Találkozó" },
            { value: "other", label: "Egyéb" },
          ],
        },
        { name: "due_date", label: "Esedékesség", type: "datetime", required: true },
        { name: "completed", label: "Lezárva", type: "boolean" },
        { name: "result", label: "Eredmény / jegyzet", type: "textarea" },
      ]}
      columns={[
        {
          key: "due_date",
          label: "Esedékesség",
          className: "font-medium tabular-nums",
          render: (r) => {
            const overdue =
              r.due_date && !r.completed && new Date(r.due_date) < new Date();
            return (
              <span className={overdue ? "text-destructive font-semibold" : ""}>
                {fmtDateTime(r.due_date)}
              </span>
            );
          },
        },
        { key: "followup_type", label: "Típus" },
        { key: "project", label: "Projekt", render: (r) => projectLabel(r.project_id) },
        { key: "company", label: "Cég", render: (r) => companyLabel(r.company_id) },
        {
          key: "completed",
          label: "Lezárva",
          render: (r) =>
            r.completed ? (
              <Check className="h-4 w-4 text-[color:var(--status-success)]" />
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
        },
        { key: "result", label: "Eredmény", className: "text-muted-foreground max-w-[260px] truncate" },
      ]}
    />
  );
}

export const Route = createFileRoute("/_authenticated/followups")({
  component: FollowupsPage,
});