import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, AlertTriangle, Copy, Mail, ArrowRightCircle } from "lucide-react";
import { ResourcePage } from "@/components/resource/resource-page";
import { COMPANY_TYPE, COMPANY_TYPE_LABEL } from "@/lib/viba-constants";
import { loadCompanySurfaceMap } from "@/lib/crm/crm-surface";
import { FilterBar, FilterSelect, QualityBar } from "@/components/marketing-ui";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/companies/")({
  component: CompaniesIndex,
});

function CompaniesIndex() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");

  const surfaceQ = useQuery({
    queryKey: ["companies", "surface-map"],
    queryFn: loadCompanySurfaceMap,
    staleTime: 60_000,
  });

  function filterFn(rows: any[]) {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (category && r.company_type !== category) return false;
      if (!s) return true;
      const hay = `${r.name ?? ""} ${r.website ?? ""} ${r.tax_number ?? ""}`.toLowerCase();
      return hay.includes(s);
    });
  }

  const surface = surfaceQ.data;

  return (
    <ResourcePage
      title="Cégek"
      description="Ügyfelek és partnercégek — marketing nézet."
      emptyTitle="Még nincs cég a CRM-ben."
      emptyDescription={`A „Új cég” gombbal vehetsz fel egy új ügyfelet vagy partnert.`}
      newButtonLabel="Új cég"
      icon={Building2}
      table="companies"
      order="name"
      ascending
      filter={filterFn}
      toolbar={
        <FilterBar
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Keresés cégnév, weboldal, adószám…"
          onReset={search || category ? () => { setSearch(""); setCategory(""); } : undefined}
        >
          <FilterSelect
            value={category}
            onChange={setCategory}
            placeholder="Minden kategória"
            options={COMPANY_TYPE.map((c) => ({ value: c.value, label: c.label }))}
          />
        </FilterBar>
      }
      fields={[
        { name: "name", label: "Cégnév", type: "text", required: true },
        { name: "company_type", label: "Kategória", type: "select",
          options: COMPANY_TYPE.map((c) => ({ value: c.value, label: c.label })) },
        { name: "tax_number", label: "Adószám", type: "text" },
        { name: "website", label: "Weboldal", type: "text", placeholder: "https://" },
        { name: "notes", label: "Megjegyzés", type: "textarea" },
      ]}
      columns={[
        {
          key: "name", label: "Cégnév", className: "font-medium",
          render: (r) => (
            <div className="flex flex-col gap-0.5">
              <Link to="/customers/$id" params={{ id: r.id }} className="text-primary hover:underline">
                {r.name}
              </Link>
              {r.company_type && (
                <span className="text-[11px] text-muted-foreground">
                  {COMPANY_TYPE_LABEL[r.company_type] ?? r.company_type}
                </span>
              )}
            </div>
          ),
        },
        {
          key: "quality", label: "Adatminőség",
          render: (r) => <QualityBar pct={surface?.get(r.id)?.qualityPct ?? 0} />,
        },
        {
          key: "duplicates", label: "Duplikátum",
          render: (r) => {
            const n = surface?.get(r.id)?.duplicateCount ?? 0;
            return n > 0 ? (
              <Link to="/data-quality" className="inline-flex items-center gap-1 text-[color:var(--status-warning)] hover:underline" title="Duplikátum-jelöltek a Data Quality-ben">
                <Copy className="h-3.5 w-3.5" />
                <span className="tabular-nums font-medium">{n}</span>
              </Link>
            ) : <span className="text-muted-foreground tabular-nums">0</span>;
          },
        },
        {
          key: "conflicts", label: "Konfliktus",
          render: (r) => {
            const n = surface?.get(r.id)?.conflictCount ?? 0;
            return n > 0 ? (
              <Link to="/data-quality" className="inline-flex items-center gap-1 text-destructive hover:underline" title="Kapcsolattartó-konfliktus">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span className="tabular-nums font-medium">{n}</span>
              </Link>
            ) : <span className="text-muted-foreground tabular-nums">0</span>;
          },
        },
        {
          key: "leads", label: "Aktív lead",
          render: (r) => {
            const n = surface?.get(r.id)?.activeLeadCount ?? 0;
            return n > 0
              ? <span className="tabular-nums font-medium text-primary">{n}</span>
              : <span className="text-muted-foreground tabular-nums">0</span>;
          },
        },
        {
          key: "email_activity", label: "Email akt.",
          render: (r) => {
            const n = surface?.get(r.id)?.emailActivityCount ?? 0;
            return n > 0 ? (
              <span className="inline-flex items-center gap-1 tabular-nums text-foreground">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />{n}
              </span>
            ) : <span className="text-muted-foreground tabular-nums">0</span>;
          },
        },
        {
          key: "sales_ready", label: "Sales ready",
          render: (r) => {
            const s = surface?.get(r.id);
            const ready = (s?.activeLeadCount ?? 0) > 0 && (s?.qualityPct ?? 0) >= 70;
            return ready ? (
              <Badge className="border-[color:var(--status-success)]/60 bg-[color:var(--status-success)]/15 px-2.5 py-1 text-[color:var(--status-success)] font-semibold shadow-sm">
                <ArrowRightCircle className="mr-1 h-3.5 w-3.5" />Átadható
              </Badge>
            ) : <span className="text-muted-foreground">—</span>;
          },
        },
      ]}
    />
  );
}