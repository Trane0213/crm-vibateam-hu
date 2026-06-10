import { createFileRoute } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { ResourcePage, fmtDate } from "@/components/resource/resource-page";

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
          options: [
            { value: "ugyfel", label: "Ügyfél" },
            { value: "alvallalkozo", label: "Alvállalkozó" },
            { value: "beszallito", label: "Beszállító" },
            { value: "potencialis", label: "Potenciális" },
          ],
        },
        { name: "tax_number", label: "Adószám", type: "text" },
        { name: "website", label: "Weboldal", type: "text", placeholder: "https://" },
        { name: "notes", label: "Megjegyzés", type: "textarea" },
      ]}
      columns={[
        { key: "name", label: "Cégnév", className: "font-medium" },
        { key: "company_type", label: "Típus" },
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