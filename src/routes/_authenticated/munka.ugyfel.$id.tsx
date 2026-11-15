import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/use-permissions";
import { WsPageHeader, CaseAssistant } from "@/components/workspace-v2/parts";
import { caseAssistantPrompts } from "@/lib/workspace-v2/case-assistant";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/workspace-v2/status-badge";
import { RelatedDocumentsPanel } from "@/components/documents/related-documents-panel";
import { CompanyDocumentManager } from "@/components/documents/company-document-manager";
import { MarketingWorkspace } from "@/components/marketing/marketing-workspace";
import { NewQuoteButton } from "@/components/quotes/new-quote-button";
import { COMPANY_TYPE_LABEL, PROJECT_STATUS_LABEL } from "@/lib/viba-constants";
import { LEAD_STATUS_LABEL, type LeadStatus } from "@/lib/sales/constants";
import { MARKETING_STATUS_LABEL, readMarketingMeta } from "@/lib/marketing-status";
import { formatDate } from "@/lib/format";
import { humanizeSupabaseError } from "@/lib/db-hooks";
import { wsHead } from "@/lib/workspace-v2/head";

export const Route = createFileRoute("/_authenticated/munka/ugyfel/$id")({
  validateSearch: (s: Record<string, unknown>): { tab?: string; contact?: string } => ({
    ...(typeof s.tab === "string" && /^[a-z-]{2,20}$/.test(s.tab) ? { tab: s.tab } : {}),
    ...(typeof s.contact === "string" && /^[0-9a-f-]{36}$/i.test(s.contact) ? { contact: s.contact } : {}),
  }),
  head: () => wsHead("Ügyféladatlap", "Cégadatok, kapcsolattartók, ügyek, projektek és dokumentumok egy helyen."),
  component: CustomerSheet,
});

const SHEET_TABS = ["overview", "contacts", "cases", "docs", "marketing"];

