import { createFileRoute } from "@tanstack/react-router";
import { FolderOpen, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const required = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"];

export const Route = createFileRoute("/_authenticated/settings/storage")({
  component: () => (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><FolderOpen className="h-5 w-5" /><CardTitle>Cloudflare R2 tárhely</CardTitle></div>
            <Badge variant="destructive">nincs konfigurálva</Badge>
          </div>
          <CardDescription>S3-kompatibilis fájltároló. Supabase Storage NEM kerül használatba.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {required.map((k) => (
            <div key={k} className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2 text-sm">
              <span className="font-mono text-xs">{k}</span>
              <Badge variant="outline" className="text-destructive"><AlertCircle className="mr-1 h-3 w-3" />hiányzik</Badge>
            </div>
          ))}
          <p className="pt-2 text-xs text-muted-foreground">A secret-ek megadása után engedélyeződik a feltöltés / letöltés. Presigned URL alapú flow.</p>
        </CardContent>
      </Card>
    </div>
  ),
});