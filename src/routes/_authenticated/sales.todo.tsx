import { createFileRoute } from "@tanstack/react-router";
import { SalesShell } from "@/components/sales/sales-shell";
import { Button } from "@/components/ui/button";
import { SalesWorklists } from "@/components/today/sales-worklists";
import { DUE_BUCKETS, DUE_BUCKET_LABEL, type DueBucket } from "@/lib/sales/constants";

export const Route = createFileRoute("/_authenticated/sales/todo")({
  validateSearch: (search: Record<string, unknown>): { bucket: DueBucket } => ({
    bucket: DUE_BUCKETS.includes(search.bucket as DueBucket) ? search.bucket as DueBucket : "today",
  }),
  head: () => ({ meta: [
    { title: "Sales teendők | VIBA CRM" },
    { name: "description", content: "A VIBA CRM saját és csapatszintű Sales teendői budapesti napi besorolással." },
    { property: "og:title", content: "Sales teendők | VIBA CRM" },
    { property: "og:description", content: "Lejárt, mai és későbbi Sales feladatok." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: SalesTodoPage,
});

function SalesTodoPage() {
  const { bucket } = Route.useSearch();
  const navigate = Route.useNavigate();
  return <SalesShell title="Teendők">
    <div className="mb-4 flex flex-wrap gap-1.5">{DUE_BUCKETS.map(b =>
      <Button key={b} size="sm" variant={bucket === b ? "default" : "outline"}
        onClick={() => navigate({ search: { bucket: b } })}>{DUE_BUCKET_LABEL[b]}</Button>)}
    </div>
    <SalesWorklists bucket={bucket} />
  </SalesShell>;
}