/** Egységes ügyféladatlap — csak olvas a hívó jogosultsága szerint; szerkesztés a meglévő felületeken. */
function CustomerSheet() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const { role } = usePermissions();
  const isMarketing = role === "marketing";
  const [tab, setTab] = useState(search.tab && SHEET_TABS.includes(search.tab) ? search.tab : "overview");
  useEffect(() => { if (search.tab && SHEET_TABS.includes(search.tab)) setTab(search.tab); }, [search.tab]);

  const company = useQuery({
    queryKey: ["companies", "v2", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("id,name,company_type,tax_number,website,notes,marketing_status,marketing_status_changed_at,marketing_status_changed_by,marketing_status_source,marketing_handoff_lead_id,marketing_blocked").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const contacts = useQuery({
    queryKey: ["contacts", "v2-company", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("contacts").select("id,name,email,phone,position,email_invalid,verification_state").eq("company_id", id).order("name").limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
  const leads = useQuery({
    queryKey: ["leads", "v2-company", id],
    enabled: !isMarketing,
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("id,status,summary,next_step_due_at,pipeline_entered_at").eq("company_id", id).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
  const projects = useQuery({
    queryKey: ["projects", "v2-company", id],
    enabled: !isMarketing,
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("id,title,status,deadline").eq("company_id", id).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
  const quotes = useQuery({
    queryKey: ["quotes", "v2-company", id, (leads.data ?? []).map((l) => l.id).join(",")],
    enabled: !isMarketing && leads.isSuccess && (leads.data?.length ?? 0) > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("quotes").select("id,title,status,quote_kind,lead_id").in("lead_id", (leads.data ?? []).map((l) => l.id)).eq("is_current", true).limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isMarketing) {
    return (
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]"><MarketingWorkspace companyId={id} /></div>
        <div><CaseAssistant agent="marketing" prompts={caseAssistantPrompts("marketing", "company", { id, name: company.data?.name })} /></div>
      </div>
    );
  }
  if (company.isLoading) return <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Ügyfél betöltése…</div>;
  if (company.isError) return <p role="alert" className="text-sm text-destructive">Az ügyfél nem tölthető be: {humanizeSupabaseError(company.error)}</p>;
  if (!company.data) return <p className="text-sm text-muted-foreground">Ez az ügyfél nem létezik, vagy nincs hozzá jogosultságod.</p>;

  const c = company.data;
  const meta = readMarketingMeta(c.notes, c);
  const openLeads = (leads.data ?? []).filter((l) => l.status !== "won" && l.status !== "lost");
  const missing = [!c.tax_number && "adószám", !(contacts.data ?? []).length && "kapcsolattartó", (contacts.data ?? []).length > 0 && !(contacts.data ?? []).some((x) => x.email && !x.email_invalid) && "érvényes e-mail"].filter(Boolean) as string[];

  return (
    <>
      <WsPageHeader title={c.name} subtitle={[c.company_type ? COMPANY_TYPE_LABEL[c.company_type] ?? c.company_type : null, meta.status ? MARKETING_STATUS_LABEL[meta.status] : null].filter(Boolean).join(" · ") || "Ügyféladatlap"}
        right={<NewQuoteButton variant="default" openIn="v2" label="Ajánlat készítése" leadId={openLeads[0]?.id ?? null} />} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Tabs value={tab} onValueChange={setTab} className="min-w-0 rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]">
          <TabsList className="flex h-auto flex-wrap justify-start">
            <TabsTrigger value="overview">Cégadatok</TabsTrigger>
            <TabsTrigger value="contacts">Kapcsolattartók ({contacts.data?.length ?? "…"})</TabsTrigger>
            <TabsTrigger value="cases">Ügyek és projektek</TabsTrigger>
            <TabsTrigger value="docs">Dokumentumok</TabsTrigger>
            {role === "owner" && <TabsTrigger value="marketing">Marketing</TabsTrigger>}
          </TabsList>
          <TabsContent value="overview" className="space-y-2 pt-3 text-sm">
            <Row label="Adószám" value={c.tax_number} />
            <Row label="Weboldal" value={c.website} />
            <Row label="Típus" value={c.company_type ? COMPANY_TYPE_LABEL[c.company_type] ?? c.company_type : null} />
            <Row label="Marketing" value={meta.status ? MARKETING_STATUS_LABEL[meta.status] : null} />
            {c.marketing_blocked && <p className="text-xs text-destructive">Marketingkampányból kizárt cég.</p>}
            {missing.length > 0 && <div className="flex flex-wrap items-center gap-2 pt-2"><StatusBadge status="missing" />{missing.join(", ")} hiányzik</div>}
          </TabsContent>
          <TabsContent value="contacts" className="pt-3">
            {contacts.isError ? <p className="text-sm text-destructive">Nem tölthető be.</p> : (contacts.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Nincs kapcsolattartó.</p> : (
              <ul className="divide-y text-sm">
                {(contacts.data ?? []).map((p) => (
                  <li key={p.id} className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded px-1 py-2", search.contact === p.id && "bg-accent")}>
                    <div className="min-w-0">
                      <div className="truncate font-medium">{p.name}{p.position ? <span className="font-normal text-muted-foreground"> · {p.position}</span> : null}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {p.email ? <a href={`mailto:${p.email}`} className="hover:underline">{p.email}</a> : null}{p.email && p.phone ? " · " : ""}{p.phone ? <a href={`tel:${p.phone}`} className="hover:underline">{p.phone}</a> : null}{!p.email && !p.phone ? "Nincs elérhetőség" : null}
                      </div>
                    </div>
                    {p.email_invalid ? <StatusBadge status="missing" label="Hibás e-mail" /> : p.verification_state === "verified" ? <StatusBadge status="done" label="Ellenőrzött" /> : <StatusBadge status="review" label="Nem igazolt" />}
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
          {<TabsContent value="cases" className="space-y-4 pt-3">
            <div>
              <h3 className="text-sm font-semibold">Ügyek</h3>
              {(leads.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">{leads.isError ? "Nem tölthető be." : "Nincs látható ügy."}</p> : (
                <ul className="mt-1 divide-y text-sm">
                  {(leads.data ?? []).map((l) => (
                    <li key={l.id}>
                      <Link {...(l.pipeline_entered_at && l.status !== "won" && l.status !== "lost" ? { to: "/munka/sales/pipeline", search: { lead: l.id } } as const : { to: "/munka/ugy/$id", params: { id: l.id } } as const)} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-2 hover:bg-muted/40">
                        <span className="min-w-0 truncate">{l.summary ?? `#${l.id.slice(0, 8)}`}</span>
                        <span className="text-xs text-muted-foreground">{LEAD_STATUS_LABEL[l.status as LeadStatus] ?? l.status}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold">Ajánlatok</h3>
              {(quotes.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Nincs látható aktuális ajánlat.</p> : (
                <ul className="mt-1 divide-y text-sm">
                  {(quotes.data ?? []).map((q) => (
                    <li key={q.id}><Link to="/munka/sales/ajanlat/$id" params={{ id: q.id }} className="block truncate py-2 hover:bg-muted/40">{q.title?.trim() || `#${q.id.slice(0, 8)}`}</Link></li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold">Projektek</h3>
              {(projects.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Nincs látható projekt.</p> : (
                <ul className="mt-1 divide-y text-sm">
                  {(projects.data ?? []).map((p) => (
                    <li key={p.id}>
                      <Link to="/munka/sales/projekt/$id" params={{ id: p.id }} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-2 hover:bg-muted/40">
                        <span className="min-w-0 truncate">{p.title}</span>
                        <span className="text-xs text-muted-foreground">{p.status ? PROJECT_STATUS_LABEL[p.status] ?? p.status : ""}{p.deadline ? ` · ${formatDate(p.deadline)}` : ""}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TabsContent>}
          <TabsContent value="docs" className="space-y-3 pt-3">
            <CompanyDocumentManager companyId={id} />
            {<RelatedDocumentsPanel ctx={{ projectIds: (projects.data ?? []).map((p) => p.id), quoteIds: (quotes.data ?? []).map((q) => q.id) }} exclude={["company_documents"]}
              enabled={!projects.isLoading && !leads.isLoading && !quotes.isLoading} title="Projekt- és ajánlati dokumentumok" />}
          </TabsContent>
          {role === "owner" && <TabsContent value="marketing" className="pt-3">{tab === "marketing" && <MarketingWorkspace companyId={id} />}</TabsContent>}
        </Tabs>
        <div className="space-y-3">
          <CaseAssistant agent="sales" prompts={caseAssistantPrompts("sales", "company", { id, name: c.name })} />
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-2"><span className="text-muted-foreground">{label}</span><span className="min-w-0 break-words">{value || <span className="text-muted-foreground">nincs megadva</span>}</span></div>;
}
