import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Inbox, Search, Paperclip } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PageHeader, EmptyState } from "@/components/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { listQuoteRequests } from "@/lib/quote-requests.functions";

export const Route = createFileRoute("/_authenticated/web-quote-requests/")({
  component: WebQuoteRequestsPage,
});

const SOURCE_LABEL: Record<string, { label: string; tone: string }> = {
  lakossagi: { label: "Lakossági", tone: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  tarsashazi: { label: "Társasházi", tone: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  general: { label: "Generál", tone: "bg-amber-50 text-amber-700 border-amber-200" },
};

function SourceBadge({ value }: { value: string | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const meta = SOURCE_LABEL[value] ?? { label: value, tone: "bg-muted text-foreground border-border" };
  return (
    <Badge variant="outline" className={meta.tone}>
      {meta.label}
    </Badge>
  );
}

function WebQuoteRequestsPage() {
  const list = useServerFn(listQuoteRequests);
  const { data, isLoading, error } = useQuery({
    queryKey: ["web-quote-requests"],
    queryFn: () => list(),
  });
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const items = data ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((r) =>
      [r.name, r.email, r.phone, r.company_name, r.message, r.project_type]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle)),
    );
  }, [data, q]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Weboldali ajánlatkérések"
        description="A vibateam.hu űrlapjairól beérkezett ajánlatkérések — csak olvasható nézet, nem nyúl bele CRM rekordokba."
      />
      <div className="flex-1 overflow-auto p-6">
        <Card>
          <CardContent className="p-4">
            <div className="mb-4 flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Keresés név, email, telefon, üzenet…"
                className="max-w-sm"
              />
              <div className="ml-auto text-xs text-muted-foreground">
                {rows.length} / {data?.length ?? 0} rekord
              </div>
            </div>

            {error ? (
              <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
                {(error as Error).message}
              </div>
            ) : isLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Betöltés…</div>
            ) : rows.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="Nincs beérkezett ajánlatkérés"
                description="Amint a weboldalon kitöltik az ajánlatkérő űrlapot, itt fog megjelenni."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Beérkezett</TableHead>
                    <TableHead>Név</TableHead>
                    <TableHead>Telefon</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Forrás</TableHead>
                    <TableHead>Projekt típus</TableHead>
                    <TableHead className="w-[40px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id} className="cursor-pointer">
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        <Link
                          to="/web-quote-requests/$id"
                          params={{ id: r.id }}
                          className="block"
                        >
                          {formatDateTime(r.created_at)}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link
                          to="/web-quote-requests/$id"
                          params={{ id: r.id }}
                          className="font-medium text-foreground hover:underline"
                        >
                          {r.name || "—"}
                        </Link>
                        {r.company_name && (
                          <div className="text-xs text-muted-foreground">{r.company_name}</div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.phone || "—"}</TableCell>
                      <TableCell className="text-xs">{r.email || "—"}</TableCell>
                      <TableCell>
                        <SourceBadge value={r.form_type} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.project_type || "—"}
                      </TableCell>
                      <TableCell>
                        {r.attachment_url ? (
                          <Paperclip className="h-4 w-4 text-muted-foreground" />
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}