import { createFileRoute, Link } from "@tanstack/react-router";
import { UserPlus } from "lucide-react";
import {
  ResourcePage,
  fmtDate,
  useLookup,
} from "@/components/resource/resource-page";
import { PersonalContactDialog } from "@/components/projects/personal-contact-dialog";
import { ContactQualityCell, ContactLinkStateCell } from "@/components/customers/contact-quality-cell";
import { ContactConflictBadgeCell, ContactMetricCell, ContactPercentCell } from "@/components/customers/contact-crm-cells";

function ContactsPage() {
  const companyLabel = useLookup("companies", "name");
  return (
    <ResourcePage
      title="Kapcsolattartók"
      description="Cégekhez tartozó személyek — döntéshozók, beszerzők, kivitelezők."
      emptyTitle="Itt tároljuk a kapcsolattartókat."
      emptyDescription={`A „Új kapcsolattartó” gombbal vehetsz fel egy új személyt — köthető céghez és projektekhez.`}
      newButtonLabel="Új kapcsolattartó"
      icon={UserPlus}
      table="contacts"
      extraActions={<PersonalContactDialog />}
      fields={[
        { name: "name", label: "Név", type: "text", required: true },
        {
          name: "company_id",
          label: "Ügyfél",
          type: "ref",
          ref: { table: "companies", labelColumn: "name" },
        },
        { name: "position", label: "Beosztás", type: "text" },
        { name: "email", label: "E-mail", type: "text" },
        { name: "phone", label: "Telefon", type: "text" },
      ]}
      columns={[
        { key: "name", label: "Név", className: "font-medium" },
        { key: "position", label: "Beosztás" },
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
        { key: "email", label: "E-mail" },
        { key: "phone", label: "Telefon" },
        { key: "quality_pct", label: "Adatminőség", render: (r) => <ContactPercentCell contactId={r.id} /> },
        { key: "active_leads", label: "Aktív leadek", render: (r) => <ContactMetricCell contactId={r.id} field="activeLeadCount" /> },
        { key: "email_activity", label: "Email aktivitás", render: (r) => <ContactMetricCell contactId={r.id} field="emailActivityCount" /> },
        { key: "conflict_badge", label: "Konfliktus", render: (r) => <ContactConflictBadgeCell contactId={r.id} /> },
        {
          key: "quality",
          label: "Kapcsolat állapot",
          render: (r) => <ContactQualityCell row={r} />,
        },
        {
          key: "link_state",
          label: "Összekapcsolás",
          render: (r) => <ContactLinkStateCell row={r} />,
        },
        {
          key: "created_at",
          label: "Létrehozva",
          className: "text-muted-foreground",
          render: (r) => fmtDate(r.created_at),
        },
      ]}
    />
  );
}

export const Route = createFileRoute("/_authenticated/contacts/")({
  component: ContactsPage,
});