import { createFileRoute, Link } from "@tanstack/react-router";
import { Briefcase } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  ResourcePage,
  fmtDate,
  useLookup,
} from "@/components/resource/resource-page";
import {
  PROJECT_STATUS,
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_TONE,
} from "@/lib/viba-constants";
import { useAuth } from "@/hooks/use-auth";
import { Checkbox } from "@/components/ui/checkbox";
import { usePermissions } from "@/hooks/use-permissions";
import { useAssigneeLookup } from "@/lib/sales/use-assignee-name";
import { projectManagerOf } from "@/lib/pm/pm-day-flow";

function ProjectsPage() {
  const companyLabel = useLookup("companies", "name");
  const { user } = useAuth();
  const { role } = usePermissions();
  const pmName = useAssigneeLookup();
  // Projektvezetőnek alapból a saját projektjei látszanak; a jelölő kikapcsolható.
  const [mineChoice, setOnlyMine] = useState<boolean | null>(null);
  const onlyMine = mineChoice ?? role === "project_manager";
  return (
    <ResourcePage
      title="Projektek"
      description="Kivitelezési munkák · helyszínek, projektállapotok és határidők."
      emptyTitle="Itt jelennek meg a projektjeink."
      emptyDescription={`A „Új projekt” gombbal indíthatsz új munkát. Minden ajánlat, feladat és dokumentum a projekt köré szerveződik.`}
      newButtonLabel="Új projekt"
      icon={Briefcase}
      table="projects"
      filter={(rows) =>
        onlyMine && user?.id
          ? rows.filter((r) => projectManagerOf(r) === user.id)
          : rows
      }
      toolbar={
        <div className="flex items-center gap-2">
          <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm"><Checkbox checked={onlyMine} onCheckedChange={(checked) => setOnlyMine(checked === true)} disabled={!user?.id} />Saját projektjeim</label>
          {onlyMine && (
            <span className="text-xs text-muted-foreground">
              Csak azok a projektek látszanak, ahol te vagy a kijelölt projektvezető.
            </span>
          )}
        </div>
      }
      fields={[
        { name: "title", label: "Projekt megnevezése", type: "text", required: true },
        {
          name: "company_id",
          label: "Ügyfél",
          type: "ref",
          ref: { table: "companies", labelColumn: "name" },
        },
        // FIGYELEM: a `lead_id` mező szándékosan nincs itt.
        // Lead → projekt kapcsolat kizárólag a Sales pipeline „Megnyertük”
        // gombján keresztül jön létre (sales_mark_won_with_project RPC,
        // atomic módon). Ezzel elkerülhető a `uq_projects_lead_id`
        // ütközés és a `won_requires_project` trigger hiba.
        {
          name: "status",
          label: "Státusz",
          type: "select",
          options: PROJECT_STATUS.map((s) => ({ value: s.value, label: s.label })),
          required: true,
        },
        { name: "address", label: "Helyszín / cím", type: "text" },
        { name: "start_date", label: "Kezdés", type: "date" },
        { name: "deadline", label: "Határidő", type: "date" },
        { name: "description", label: "Leírás", type: "textarea" },
      ]}
      columns={[
        {
          key: "title",
          label: "Megnevezés",
          className: "font-medium",
          render: (r) => (
            <Link
              to="/projects/$id"
              params={{ id: r.id }}
              className="text-primary hover:underline"
            >
              {r.title}
            </Link>
          ),
        },
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
        {
          key: "status",
          label: "Státusz",
          render: (r) => (
            <Badge variant="outline" className={PROJECT_STATUS_TONE[r.status] ?? ""}>
              {PROJECT_STATUS_LABEL[r.status] ?? r.status ?? "—"}
            </Badge>
          ),
        },
        { key: "pm", label: "Projektvezető", className: "text-muted-foreground", render: (r) => pmName(projectManagerOf(r)) },
        { key: "address", label: "Helyszín", className: "text-muted-foreground" },
        {
          key: "deadline",
          label: "Határidő",
          render: (r) => fmtDate(r.deadline),
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

export const Route = createFileRoute("/_authenticated/projects/")({
  head: () => ({ meta: [
    { title: "Kivitelezési projektek | VIBA CRM" },
    { name: "description", content: "VIBA kivitelezési munkák, helyszínek, projektállapotok és határidők." },
    { property: "og:title", content: "Kivitelezési projektek | VIBA CRM" },
    { property: "og:description", content: "Kivitelezési munkák, projektfelelősök és határidők." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: ProjectsPage,
});