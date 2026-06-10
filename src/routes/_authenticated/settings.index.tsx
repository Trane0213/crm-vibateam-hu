import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/settings/")({
  component: () => (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rendszer</CardTitle>
          <CardDescription>Lovable Cloud — adatbázis, felhasználók, integrációk központi konfigurációja.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          A bal oldali menüben konfigurálhatod az integrációkat (Gmail, OpenAI, R2), felhasználókat és szerepköröket.
        </CardContent>
      </Card>
    </div>
  ),
});