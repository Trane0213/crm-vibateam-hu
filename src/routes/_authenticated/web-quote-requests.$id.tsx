import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Download, Mail, Phone, Building2, Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { formatDateTime } from "@/lib/format";
import { getQuoteRequest } from "@/lib/quote-requests.functions";

export const Route = createFileRoute("/_authenticated/web-quote-requests/$id")({
  component: WebQuoteRequestDetail,
});

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-3 border-b py-2 last:border-0">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm text-foreground break-words">
        {value === null || value === undefined || value === ""
          ? <span className="text-muted-foreground">—</span>
          : value}
      </div>
    </div>
  );
}

function WebQuoteRequestDetail() {
  const { id } = Route.useParams();
  const getOne = useServerFn(getQuoteRequest);
  const { data, isLoading, error } = useQuery({
    queryKey: ["web-quote-request", id],
    queryFn: () => getOne({ data: { id } }),
  });

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Ajánlatkérés részletei"
        description="Beérkezett weboldali ajánlatkérés — csak olvasható nézet."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/web-quote-requests">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Vissza a listához
            </Link>
          </Button>
        }
      />
      <div className="flex-1 overflow-auto p-6">
        {error ? (
          <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
            {(error as Error).message}
          </div>
        ) : isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Betöltés…</div>
        ) : !data ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Nincs ilyen ajánlatkérés.
          </div>
        ) : (
          <div className="mx-auto grid max-w-4xl gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-base">
                  <span>{data.name || "(név nélkül)"}</span>
                  {data.form_type && (
                    <Badge variant="outline">{data.form_type}</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="mb-3 flex flex-wrap gap-3 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" /> {formatDateTime(data.created_at)}
                  </span>
                  {data.email && (
                    <a href={`mailto:${data.email}`} className="inline-flex items-center gap-1 hover:text-foreground">
                      <Mail className="h-3.5 w-3.5" /> {data.email}
                    </a>
                  )}
                  {data.phone && (
                    <a href={`tel:${data.phone}`} className="inline-flex items-center gap-1 hover:text-foreground">
                      <Phone className="h-3.5 w-3.5" /> {data.phone}
                    </a>
                  )}
                  {data.company_name && (
                    <span className="inline-flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5" /> {data.company_name}
                    </span>
                  )}
                </div>

                <Field label="Forrás (form_type)" value={data.form_type} />
                <Field label="Projekt típus" value={data.project_type} />
                <Field label="Ingatlan típus" value={data.property_type} />
                <Field label="Lakásszám" value={data.apartment_count} />
                <Field label="Költségkeret" value={data.budget} />
                <Field
                  label="Hozzájárulás"
                  value={data.consent ? "Megadva" : "Nincs / hiányzik"}
                />
                <Field label="ID" value={<span className="font-mono text-xs">{data.id}</span>} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Üzenet</CardTitle>
              </CardHeader>
              <CardContent>
                {data.message ? (
                  <pre className="whitespace-pre-wrap text-sm text-foreground font-sans">
                    {data.message}
                  </pre>
                ) : (
                  <p className="text-sm text-muted-foreground">Nincs üzenet.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Csatolmány</CardTitle>
              </CardHeader>
              <CardContent>
                {data.attachment_url ? (
                  <div className="flex items-center gap-3">
                    <Button asChild size="sm">
                      <a
                        href={data.attachment_url}
                        target="_blank"
                        rel="noreferrer noopener"
                        download
                      >
                        <Download className="mr-1.5 h-4 w-4" />
                        Letöltés
                      </a>
                    </Button>
                    <a
                      href={data.attachment_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="break-all text-xs text-muted-foreground hover:underline"
                    >
                      {data.attachment_url}
                    </a>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Nincs csatolmány.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Teljes rekord (raw)</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
                  {JSON.stringify(data, null, 2)}
                </pre>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}