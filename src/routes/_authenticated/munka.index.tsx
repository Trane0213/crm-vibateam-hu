import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { usePermissions } from "@/hooks/use-permissions";
import { useWorkspaceV2 } from "@/hooks/use-workspace-v2";
import { wsStartForRole } from "@/lib/workspace-v2/nav";
import { wsHead } from "@/lib/workspace-v2/head";

export const Route = createFileRoute("/_authenticated/munka/")({
  head: () => wsHead("Munkaterület", "Sales és Marketing napi munka a VIBA CRM-ben."),
  component: WorkspaceStart,
});

/** Belépési pont: a szerepkör „Ma” képernyőjére visz, és megjegyzi, hogy a felhasználó az új felületet használja. */
function WorkspaceStart() {
  const { role, isLoading } = usePermissions();
  const { setEnabled } = useWorkspaceV2();
  useEffect(() => { setEnabled(true); }, [setEnabled]);
  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Betöltés…</div>;
  const start = wsStartForRole(role);
  if (!start) return <p className="p-6 text-sm text-muted-foreground">A szerepköröd nem használja ezt a munkaterületet.</p>;
  return <Navigate to={start} replace />;
}
