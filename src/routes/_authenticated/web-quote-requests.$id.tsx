import { createFileRoute } from "@tanstack/react-router";
import { WebRequestDetail } from "@/components/web-requests/web-request-detail";

export const Route = createFileRoute("/_authenticated/web-quote-requests/$id")({
  head:()=>({meta:[{title:'Webes igény adatlapja | VIBA CRM'},{name:'description',content:'Egy webes érdeklődés eredeti adatai, mellékletei és CRM-felvételi ellenőrzése.'},{property:'og:title',content:'Webes igény adatlapja | VIBA CRM'},{property:'og:description',content:'Forráshű megkeresés és biztonságos cégkapcsolás.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'}]}),
  component: WebQuoteRequestRoute,
});

function WebQuoteRequestRoute() {
  const { id } = Route.useParams();
  return <WebRequestDetail id={id} />;
}
