import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/settings/users")({
  component: () => (
    <div>
      <PageHeader title="Felhasználók" description="Csapattagok meghívása és kezelése." />
      <div className="pt-4"><EmptyState icon={Users} title="Felhasználó-kezelés" description="TODO: backend — Service Role Key szükséges az Auth Admin API-hoz." /></div>
    </div>
  ),
});