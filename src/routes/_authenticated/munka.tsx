import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/munka")({
  component: () => <div className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6"><Outlet /></div>,
});
