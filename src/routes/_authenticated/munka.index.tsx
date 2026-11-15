import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/use-permissions";
import { useWorkspaceV2 } from "@/hooks/use-workspace-v2";
import { WS_AREA_LABEL, wsAreasForRole, wsItemsForRole } from "@/lib/workspace-v2/nav";
import { StatusBadge } from "@/components/workspace-v2/status-badge";
import { NextActionCard, WsPageHeader } from "@/components/workspace-v2/parts";

export const Route = createFileRoute("/_authenticated/munka/")({
  head: () => ({
    meta: [
      { title: "Új munkaterület – VIBA CRM" },
      { name: "description", content: "Az új Sales és Marketing munkaterület kezdőlapja." },
      { property: "og:title", content: "Új munkaterület – VIBA CRM" },
      { property: "og:description", content: "Az új Sales és Marketing munkaterület kezdőlapja." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WorkspaceHome,
});

function WorkspaceHome() {
  const { role } = usePermissions();
  const { enabled, setEnabled } = useWorkspaceV2();
  const navigate = useNavigate();
  const areas = wsAreasForRole(role);
  const items = wsItemsForRole(role);

  return (
    <>
      <WsPageHeader
        title="Új munkaterület"
        subtitle="Próbaüzem – a régi felület változatlanul elérhető"
        right={
          enabled ? (
            <Button variant="outline" size="sm" onClick={() => { setEnabled(false); navigate({ to: "/today" }); }}>Vissza a régi felületre</Button>
          ) : (
            <Button size="sm" onClick={() => setEnabled(true)}>Bekapcsolom nekem</Button>
          )
        }
      />
      <NextActionCard text="Az új képernyők szakaszonként készülnek el. Amíg egy képernyő nincs kész, a gomb a mostani oldalt nyitja meg." />
      {areas.length === 0 && <p className="text-sm text-muted-foreground">A szerepköröd nem használja ezt a munkaterületet.</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {areas.map((a) => (
          <section key={a} className="rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]">
            <h2 className="font-display text-lg font-semibold">{WS_AREA_LABEL[a]}</h2>
            <ul className="mt-3 divide-y">
              {items.filter((i) => i.area === a).map((i) => (
                <li key={i.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{i.title}</div>
                    {i.note && <div className="truncate text-xs text-muted-foreground">{i.note}</div>}
                  </div>
                  {i.state === "planned" ? (
                    <StatusBadge status="planned" label="Tervezett" />
                  ) : (
                    <Button asChild size="sm" variant={i.state === "ready" ? "default" : "ghost"}>
                      <Link to={i.url}>{i.state === "ready" ? "Megnyitás" : "Mostani oldal"}<ArrowRight className="h-4 w-4" /></Link>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
