import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { BellRing, Check } from "lucide-react";
import { useState } from "react";
import {
  ResourcePage,
  fmtDateTime,
  useLookup,
} from "@/components/resource/resource-page";
import { Badge } from "@/components/ui/badge";
import {
  bucketFollowup,
  BUCKET_LABEL,
  BUCKET_TONE,
  type FollowupBucket,
} from "@/lib/followup-alerts";

function FollowupsPage() {
  const projectLabel = useLookup("projects", "title");
  const companyLabel = useLookup("companies", "name");
  const [active, setActive] = useState<FollowupBucket | "all">("all");
  const buckets: (FollowupBucket | "all")[] = [
    "all", "overdue", "due-3d", "due-7d", "due-14d", "due-30d", "future", "done",
  ];
  return (
    <div>
    <div className="flex flex-wrap gap-1.5 border-b bg-background px-6 py-2">
      {buckets.map((b) => (
        <button
          key={b}
          onClick={() => setActive(b)}
          className={`rounded-full border px-3 py-1 text-xs transition ${
            active === b
              ? "bg-primary text-primary-foreground border-primary"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          {b === "all" ? "Mind" : BUCKET_LABEL[b]}
        </button>
      ))}
    </div>
    <ResourcePage
      title="Follow-up"
      description="Itt kezelheted az ajánlatok és projektek utánkövetését."
      emptyTitle="Itt kezelheted az utánkövetéseket."
      emptyDescription={`Még nincs felvett follow-up. A „Új follow-up” gombbal rögzíthetsz egyet (pl. visszahívás, ajánlat-emlékeztető).`}
      newButtonLabel="Új follow-up"
      icon={BellRing}
      table="followups"
      order="due_date"
      ascending={true}
      filter={(rows) => {
        if (active === "all") return rows;
        return rows.filter((r) => bucketFollowup(r.due_date, r.completed) === active);
      }}
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
          ref: {
            table: "quotes",
            labelColumn: "version",
            extraColumns: ["version", "status", "total_amount", "created_at"],
            formatLabel: (r: any) => {
              const v = r.version != null ? `v${r.version}` : `#${String(r.id).slice(0, 6)}`;
              const s = r.status ? ` · ${r.status}` : "";
              return `${v}${s}`;
            },
          },
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
          key: "bucket",
          label: "Állapot",
          render: (r) => {
            const b = bucketFollowup(r.due_date, r.completed);
            return (
              <Badge variant="outline" className={`text-[10px] ${BUCKET_TONE[b]}`}>
                {BUCKET_LABEL[b]}
              </Badge>
            );
          },
        },
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
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/followups")({
  component: FollowupsPage,
});