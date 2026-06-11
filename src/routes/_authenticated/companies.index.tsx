import { createFileRoute } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { ResourcePage, fmtDate } from "@/components/resource/resource-page";
import { COMPANY_TYPE, COMPANY_TYPE_LABEL } from "@/lib/viba-constants";

export const Route = createFileRoute("/_authenticated/companies/")({
  component: () => (
    <ResourcePage
      title="Cégek"
      description="Ügyfelek és partnercégek nyilvántartása."
      emptyTitle="Itt tároljuk az ügyfélcégeket."
      emptyDescription={`A „Új cég” gombbal vehetsz fel egy új ügyfelet vagy partnert.`}
      newButtonLabel="Új cég"
      icon={Building2}
      table="companies"
      fields={[
        { name: "name", label: "Cégnév", type: "text", required: true },
        {
          name: "company_type",
          label: "Típus",
          type: "select",
          options: COMPANY_TYPE.map((c) => ({ value: c.value, label: c.label })),
        },
        { name: "tax_number", label: "Adószám", type: "text" },
        { name: "website", label: "Weboldal", type: "text", placeholder: "https://" },
        { name: "notes", label: "Megjegyzés", type: "textarea" },
      ]}
      columns={[
        { key: "name", label: "Cégnév", className: "font-medium" },
        {
          key: "company_type",
          label: "Típus",
          render: (r) => COMPANY_TYPE_LABEL[r.company_type] ?? r.company_type ?? "—",
        },
        { key: "tax_number", label: "Adószám" },
        { key: "website", label: "Weboldal" },
        {
          key: "created_at",
          label: "Létrehozva",
          className: "text-muted-foreground",
          render: (r) => fmtDate(r.created_at),
        },
      ]}
    />
  ),
});