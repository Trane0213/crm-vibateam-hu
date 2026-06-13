import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { UserPlus, AlertTriangle } from "lucide-react";
import { ResourcePage, useLookup } from "@/components/resource/resource-page";
import { PersonalContactDialog } from "@/components/projects/personal-contact-dialog";
import { loadContactSurfaceMap } from "@/lib/crm/crm-surface";
import { FilterBar, FilterSelect, StatusPill, relativeTime } from "@/components/marketing-ui";

function ContactsPage() {
  const companyLabel = useLookup("companies", "name");
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");

  const surfaceQ = useQuery({
    queryKey: ["contacts", "surface-map"],
    queryFn: loadContactSurfaceMap,
    staleTime: 60_000,
  });
  const surface = surfaceQ.data;

  const allRowsRef = { current: [] as any[] };
  const companyOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of allRowsRef.current) if (r.company_id) m.set(r.company_id, companyLabel(r.company_id) ?? r.company_id);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([v, l]) => ({ value: v, label: l }));
  }, [search, companyFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  function filterFn(rows: any[]) {
    allRowsRef.current = rows;
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (companyFilter && r.company_id !== companyFilter) return false;
      if (!s) return true;
      const hay = `${r.name ?? ""} ${r.email ?? ""} ${r.phone ?? ""} ${r.position ?? ""}`.toLowerCase();
      return hay.includes(s);
    });
  }

  function rowStatus(r: any): "active" | "neutral" | "inactive" {
    const m = surface?.get(r.id);
    if (m && (m.activeLeadCount > 0 || m.emailActivityCount > 0)) return "active";
    if (r.email || r.phone) return "neutral";
    return "inactive";
  }

  return (
    <ResourcePage
      title="Kapcsolattartók"
      description="Cégekhez tartozó személyek — döntéshozók, beszerzők, kivitelezők."
      emptyTitle="Még nincs kapcsolattartó."
      emptyDescription={`A „Új kapcsolattartó” gombbal vehetsz fel egy új személyt — köthető céghez és projektekhez.`}
      newButtonLabel="Új kapcsolattartó"
      icon={UserPlus}
      table="contacts"
      order="name"
      ascending
      extraActions={<PersonalContactDialog />}
      filter={filterFn}
      toolbar={
        <FilterBar
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Keresés név, email, telefon, beosztás…"
          onReset={search || companyFilter ? () => { setSearch(""); setCompanyFilter(""); } : undefined}
        >
          <FilterSelect
            value={companyFilter}
            onChange={setCompanyFilter}
            placeholder="Minden cég"
            options={companyOptions}
          />
        </FilterBar>
      }
      fields={[
        { name: "name", label: "Név", type: "text", required: true },
        { name: "company_id", label: "Cég", type: "ref", ref: { table: "companies", labelColumn: "name" } },
        { name: "position", label: "Beosztás", type: "text" },
        { name: "email", label: "E-mail", type: "text" },
        { name: "phone", label: "Telefon", type: "text" },
      ]}
      columns={[
        {
          key: "name", label: "Név", className: "font-medium",
          render: (r) => {
            const conflicts = surface?.get(r.id)?.conflictBadges ?? [];
            return (
              <div className="flex items-center gap-1.5">
                <Link to="/contacts/$id" params={{ id: r.id }} className="text-primary hover:underline">{r.name}</Link>
                {conflicts.length > 0 && (
                  <span title={`Adatkonfliktus: ${conflicts.join(", ")}`}>
                    <AlertTriangle className="h-3.5 w-3.5 text-[color:var(--status-warning)]" />
                  </span>
                )}
              </div>
            );
          },
        },
        {
          key: "company", label: "Cég",
          render: (r) => r.company_id
            ? <Link to="/customers/$id" params={{ id: r.company_id }} className="text-primary hover:underline">{companyLabel(r.company_id)}</Link>
            : <span className="text-muted-foreground">—</span>,
        },
        { key: "position", label: "Beosztás", render: (r) => r.position || <span className="text-muted-foreground">—</span> },
        { key: "email", label: "E-mail", render: (r) => r.email || <span className="text-muted-foreground">—</span> },
        { key: "phone", label: "Telefon", render: (r) => r.phone || <span className="text-muted-foreground">—</span> },
        {
          key: "leads", label: "Leadek",
          render: (r) => {
            const n = surface?.get(r.id)?.activeLeadCount ?? 0;
            return n > 0
              ? <span className="tabular-nums font-medium text-primary">{n}</span>
              : <span className="text-muted-foreground tabular-nums">0</span>;
          },
        },
        {
          key: "last_activity", label: "Utolsó aktivitás", className: "text-muted-foreground text-xs",
          render: (r) => relativeTime(r.updated_at ?? r.created_at),
        },
        {
          key: "status", label: "Állapot",
          render: (r) => <StatusPill status={rowStatus(r)} />,
        },
      ]}
    />
  );
}

export const Route = createFileRoute("/_authenticated/contacts/")({
  component: ContactsPage,
});