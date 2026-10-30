import { createFileRoute, Navigate } from "@tanstack/react-router";

// A jóváhagyott architektúra szerint a 3 oszlopos Lead Workspace az egyetlen
// operatív felület. Régi `/leads/:id` mély-link átirányít a workspace-re.
export const Route = createFileRoute("/_authenticated/leads/$id")({
  component: RedirectToWorkspace,
});

function RedirectToWorkspace() {
  const { id } = Route.useParams();
  return <Navigate to="/leads" search={{ lead: id }} replace />;
}
