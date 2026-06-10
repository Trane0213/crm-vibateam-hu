import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { DocumentManager } from "@/components/documents/document-manager";

export const Route = createFileRoute("/_authenticated/documents")({
  component: () => (
    <div className="flex flex-col">
      <PageHeader
        title="Dokumentumtár"
        description="Cloudflare R2 alapú fájltárolás — ajánlatok, szerződések, tervrajzok, műszaki dokumentáció, fotók."
      />
      <div className="p-6">
        <DocumentManager />
      </div>
    </div>
  ),
});