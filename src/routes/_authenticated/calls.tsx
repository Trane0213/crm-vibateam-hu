import { createFileRoute, Link } from "@tanstack/react-router";
import { Phone } from "lucide-react";
import { ResourcePage, fmtDateTime, useLookup } from "@/components/resource/resource-page";
import {supabase} from '@/integrations/supabase/client';
import {prepareCompanyCall} from '@/lib/marketing-call';

const CALL_TYPE = [
  { value: "sales", label: "Értékesítés" },
  { value: "support", label: "Ügyfélszolgálat" },
  { value: "followup", label: "Utókövetés" },
  { value: "other", label: "Egyéb" },
];

const OUTCOME = [
  { value: "connected", label: "Sikeres" },
  { value: "no_answer", label: "Nem vették fel" },
  { value: "voicemail", label: "Hangposta" },
  { value: "callback", label: "Visszahívandó" },
  { value: "rejected", label: "Elutasítva" },
];

function CallsPage() {
  const projectLabel = useLookup("projects", "title");
  const contactLabel = useLookup("contacts", "name");
  const companyLabel = useLookup("companies", "name");
  return (
    <ResourcePage
      title="Hívások"
      description="Itt rögzítheted az ügyfélhívásokat — projekthez vagy ügyfélhez kötve."
      emptyTitle="Itt rögzítheted az ügyfélhívásokat."
      emptyDescription={`A jobb felső „Új hívás” gombbal vehetsz fel egy bejövő vagy kimenő hívást, és kapcsolhatod ügyfélhez vagy projekthez.`}
      newButtonLabel="Új hívás"
      icon={Phone}
      table="phone_calls"
      order="created_at"
      ascending={false}
      beforeCreate={values=>prepareCompanyCall(supabase,values)}
      beforeUpdate={values=>prepareCompanyCall(supabase,values)}
      fields={[
        { name: "direction", label: "Irány", type: "select", options: [
          { value: "inbound", label: "Bejövő" },
          { value: "outbound", label: "Kimenő" },
        ]},
        { name: "call_type", label: "Típus", type: "select", options: CALL_TYPE },
        { name: "outcome", label: "Eredmény", type: "select", options: OUTCOME },
        { name: "callback_date", label: "Következő teendő: visszahívás időpontja", type: "datetime" },
        { name: "project_id", label: "Projekt", type: "ref", ref: { table: "projects", labelColumn: "title" } },
        { name: "company_id", label: "Ügyfél", type: "ref", ref: { table: "companies", labelColumn: "name" } },
        { name: "contact_id", label: "Kapcsolattartó", type: "ref", ref: { table: "contacts", labelColumn: "name" } },
        { name: "summary", label: "Összefoglaló", type: "textarea" },
      ]}
      columns={[
        { key: "created_at", label: "Időpont", className: "tabular-nums", render: (r) => fmtDateTime(r.created_at) },
        { key: "direction", label: "Irány" },
        { key: "call_type", label: "Típus" },
        { key: "outcome", label: "Eredmény" },
        { key: "callback_date", label: "Visszahívás", render:r=>fmtDateTime(r.callback_date) },
        { key: "contact", label: "Kapcsolattartó", render: (r) => contactLabel(r.contact_id) },
        {
          key: "company",
          label: "Ügyfél",
          render: (r) =>
            r.company_id ? (
              <Link to="/customers/$id" params={{ id: r.company_id }} className="text-primary hover:underline">
                {companyLabel(r.company_id)}
              </Link>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
        },
        { key: "project", label: "Projekt", render: (r) => projectLabel(r.project_id) },
        { key: "summary", label: "Összefoglaló", className: "text-muted-foreground max-w-[280px] truncate" },
      ]}
    />
  );
}

export const Route = createFileRoute("/_authenticated/calls")({
  head:()=>({meta:[{title:'Hívások | VIBA CRM'},{name:'description',content:'Ügyfélhívások, kapcsolattartók és visszahívási időpontok.'},{property:'og:title',content:'Hívások | VIBA CRM'},{property:'og:description',content:'Céges telefonhívások és következő teendők.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'}]}),
  component: CallsPage,
});