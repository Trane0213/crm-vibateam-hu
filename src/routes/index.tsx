import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "VIBA CRM | Munkafelület" }, { name: "description", content: "A VIBA csapat közös ügyfélkezelési és napi munkafelülete." },
    { property: "og:title", content: "VIBA CRM | Munkafelület" }, { property: "og:description", content: "A VIBA csapat közös ügyfélkezelési és napi munkafelülete." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  beforeLoad: () => {
    throw redirect({ to: "/today" });
  },
});
