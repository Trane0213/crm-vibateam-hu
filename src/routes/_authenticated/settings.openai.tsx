import { createFileRoute } from "@tanstack/react-router";
import { Bot } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/settings/openai")({
  component: () => (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><Bot className="h-5 w-5" /><CardTitle>OpenAI</CardTitle></div>
          <Badge variant="secondary">nincs konfigurálva</Badge>
        </div>
        <CardDescription>AI Értékesítő futtatásához OPENAI_API_KEY szükséges (szerver oldal).</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">TODO: OPENAI_API_KEY secret + szerver függvény integráció.</CardContent>
    </Card>
  ),
});