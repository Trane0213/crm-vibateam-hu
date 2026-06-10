import { createFileRoute } from "@tanstack/react-router";
import { Shield } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const roles = [
  { name: "Tulajdonos", desc: "Teljes hozzáférés minden modulhoz." },
  { name: "Projektvezető", desc: "Projektek, ajánlatok, feladatok kezelése." },
  { name: "Értékesítő", desc: "Leadek, ajánlatok, follow-upok, kommunikáció." },
  { name: "Marketinges", desc: "Leadek, kampányok, Google Ads adatok." },
];

export const Route = createFileRoute("/_authenticated/settings/roles")({
  component: () => (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2"><Shield className="h-5 w-5" /><CardTitle>Szerepkörök</CardTitle></div>
          <CardDescription>A meglévő roles + permissions + role_permissions táblákra épül.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {roles.map((r) => (
            <div key={r.name} className="flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">{r.name}</div>
                <div className="text-xs text-muted-foreground">{r.desc}</div>
              </div>
              <Badge variant="outline">TODO</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  ),
});