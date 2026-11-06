import { createFileRoute } from "@tanstack/react-router";
import { RoleHelp } from "@/components/help/role-help";
import manual from "../../../docs/manuals/sales-kezikonyv-v1.0-2026-10-30.md?raw";
export const Route = createFileRoute("/_authenticated/help/sales")({
  head: () => ({ meta: [{ title: "Sales használati súgó | VIBA CRM" }, { name: "description", content: "Aktuális oldalak, gombok, műveletkövetkezmények és visszavonási korlátok." }, { property: "og:title", content: "Sales használati súgó | VIBA CRM" }, { property: "og:description", content: "Gombszintű VIBA CRM segítség és részletes kézikönyv." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: () => <RoleHelp role="sales" manual={manual} />,
});
