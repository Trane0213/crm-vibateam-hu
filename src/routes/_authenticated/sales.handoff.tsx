import { createFileRoute, Link } from "@tanstack/react-router";
import { SalesShell } from "@/components/sales/sales-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * DEPRECATED — a régi "Megnyert → Projekt átadás" útvonal.
 *
 * A jóváhagyott folyamatban a projekt KIZÁRÓLAG a Pipeline → Megnyert
 * lépésből jöhet létre. Ez az oldal nem hoz létre több projektet és nem
 * szerepel a navigációban. A fájl csak azért maradt meg, hogy a régi
 * mentett linkek ne adjanak 404-et.
 */
export const Route = createFileRoute("/_authenticated/sales/handoff")({
  component: DeprecatedHandoffPage,
});

function DeprecatedHandoffPage() {
  return (
    <SalesShell title="Átadás (megszűnt)" description="Ez az útvonal a régi folyamat része volt és inaktív.">
      <Card>
        <CardContent className="space-y-3 p-6 text-sm">
          <p>
            A jóváhagyott folyamatban a <strong>projekt kizárólag a Pipeline → Megnyert</strong>
            lépésből jöhet létre. A régi „Megnyert → Projekt átadás" oldal megszűnt.
          </p>
          <p className="text-muted-foreground">
            Marketing → Leads Workspace → Pipeline → Projekt
          </p>
          <div className="flex gap-2 pt-2">
            <Button asChild size="sm">
              <Link to="/sales/leads">Pipeline megnyitása</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/leads">Leads Workspace</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </SalesShell>
  );
}