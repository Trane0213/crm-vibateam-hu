import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Mail, Bot, FileText, Radar, TrendingUp, ArrowRight, CheckCircle2,
  FileSignature, UserCheck, Sparkles, Filter, Phone, ChevronDown,
  ListChecks, Send, Briefcase, Plus, Check,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { EmailComposer } from "@/components/emails/email-composer";
import { FollowupQuickForm } from "./followup-quick-form";
import { AiSheet } from "./ai-sheet";
import { useCreateLeadFollowup, useUpdateLead } from "./use-lead-mutations";
import { QuickCreateQuoteButton } from "@/components/today/quick-create";
import { toast } from "sonner";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { LEAD_EMAIL_TEMPLATES, type LeadEmailTemplate } from "@/lib/lead-workspace/email-templates";
import { useLookup, fmtDate } from "@/components/resource/resource-page";
import { useListWhere } from "@/lib/db-hooks";
import { LeadActionBar } from "@/components/sales/lead-action-bar";
import { NextStepEditor } from "@/components/sales/next-step-editor";
import { WonDialog } from "@/components/sales/won-dialog";
import { LostDialog } from "@/components/sales/lost-dialog";
import type { LeadStatus } from "@/lib/sales/constants";

const QUOTE_EDITABLE_STATUSES: LeadStatus[] = ["quote_prep", "quote_sent", "follow_up", "contract"];

type Mode = "marketing" | "sales";

