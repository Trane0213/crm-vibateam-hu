import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentManager } from "@/components/documents/document-manager";
import { RelatedDocumentsPanel } from "@/components/documents/related-documents-panel";
import { ChatUploadsBrowser } from "@/components/ai/chat-attachments";
import { DocumentPackagesPanel } from "@/components/packages/document-packages-panel";

type View = "projekt" | "csomagok" | "tobbi" | "chat";

export const Route = createFileRoute("/_authenticated/documents")({
  head: () => ({ meta: [
    { title: "Dokumentumtár – projekt, ajánlat és ügyfél fájlok | VIBA CRM" },
    { name: "description", content: "Projekt-, ajánlati és ügyfél-dokumentumok keresése és megnyitása jogosultság szerint, a kapcsolódó rekordra mutató hivatkozással." },
    { property: "og:title", content: "Dokumentumtár | VIBA CRM" },
    { property: "og:description", content: "Projekt-, ajánlati és ügyfél-dokumentumok egy helyen, jogosultság szerint." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  validateSearch: (s: Record<string, unknown>): { nezet?: View } => (s.nezet === "tobbi" || s.nezet === "chat" || s.nezet === "csomagok" ? { nezet: s.nezet } : {}),
  component: DocumentsPage,
});

function DocumentsPage() {
  const search = Route.useSearch();
  const [view, setView] = useState<View>(search.nezet ?? "projekt");
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Dokumentumtár"
        description="Projekt-, ajánlati és ügyfél-dokumentumok — csak az jelenik meg, amihez a szerepköröd hozzáfér. Minden fájlnál látszik, melyik projekthez, ajánlathoz vagy ügyfélhez tartozik."
      />
      <div className="p-4 sm:p-6">
        <Tabs value={view} onValueChange={(v) => setView(v as View)}>
          <TabsList className="h-auto max-w-full flex-wrap justify-start">
            <TabsTrigger value="projekt">Projektdokumentumok és feltöltés</TabsTrigger>
            <TabsTrigger value="csomagok">Tervcsomagok</TabsTrigger>
            <TabsTrigger value="tobbi">Ajánlati és ügyfél-dokumentumok</TabsTrigger>
            <TabsTrigger value="chat">AI chatbe feltöltött fájlok</TabsTrigger>
          </TabsList>
          <TabsContent value="projekt" className="mt-4">
            <DocumentManager />
          </TabsContent>
          <TabsContent value="csomagok" className="mt-4 space-y-2">
            <p className="text-sm text-muted-foreground">Feltölteni a projekt Dokumentumok fülén vagy az ajánlat első lépésénél lehet, hogy a csomag a megfelelő ügyhöz kapcsolódjon.</p>
            <DocumentPackagesPanel parent={null} />
          </TabsContent>
          <TabsContent value="tobbi" className="mt-4">
            <RelatedDocumentsPanel
              ctx={{ all: true }}
              exclude={["project_documents"]}
              title="Ajánlati és ügyfél-dokumentumok"
              description="Csak megnyitás és keresés. Feltölteni az ajánlat, illetve az ügyfél adatlapján lehet, hogy a fájl a megfelelő rekordhoz kapcsolódjon."
              emptyTitle="Nincs számodra látható ajánlati vagy ügyfél-dokumentum"
            />
          </TabsContent>
          <TabsContent value="chat" className="mt-4 space-y-2">
            <p className="text-sm text-muted-foreground">Az AI-asszisztensnek feltöltött fájlok szerepkörönként külön mappában. Feltölteni a chat gemkapocs gombjával lehet.</p>
            <ChatUploadsBrowser className="max-h-[70vh]" />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
