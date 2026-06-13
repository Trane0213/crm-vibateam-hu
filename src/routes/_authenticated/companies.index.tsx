import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, ExternalLink } from "lucide-react";
import { ResourcePage } from "@/components/resource/resource-page";
import { COMPANY_TYPE, COMPANY_TYPE_LABEL } from "@/lib/viba-constants";
import { loadCompanySurfaceMap } from "@/lib/crm/crm-surface";
import { FilterBar, FilterSelect, QualityBar, relativeTime } from "@/components/marketing-ui";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/companies/")({
  component: CompaniesIndex,
});

function CompaniesIndex() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [city, setCity] = useState("");

  const surfaceQ = useQuery({
    queryKey: ["companies", "surface-map"],
    queryFn: loadCompanySurfaceMap,
    staleTime: 60_000,
  });

  // Szűrő-opciók: a teljes lista alapján (nem a már szűrt halmazból).
  const allRowsRef = { current: [] as any[] };

  const cityOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of allRowsRef.current) if (r.city) set.add(r.city);
    return [...set].sort().map((v) => ({ value: v, label: v }));
    // a referencia mutáció miatt a memo újraszámol a setStateekre — opciók a renderelt sorokból generálódnak
  }, [search, category, city]); // eslint-disable-line react-hooks/exhaustive-deps

  function filterFn(rows: any[]) {
    allRowsRef.current = rows;
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (category && r.company_type !== category) return false;
      if (city && (r.city ?? "") !== city) return false;
      if (!s) return true;
      const hay = `${r.name ?? ""} ${r.website ?? ""} ${r.city ?? ""} ${r.tax_number ?? ""}`.toLowerCase();
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
          searchPlaceholder="Keresés cégnév, weboldal, város, adószám…"
          onReset={search || category || city ? () => { setSearch(""); setCategory(""); setCity(""); } : undefined}
        >
          <FilterSelect
            value={category}
            onChange={setCategory}
            placeholder="Minden kategória"
            options={COMPANY_TYPE.map((c) => ({ value: c.value, label: c.label }))}
          />
          <FilterSelect
            value={city}
            onChange={setCity}
            placeholder="Minden város"
            options={cityOptions}
          />
        </FilterBar>
      }
      fields={[
        { name: "name", label: "Cégnév", type: "text", required: true },
        { name: "company_type", label: "Kategória", type: "select",
          options: COMPANY_TYPE.map((c) => ({ value: c.value, label: c.label })) },
        { name: "city", label: "Város", type: "text" },
        { name: "tax_number", label: "Adószám", type: "text" },
        { name: "website", label: "Weboldal", type: "text", placeholder: "https://" },
        { name: "notes", label: "Megjegyzés", type: "textarea" },
      ]}
      columns={[
        {
          key: "name", label: "Cégnév", className: "font-medium",
          render: (r) => (
            <Link to="/customers/$id" params={{ id: r.id }} className="text-primary hover:underline">
              {r.name}
            </Link>
          ),
        },
        {
          key: "company_type", label: "Kategória",
          render: (r) => r.company_type
            ? <Badge variant="secondary" className="font-normal">{COMPANY_TYPE_LABEL[r.company_type] ?? r.company_type}</Badge>
            : <span className="text-muted-foreground">—</span>,
        },
        { key: "city", label: "Város", render: (r) => r.city || <span className="text-muted-foreground">—</span> },
        {
          key: "website", label: "Weboldal",
          render: (r) => r.website
            ? <a href={r.website.startsWith("http") ? r.website : `https://${r.website}`} target="_blank" rel="noreferrer"
                 className="inline-flex items-center gap-1 text-primary hover:underline">
                {r.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                <ExternalLink className="h-3 w-3" />
              </a>
            : <span className="text-muted-foreground">—</span>,
        },
        {
          key: "contacts", label: "Kapcsolat",
          render: (r) => <span className="tabular-nums">{surface?.get(r.id)?.contactCount ?? 0}</span>,
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
          key: "last_activity", label: "Utolsó aktivitás", className: "text-muted-foreground",
          render: (r) => {
            // egyszerű heurisztika: created_at fallback — pontosabb mező a customer_kpi_v-ben.
            const ts = r.updated_at ?? r.created_at;
            return <span className="text-xs">{relativeTime(ts)}</span>;
          },
        },
        {
          key: "quality", label: "Adatminőség",
          render: (r) => {
            const pct = surface?.get(r.id)?.qualityPct ?? 0;
            return <QualityBar pct={pct} />;
          },
        },
      ]}
    />
  );
}