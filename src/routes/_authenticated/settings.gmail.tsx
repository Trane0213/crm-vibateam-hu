import { createFileRoute } from "@tanstack/react-router";
import { Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/settings/gmail")({
  component: () => (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><Mail className="h-5 w-5" /><CardTitle>Gmail integráció</CardTitle></div>
          <Badge variant="secondary">nincs csatlakoztatva</Badge>
        </div>
        <CardDescription>OAuth alapú kapcsolat — emailek olvasása és lead/projekt párosítás.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button disabled>Csatlakoztatás Gmail-fiókhoz</Button>
        <p className="mt-3 text-xs text-muted-foreground">TODO: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, callback URL.</p>
      </CardContent>
    </Card>
  ),
});