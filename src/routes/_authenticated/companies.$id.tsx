import { createFileRoute, redirect } from "@tanstack/react-router";

// A cég adatlap egyesítve van az egységes Ügyfél adatlapba: /customers/$id
export const Route = createFileRoute("/_authenticated/companies/$id")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/customers/$id", params: { id: params.id } });
  },
});