export function LeadActionPanel({ leadId, mode }: { leadId: string | null; mode: Mode }) {
  const lead = useQuery({
    queryKey: ["leads", "detail", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("*").eq("id", leadId!).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const companyLabel = useLookup("companies", "name");
  const contactLabel = useLookup("contacts", "name");
  const updateLead = useUpdateLead(leadId);
  const qc = useQueryClient();

  const quotes = useListWhere<any>("quotes", "lead_id", leadId, {
    order: "version", ascending: false, enabled: !!leadId && mode === "sales",
  });
  const projects = useListWhere<any>("projects", "lead_id", leadId, {
    order: "created_at", ascending: false, enabled: !!leadId && mode === "sales",
  });

  // Kapcsolattartó email-je (a contacts.email mezőből, ha létezik)
  const contact = useQuery({
    queryKey: ["contacts", "for-lead", lead.data?.contact_id],
    enabled: !!lead.data?.contact_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts").select("id,name,email").eq("id", lead.data!.contact_id).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const [emailOpen, setEmailOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [emailDefaults, setEmailDefaults] = useState<{ subject?: string; body?: string } | null>(null);
  const [wonOpen, setWonOpen] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [quotesBusy, setQuotesBusy] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["leads"] });
    qc.invalidateQueries({ queryKey: ["lead-status-history", leadId] });
    qc.invalidateQueries({ queryKey: ["quotes"] });
    qc.invalidateQueries({ queryKey: ["projects"] });
  };

  const currentStatus = (lead.data?.status ?? "new") as LeadStatus;
  const quotesEditable = QUOTE_EDITABLE_STATUSES.includes(currentStatus);

  const setCurrentQuote = async (quoteId: string) => {
    if (!leadId) return;
    setQuotesBusy(true);
    try {
      const off = await supabase.from("quotes").update({ is_current: false }).eq("lead_id", leadId).neq("id", quoteId);
      if (off.error) throw off.error;
      const on = await supabase.from("quotes").update({ is_current: true }).eq("id", quoteId);
      if (on.error) throw on.error;
      toast.success("Aktuális verzió frissítve");
      invalidate();
    } catch (e: any) {
      toast.error(e.message ?? "Hiba");
    } finally { setQuotesBusy(false); }
  };

  const createQuoteVersion = async () => {
    if (!leadId) return;
    setQuotesBusy(true);
    try {
      const list = quotes.data ?? [];
      const maxV = list.reduce((m: number, q: any) => Math.max(m, q.version ?? 0), 0);
      const off = await supabase.from("quotes").update({ is_current: false }).eq("lead_id", leadId);
      if (off.error) throw off.error;
      const ins = await supabase.from("quotes").insert({ lead_id: leadId, version: maxV + 1, is_current: true });
      if (ins.error) throw ins.error;
      toast.success(`v${maxV + 1} létrehozva`);
      invalidate();
    } catch (e: any) {
      toast.error(e.message ?? "Hiba");
    } finally { setQuotesBusy(false); }
  };

  const agent = mode === "sales" ? "sales" : "crm";
  const agentLabel = mode === "sales" ? "Timothy – Értékesítési Segítő" : "George – CRM Navigátor";
  const AgentIcon = mode === "sales" ? TrendingUp : Radar;

  const defaultTo = contact.data?.email ?? lead.data?.email ?? "";
  const defaultSubject =
    emailDefaults?.subject ??
    (lead.data?.summary ? `Re: ${lead.data.summary.slice(0, 60)}` : "");
  const defaultBody = emailDefaults?.body;

  const leadForFu = lead.data
    ? { id: lead.data.id, company_id: lead.data.company_id ?? null }
    : null;
  const autoFollowup = useCreateLeadFollowup(leadForFu);
  const callLog = useCreateLeadFollowup(leadForFu);

  function openComposer(template?: LeadEmailTemplate) {
    if (template && lead.data) {
      const ctx = {
        contactName: lead.data.contact_id ? contactLabel(lead.data.contact_id) : null,
        companyName: lead.data.company_id ? companyLabel(lead.data.company_id) : null,
        projectType: lead.data.project_type ?? null,
        source: lead.data.source ?? null,
        summary: lead.data.summary ?? null,
      };
      setEmailDefaults({ subject: template.subject(ctx), body: template.body(ctx) });
    } else {
      setEmailDefaults(null);
    }
    setEmailOpen(true);
  }

  async function logCallNow() {
    if (!leadForFu) return;
    try {
      await callLog.mutateAsync({
        followup_type: "call",
        due_date: new Date().toISOString(),
        result: "Hívás megtörtént",
      });
      // A backend default completed=false — itt jelöljük befejezettnek külön update-tel,
      // de a meglévő API csak insertet támogat -> a Followup már megjelenik az idővonalon.
      toast.success("Hívás rögzítve");
    } catch {/* hook már toastol */}
  }

  function moveStatus(next: string) {
    if (!leadId || !lead.data) return;
    if (lead.data.status === next) return;
    updateLead.mutate({ status: next });
    toast.success(`Státusz: ${next}`);
  }

  async function handleEmailSent() {
    if (!leadForFu) {
      toast.message("Email elküldve");
      return;
    }
    const d = new Date(); d.setDate(d.getDate() + 3); d.setHours(9, 0, 0, 0);
    try {
      await autoFollowup.mutateAsync({
        followup_type: "email",
        due_date: d.toISOString(),
        result: "Email utánkövetés (automatikus, +3 nap)",
      });
      toast.success(
        leadForFu.company_id
          ? "Email elküldve · Followup +3 napra ütemezve"
          : "Email elküldve · Followup +3 napra ütemezve (cég nélkül)",
      );
    } catch {
      // useCreateLeadFollowup már toastolja a hibát
    }
  }

  if (!leadId) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div className="text-xs text-muted-foreground">Válassz egy érdeklődőt az akciókhoz.</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-3">
      {/* Folyamat-szalag — marketingnek kattintható */}
      <ProcessStrip
        mode={mode}
        status={lead.data?.status}
        onStepClick={mode === "marketing" ? moveStatus : undefined}
      />

      {/* SALES — V2 kötelező következő lépés */}
      {mode === "sales" && lead.data && (
        <div className="rounded-md border p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <ListChecks className="h-3 w-3" /> Kötelező következő lépés
          </div>
          {!lead.data.next_step_type && (
            <div className="mb-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
              Nincs következő lépés megadva.
            </div>
          )}
          <NextStepEditor
            type={lead.data.next_step_type ?? null}
            dueAt={lead.data.next_step_due_at ?? null}
            note={lead.data.next_step_note ?? null}
            busy={updateLead.isPending}
            onSave={(p) => updateLead.mutate(p)}
            onClear={() => updateLead.mutate({ next_step_type: null, next_step_due_at: null, next_step_note: null })}
          />
        </div>
      )}

      {/* SALES — V2 státuszváltás állapotgéppel */}
      {mode === "sales" && lead.data && (
        <div className="rounded-md border p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <CheckCircle2 className="h-3 w-3" /> Státusz
          </div>
          <LeadActionBar
            status={currentStatus}
            busy={updateLead.isPending}
            onChangeStatus={(next) => updateLead.mutate({ status: next })}
            onWon={() => setWonOpen(true)}
            onLost={() => setLostOpen(true)}
          />
        </div>
      )}

      {/* 1. Email */}
      <div className="rounded-md border p-3">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Mail className="h-3 w-3" /> Email
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" className="flex-1" onClick={() => openComposer()}>
            <Mail className="mr-1.5 h-3.5 w-3.5" /> Levél írása
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="shrink-0">
                Sablon <ChevronDown className="ml-1 h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {LEAD_EMAIL_TEMPLATES.map((t) => (
                <DropdownMenuItem key={t.id} onClick={() => openComposer(t)}>
                  {t.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {defaultTo && (
          <div className="mt-1.5 truncate text-[11px] text-muted-foreground">Címzett: {defaultTo}</div>
        )}
        <div className="mt-1.5 text-[11px] text-muted-foreground">
          Sikeres küldés után automatikus utókövetés (+3 nap).
        </div>
      </div>

      {/* 2. Followup */}
      <FollowupQuickForm lead={leadForFu} />

      {/* 2b. Hívás rögzítése */}
      <div className="rounded-md border p-3">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Phone className="h-3 w-3" /> Hívás
        </div>
        <Button
          size="sm" variant="secondary" className="w-full"
          disabled={!leadForFu?.company_id || callLog.isPending}
          onClick={logCallNow}
        >
          <Phone className="mr-1.5 h-3.5 w-3.5" />
          {callLog.isPending ? "Rögzítés…" : "Hívás megtörtént"}
        </Button>
        {!leadForFu?.company_id && (
          <div className="mt-1.5 text-[10px] text-muted-foreground">
            Cég hozzárendelése után rögzíthető.
          </div>
        )}
      </div>

      {/* 3. AI */}
      <div className="rounded-md border bg-primary/[0.04] p-3">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-primary/80">
          <Bot className="h-3 w-3" /> AI segédlet
        </div>
        <Button size="sm" className="w-full" onClick={() => setAiOpen(true)}>
          <AgentIcon className="mr-1.5 h-3.5 w-3.5" /> {agentLabel.split(" – ")[0]} megnyitása
        </Button>
        <div className="mt-1.5 text-[11px] text-muted-foreground">
          Bezárás után visszatérsz a Lead Workspace-re.
        </div>
      </div>

      {/* 4. Ajánlat — Sales V2 verziókezelés */}
      {mode === "sales" && (
        <div className="rounded-md border p-3">
          <div className="mb-2 flex items-center justify-between gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <span className="flex items-center gap-1.5"><FileText className="h-3 w-3" /> Ajánlatok</span>
            <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" disabled={!quotesEditable || quotesBusy || !leadId} onClick={createQuoteVersion}>
              <Plus className="mr-1 h-3 w-3" /> Új verzió
            </Button>
          </div>
          {!quotesEditable && (
            <div className="mb-1.5 text-[10px] text-muted-foreground">
              Új verzió csak ajánlat-fázisú leadnél (quote_prep / quote_sent / follow_up / contract).
            </div>
          )}
          {(quotes.data ?? []).length === 0 ? (
            <>
              <QuickCreateQuoteButton label="Új ajánlat indítása" variant="secondary" />
              <div className="mt-1.5 text-[10px] text-muted-foreground">Még nincs ajánlat ehhez a leadhez.</div>
            </>
          ) : (
            <ul className="space-y-1">
              {(quotes.data ?? []).map((qu: any) => (
                <li key={qu.id} className="flex items-center justify-between gap-2 rounded border px-2 py-1 text-[11px]">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Badge variant="outline">v{qu.version}</Badge>
                    {qu.is_current && <Badge>aktuális</Badge>}
                    <Link to="/quotes/$id" params={{ id: qu.id }} className="truncate text-primary hover:underline">
                      megnyitás
                    </Link>
                  </span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <span className="tabular-nums">{fmtDate(qu.created_at)}</span>
                    {!qu.is_current && (
                      <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]" disabled={quotesBusy} onClick={() => setCurrentQuote(qu.id)}>
                        <Check className="mr-0.5 h-3 w-3" /> Akt.
                      </Button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* A „Projekt indítása" gomb és a marketing kézi átadás panel megszűnt.
          - Projekt KIZÁRÓLAG a Pipeline → Megnyert lépésből jöhet létre (ott
            kerül vissza a UI).
          - A marketing→sales átadást a marketing workspace dedikált handoff
            folyamata végzi (state-marker a customer notes-ban), itt nincs
            duplikált belépés. */}

      <EmailComposer
        open={emailOpen}
        onOpenChange={(v) => { setEmailOpen(v); if (!v) setEmailDefaults(null); }}
        defaultTo={defaultTo}
        defaultSubject={defaultSubject}
        defaultBody={defaultBody}
        onSent={handleEmailSent}
      />
      <AiSheet open={aiOpen} onOpenChange={setAiOpen} agent={agent} agentLabel={agentLabel} />

      {/* V2 dialogok */}
      <WonDialog
        open={wonOpen}
        onOpenChange={setWonOpen}
        busy={updateLead.isPending}
        onConfirm={() => updateLead.mutate({ status: "won" }, { onSuccess: () => { setWonOpen(false); invalidate(); } })}
      />
      <LostDialog
        open={lostOpen}
        onOpenChange={setLostOpen}
        busy={updateLead.isPending}
        onConfirm={(p) => updateLead.mutate({ status: "lost", ...p }, { onSuccess: () => { setLostOpen(false); invalidate(); } })}
      />
    </div>
  );
}

/* ─────────── Folyamat-szalag ─────────── */

type StepKey = "lead" | "email" | "followup" | "ai" | "quote" | "contract" | "qualify" | "handoff";

function ProcessStrip({
  mode, status, onStepClick,
}: {
  mode: Mode;
  status?: string | null;
  onStepClick?: (next: string) => void;
}) {
  const steps: { key: StepKey; label: string; icon: typeof Mail }[] =
    mode === "sales"
      ? [
          { key: "lead", label: "Lead", icon: Radar },
          { key: "quote", label: "Ajánlat", icon: FileText },
          { key: "followup", label: "Followup", icon: CheckCircle2 },
          { key: "contract", label: "Szerződés", icon: FileSignature },
        ]
      : [
          // Marketing: lineáris 4-lépéses minőségellenőrzés.
          { key: "lead",    label: "Új lead",         icon: Sparkles },
          { key: "email",   label: "Kapcsolat",       icon: Mail },
          { key: "qualify", label: "Minősítés",       icon: Filter },
          { key: "handoff", label: "Átadás",          icon: UserCheck },
        ];

  // Aktív lépés a lead státuszából.
  const active: StepKey =
    mode === "sales"
      ? (status === "converted" ? "contract"
        : status === "qualified" ? "quote"
        : status === "contacted" ? "quote"
        : "lead")
      : (status === "converted" ? "handoff"
        : status === "qualified" ? "handoff"
        : status === "contacted" ? "qualify"
        : status === "lost"      ? "qualify"
        : "lead");

  // Marketingben a lépés → status mapping (csak amire értelmes a klikk).
  const stepToStatus: Partial<Record<StepKey, string>> =
    mode === "marketing"
      ? { lead: "new", email: "contacted", qualify: "contacted", handoff: "qualified" }
      : {};

  return (
    <div className="rounded-md border bg-muted/30 p-2">
      <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {mode === "sales" ? "Értékesítési folyamat" : "Marketing folyamat"}
      </div>
      <div className="flex items-center gap-1">
        {steps.map((s, i) => {
          const isActive = s.key === active;
          const Icon = s.icon;
          const targetStatus = stepToStatus[s.key];
          const clickable = !!(onStepClick && targetStatus);
          const cls = `flex flex-1 items-center justify-center gap-1 rounded px-1.5 py-1 text-[10px] font-medium transition-colors ${
            isActive
              ? "bg-primary text-primary-foreground"
              : "bg-background text-muted-foreground border"
          } ${clickable && !isActive ? "hover:bg-muted hover:text-foreground cursor-pointer" : ""}`;
          const content = (
            <>
              <Icon className="h-3 w-3" />
              <span className="truncate">{s.label}</span>
            </>
          );
          return (
            <div key={s.key} className="flex flex-1 items-center gap-1">
              {clickable ? (
                <button type="button" className={cls} onClick={() => onStepClick!(targetStatus!)}>
                  {content}
                </button>
              ) : (
                <div className={cls}>{content}</div>
              )}
              {i < steps.length - 1 && <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground/60" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}