import { createFileRoute } from "@tanstack/react-router";
import { UserPlus } from "lucide-react";
import {
  ResourcePage,
  fmtDate,
  useLookup,
} from "@/components/resource/resource-page";

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
      fields={[
        { name: "name", label: "Név", type: "text", required: true },
        {
          name: "company_id",
          label: "Cég",
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
        { key: "company", label: "Cég", render: (r) => companyLabel(r.company_id) },
        { key: "email", label: "E-mail" },
        { key: "phone", label: "Telefon" },
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