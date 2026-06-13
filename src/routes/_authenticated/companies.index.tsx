import { createFileRoute } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { ResourcePage, fmtDate } from "@/components/resource/resource-page";
import { COMPANY_TYPE, COMPANY_TYPE_LABEL } from "@/lib/viba-constants";
import { CompanyQualityCell, CompanyDuplicateCell } from "@/components/customers/customer-quality-cell";
import { CompanyConflictBadgeCell, CompanyCrmCountCell } from "@/components/customers/company-crm-cells";

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
        { key: "quality", label: "Adatminőség", render: (r) => <CompanyQualityCell companyId={r.id} /> },
        { key: "dups", label: "Duplikátum", render: (r) => <CompanyDuplicateCell companyId={r.id} /> },
        { key: "contacts", label: "Kapcsolattartók", render: (r) => <CompanyCrmCountCell companyId={r.id} field="contactCount" /> },
        { key: "leads", label: "Aktív leadek", render: (r) => <CompanyCrmCountCell companyId={r.id} field="activeLeadCount" /> },
        { key: "emails", label: "Email aktivitás", render: (r) => <CompanyCrmCountCell companyId={r.id} field="emailActivityCount" /> },
        { key: "conflicts", label: "Konfliktus", render: (r) => <CompanyConflictBadgeCell companyId={r.id} /> },
        { key: "identity", label: "Identity", render: (r) => <CompanyCrmCountCell companyId={r.id} field="identityStrength" /> },
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