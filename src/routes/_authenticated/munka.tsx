import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/munka")({
  component: WorkspaceLayout,
});

function WorkspaceLayout() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-3 sm:p-5">
      <Outlet />
    </div>
  );
}
