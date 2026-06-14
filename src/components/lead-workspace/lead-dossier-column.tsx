/**
 * Lead előélet — read-only dosszié.
 *
 * Ez NEM munkafelület. Itt a sales csak olvas: cégadatok, kapcsolattartók,
 * marketing minősítés, marketing jegyzet, emailek, dokumentumok, idővonal.
 * Semmilyen állapot- vagy státuszváltó, semmilyen művelet nem szerepel itt.
 *
 * Műveletek a 3. oszlopban (sales-prep-panel) vannak.
 */
import { useQuery } from "@tanstack/react-query";
import {
  Building2, Mail, FileText, History, Users, Inbox, Send, StickyNote, Activity,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { fmtDate, fmtDateTime, useLookup } from "@/components/resource/resource-page";
import {
  readMarketingMeta, stripMarkers,
  MARKETING_STATUS_LABEL, MARKETING_STATUS_TONE,
} from "@/lib/marketing-status";
import { buildTimeline } from "@/lib/marketing-timeline";
import { relativeTime } from "@/components/marketing-ui";

export function LeadDossierColumn({ leadId }: { leadId: string | null }) {
  const contactLookup = useLookup("contacts", "name");

  const lead = useQuery({
    queryKey: ["leads", "detail", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("*").eq("id", leadId!).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
  const companyId: string | null = lead.data?.company_id ?? null;

  const company = useQuery({
    queryKey: ["leads", "dossier", "company", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies").select("id,name,notes,website,created_at").eq("id", companyId!).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
  const contacts = useQuery({
    queryKey: ["leads", "dossier", "contacts", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts").select("id,name,email,phone,position,created_at")
        .eq("company_id", companyId!).order("name");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const emails = useQuery({
    queryKey: ["leads", "dossier", "emails", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("emails")
        .select("id,thread_id,subject,from_email,to_email,internal_date,created_at,is_outbound")
        .eq("company_id", companyId!)
        .order("internal_date", { ascending: false, nullsFirst: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const docs = useQuery({
    queryKey: ["leads", "dossier", "docs", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_documents" as any).select("id,name,created_at")
        .eq("company_id", companyId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  if (!leadId) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div className="max-w-xs text-sm text-muted-foreground">
          Válassz egy érdeklődőt a bal oldali listából — itt jelenik meg a marketing által átadott teljes dosszié.
        </div>
      </div>
    );
  }
  if (lead.isLoading) return <div className="p-4 text-sm text-muted-foreground">Betöltés…</div>;
  if (!lead.data) return <div className="p-4 text-sm text-muted-foreground">Nem található.</div>;

  const l = lead.data;
  const meta = readMarketingMeta(company.data?.notes ?? null);
  const primaryContactName = l.contact_id ? contactLookup(l.contact_id) : null;
  const companyName = company.data?.name ?? "Cég nélkül";

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Fejléc — fix, nem műveleti */}
      <div className="border-b px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Lead előélet</div>
            <h2 className="mt-1 break-words text-lg font-semibold leading-tight">{companyName}</h2>
            {primaryContactName && (
              <div className="mt-0.5 truncate text-xs text-muted-foreground">{primaryContactName}</div>
            )}
          </div>
          <Badge variant="outline" className={`shrink-0 ${MARKETING_STATUS_TONE[meta.status]}`}>
            {MARKETING_STATUS_LABEL[meta.status]}
          </Badge>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          {l.source && <Badge variant="outline" className="font-normal">Forrás: {l.source}</Badge>}
          {l.project_type && <Badge variant="outline" className="font-normal">Típus: {l.project_type}</Badge>}
          <Badge variant="outline" className="font-normal">Létrehozva: {fmtDate(l.created_at)}</Badge>
        </div>
      </div>

      <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-3 mt-2 w-fit">
          <TabsTrigger value="overview" className="text-xs"><Building2 className="mr-1 h-3 w-3" /> Áttekintés</TabsTrigger>
          <TabsTrigger value="contacts" className="text-xs"><Users className="mr-1 h-3 w-3" /> Kapcsolatok</TabsTrigger>
          <TabsTrigger value="emails"   className="text-xs"><Mail className="mr-1 h-3 w-3" /> Emailek</TabsTrigger>
          <TabsTrigger value="docs"     className="text-xs"><FileText className="mr-1 h-3 w-3" /> Dokumentumok</TabsTrigger>
          <TabsTrigger value="timeline" className="text-xs"><History className="mr-1 h-3 w-3" /> Idővonal</TabsTrigger>
        </TabsList>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          <TabsContent value="overview" className="mt-0 space-y-4">
            <Section title="Cég" icon={Building2}>
              {!company.data ? (
                <Empty>Nincs cég hozzárendelve a leadhez.</Empty>
              ) : (
                <dl className="grid grid-cols-3 gap-2 text-xs">
                  <Row label="Név" value={company.data.name} />
                  <Row label="Weboldal" value={company.data.website ?? "—"} />
                  <Row label="Létrehozva" value={fmtDate(company.data.created_at)} />
                </dl>
              )}
            </Section>

            <Section title="Marketing minősítés" icon={Activity}>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={MARKETING_STATUS_TONE[meta.status]}>
                    {MARKETING_STATUS_LABEL[meta.status]}
                  </Badge>
                  {meta.statusDate && <span className="text-muted-foreground">{fmtDate(meta.statusDate)}</span>}
                </div>
                {l.summary && (
                  <div className="text-foreground whitespace-pre-wrap">{l.summary}</div>
                )}
              </div>
            </Section>

            {meta.salesNote && (
              <Section title="Marketing jegyzet a sales-nek" icon={StickyNote}>
                <div className="whitespace-pre-wrap rounded-md border bg-muted/30 p-2 text-xs">{meta.salesNote}</div>
              </Section>
            )}

            {company.data?.notes && (
              <Section title="Cég jegyzetek" icon={StickyNote}>
                <div className="whitespace-pre-wrap rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
                  {stripMarkers(company.data.notes) || <span className="italic">— üres —</span>}
                </div>
              </Section>
            )}
          </TabsContent>

          <TabsContent value="contacts" className="mt-0">
            {(contacts.data ?? []).length === 0 ? (
              <Empty>Nincs kapcsolattartó rögzítve.</Empty>
            ) : (
              <ul className="divide-y rounded-md border">
                {contacts.data!.map((c) => (
                  <li key={c.id} className="px-3 py-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{c.name ?? "—"}</span>
                      {c.position && <span className="text-muted-foreground">{c.position}</span>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-3 text-muted-foreground">
                      {c.email && <span>{c.email}</span>}
                      {c.phone && <span>{c.phone}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="emails" className="mt-0">
            {(emails.data ?? []).length === 0 ? (
              <Empty>Nincs email a céghez.</Empty>
            ) : (
              <ul className="divide-y rounded-md border">
                {emails.data!.map((e) => (
                  <li key={e.id} className="px-3 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      {e.is_outbound ? <Send className="h-3 w-3 text-muted-foreground" /> : <Inbox className="h-3 w-3 text-muted-foreground" />}
                      <span className="truncate font-medium">{e.subject ?? "(nincs tárgy)"}</span>
                      <span className="ml-auto shrink-0 text-muted-foreground">{relativeTime(e.internal_date ?? e.created_at)}</span>
                    </div>
                    <div className="mt-0.5 truncate text-muted-foreground">
                      {e.is_outbound ? `→ ${e.to_email ?? ""}` : `← ${e.from_email ?? ""}`}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="docs" className="mt-0">
            {(docs.data ?? []).length === 0 ? (
              <Empty>Nincs dokumentum.</Empty>
            ) : (
              <ul className="divide-y rounded-md border">
                {docs.data!.map((d) => (
                  <li key={d.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                    <FileText className="h-3 w-3 text-muted-foreground" />
                    <span className="truncate font-medium">{d.name ?? "—"}</span>
                    <span className="ml-auto shrink-0 text-muted-foreground">{fmtDateTime(d.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="timeline" className="mt-0">
            <Timeline
              company={company.data}
              contacts={contacts.data ?? []}
              emails={emails.data ?? []}
              docs={docs.data ?? []}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" /> {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="col-span-2 truncate">{value}</dd>
    </>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">{children}</div>;
}

function Timeline({
  company, contacts, emails, docs,
}: {
  company: { name?: string; notes?: string | null; created_at?: string } | null | undefined;
  contacts: any[]; emails: any[]; docs: any[];
}) {
  if (!company?.created_at) return <Empty>Nincs cég — nincs idővonal.</Empty>;
  const meta = readMarketingMeta(company.notes ?? null);
  const events = buildTimeline(
    {
      company: { name: company.name ?? "—", created_at: company.created_at },
      contacts, emails, docs,
      meta,
    },
    company.notes ?? null,
  );
  if (events.length === 0) return <Empty>Még nincs esemény.</Empty>;
  return (
    <ul className="space-y-2">
      {events.map((ev, i) => (
        <li key={i} className="flex gap-2 text-xs">
          <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">{ev.label}</span>
              <span className="ml-auto shrink-0 text-muted-foreground">{fmtDateTime(ev.at)}</span>
            </div>
            {ev.detail && <div className="truncate text-muted-foreground">{ev.detail}</div>}
          </div>
        </li>
      ))}
    </ul>
  );
}
