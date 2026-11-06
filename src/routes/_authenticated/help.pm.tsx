import { createFileRoute } from "@tanstack/react-router";
import { RoleHelp } from "@/components/help/role-help";
export const Route = createFileRoute("/_authenticated/help/pm")({
  head: () => ({ meta: [{ title: "Projektvezetői használati súgó | VIBA CRM" }, { name: "description", content: "Projektvezetői napi munka, feladatok és dokumentumok gombszintű súgója." }, { property: "og:title", content: "Projektvezetői használati súgó | VIBA CRM" }, { property: "og:description", content: "Valódi oldalak, gombok és műveletkövetkezmények a PM munkájához." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: () => <RoleHelp role="project_manager" />,
});