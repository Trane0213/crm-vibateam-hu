import { createFileRoute, Outlet } from "@tanstack/react-router";
import { WsNav } from "@/components/workspace-v2/ws-nav";

export const Route = createFileRoute("/_authenticated/munka")({
  component: WorkspaceLayout,
});

function WorkspaceLayout() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-3 sm:p-5 lg:flex-row lg:items-start">
      <WsNav />
      <div className="min-w-0 flex-1 space-y-4"><Outlet /></div>
    </div>
  );
}
