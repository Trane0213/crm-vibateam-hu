import { createFileRoute, Link } from "@tanstack/react-router";
import { Briefcase } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

function ProjectsPage() {
  const companyLabel = useLookup("companies", "name");
  const { user } = useAuth();
  const [onlyMine, setOnlyMine] = useState(false);
  return (
    <ResourcePage
      title="Projektek"
      description="A rendszer központja — ügyfél, ajánlatok, feladatok, dokumentumok és kommunikáció egy helyen."
      emptyTitle="Itt jelennek meg a projektjeink."
      emptyDescription={`A „Új projekt” gombbal indíthatsz új munkát. Minden ajánlat, feladat és dokumentum a projekt köré szerveződik.`}
      newButtonLabel="Új projekt"
      icon={Briefcase}
      table="projects"
      filter={(rows) =>
        onlyMine && user?.id
          ? rows.filter((r) => r.project_manager_user_id === user.id)
          : rows
      }
      toolbar={
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={onlyMine ? "default" : "outline"}
            onClick={() => setOnlyMine((v) => !v)}
            disabled={!user?.id}
          >
            {onlyMine ? "Saját projektjeim ✓" : "Saját projektjeim"}
          </Button>
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
  component: ProjectsPage,
});