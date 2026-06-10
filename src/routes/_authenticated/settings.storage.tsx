import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FolderOpen, CheckCircle2, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useServerFn } from "@tanstack/react-start";
import { r2GetStatus } from "@/lib/r2.functions";

export const Route = createFileRoute("/_authenticated/settings/storage")({
  component: StoragePage,
});

function StoragePage() {
  const fn = useServerFn(r2GetStatus);
  const status = useQuery({ queryKey: ["r2-status"], queryFn: () => fn({}) });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><FolderOpen className="h-5 w-5" /><CardTitle>Cloudflare R2 tárhely</CardTitle></div>
            {status.isLoading ? (
              <Badge variant="secondary">ellenőrzés…</Badge>
            ) : status.data?.ok ? (
              <Badge variant="outline" className="border-[color:var(--status-success)]/30 text-[color:var(--status-success)]">
                <CheckCircle2 className="mr-1 h-3 w-3" />konfigurálva
              </Badge>
            ) : (
              <Badge variant="destructive"><AlertCircle className="mr-1 h-3 w-3" />nincs konfigurálva</Badge>
            )}
          </div>
          <CardDescription>S3-kompatibilis fájltároló presigned URL alapú flow-val. Supabase Storage NEM kerül használatba.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {status.data?.ok ? (
            <>
              <Field label="Bucket" value={status.data.bucket} />
              <Field label="Endpoint" value={status.data.endpoint} />
              <p className="pt-2 text-xs text-muted-foreground">
                A dokumentumkezelő a Dokumentumtár oldalon és a projekt adatlap Dokumentumok fülén érhető el.
              </p>
            </>
          ) : (
            <p className="text-xs text-destructive">{status.data?.error ?? "Az R2 secret-ek hiányoznak vagy hibásak."}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="font-mono text-xs">{value}</span>
    </div>
  );
}