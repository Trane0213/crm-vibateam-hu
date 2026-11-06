import { createFileRoute, redirect } from "@tanstack/react-router";

// A korábbi, ellenőrizetlen AI-cégkutató oldal kivezetve (2026-11-06).
// Régi linkek a valódi Scarlet marketing chatre érkeznek; kutatás nem indítható.
export const Route = createFileRoute("/_authenticated/sales/research")({
  beforeLoad: () => {
    throw redirect({ to: "/ai-assistant", search: { agent: "marketing" } as never, replace: true });
  },
});
