import { createFileRoute } from "@tanstack/react-router";
import { FolderOpen, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/documents")({
  component: () => (
    <div className="flex flex-col">
      <PageHeader
        title="Dokumentumtár"
        description="Cloudflare R2 alapú fájltárolás — ajánlatok, szerződések, felmérőlapok, fotók, tervek."
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="secondary">R2 nincs konfigurálva</Badge>
            <Button size="sm" disabled><Upload className="mr-1 h-4 w-4" />Feltöltés</Button>
          </div>
        }
      />
      <div className="px-6 pt-4">
        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">Mind</TabsTrigger>
            <TabsTrigger value="quote">Ajánlat</TabsTrigger>
            <TabsTrigger value="contract">Szerződés</TabsTrigger>
            <TabsTrigger value="survey">Felmérőlap</TabsTrigger>
            <TabsTrigger value="photo">Fotó</TabsTrigger>
            <TabsTrigger value="plan">Terv</TabsTrigger>
            <TabsTrigger value="other">Egyéb</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="p-6">
        <EmptyState
          icon={FolderOpen}
          title="Még nincs feltöltött dokumentum"
          description="A Cloudflare R2 secret-ek (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET) konfigurálása után engedélyeződik a feltöltés. Supabase Storage NEM kerül használatba."
        />
      </div>
    </div>
  ),
});