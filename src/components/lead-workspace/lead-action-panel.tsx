import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mail, Bot, FileText, Radar, TrendingUp, ArrowRight, CheckCircle2, FileSignature, UserCheck, Sparkles, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { EmailComposer } from "@/components/emails/email-composer";
import { FollowupQuickForm } from "./followup-quick-form";
import { AiSheet } from "./ai-sheet";
import { useCreateLeadFollowup } from "./use-lead-mutations";
import { QuickCreateQuoteButton } from "@/components/today/quick-create";
import { LeadHandoffPanel } from "./lead-handoff-panel";
import { toast } from "sonner";

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

  const agent = mode === "sales" ? "sales" : "crm";
  const agentLabel = mode === "sales" ? "Timothy – Értékesítési Segítő" : "George – CRM Navigátor";
  const AgentIcon = mode === "sales" ? TrendingUp : Radar;

  const defaultTo = contact.data?.email ?? lead.data?.email ?? "";
  const defaultSubject = lead.data?.summary ? `Re: ${lead.data.summary.slice(0, 60)}` : "";

  const leadForFu = lead.data
    ? { id: lead.data.id, company_id: lead.data.company_id ?? null }
    : null;
  const autoFollowup = useCreateLeadFollowup(leadForFu);

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
      {/* Folyamat-szalag */}
      <ProcessStrip mode={mode} status={lead.data?.status} />

      {/* 1. Email */}
      <div className="rounded-md border p-3">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Mail className="h-3 w-3" /> Email
        </div>
        <Button size="sm" className="w-full" onClick={() => setEmailOpen(true)}>
          <Mail className="mr-1.5 h-3.5 w-3.5" /> Levél írása
        </Button>
        {defaultTo && (
          <div className="mt-1.5 truncate text-[11px] text-muted-foreground">Címzett: {defaultTo}</div>
        )}
        <div className="mt-1.5 text-[11px] text-muted-foreground">
          Sikeres küldés után automatikus utókövetés (+3 nap).
        </div>
      </div>

      {/* 2. Followup */}
      <FollowupQuickForm lead={leadForFu} />

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

      {/* 4. Ajánlat — csak Sales */}
      {mode === "sales" && (
        <div className="rounded-md border p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <FileText className="h-3 w-3" /> Ajánlat
          </div>
          <QuickCreateQuoteButton
            label="Új ajánlat indítása"
            variant="secondary"
          />
          <div className="mt-1.5 text-[11px] text-muted-foreground">
            Dialog itt nyílik, oldalváltás nélkül.
          </div>
        </div>
      )}

      {/* 5. Átadás értékesítőnek — csak Marketing, qualified státusznál */}
      {mode === "marketing" && lead.data && (
        <LeadHandoffPanel
          lead={{
            id: lead.data.id,
            status: lead.data.status ?? null,
            company_id: lead.data.company_id ?? null,
          }}
        />
      )}

      <EmailComposer
        open={emailOpen}
        onOpenChange={setEmailOpen}
        defaultTo={defaultTo}
        defaultSubject={defaultSubject}
        onSent={handleEmailSent}
      />
      <AiSheet open={aiOpen} onOpenChange={setAiOpen} agent={agent} agentLabel={agentLabel} />
    </div>
  );
}

/* ─────────── Folyamat-szalag ─────────── */

type StepKey = "lead" | "email" | "followup" | "ai" | "quote" | "contract";

function ProcessStrip({ mode, status }: { mode: Mode; status?: string | null }) {
  const steps: { key: StepKey; label: string; icon: typeof Mail }[] =
    mode === "sales"
      ? [
          { key: "lead", label: "Lead", icon: Radar },
          { key: "quote", label: "Ajánlat", icon: FileText },
          { key: "followup", label: "Followup", icon: CheckCircle2 },
          { key: "contract", label: "Szerződés", icon: FileSignature },
        ]
      : [
          { key: "lead", label: "Lead", icon: Radar },
          { key: "email", label: "Email", icon: Mail },
          { key: "followup", label: "Followup", icon: CheckCircle2 },
          { key: "ai", label: "AI", icon: Bot },
        ];

  // Egyszerű aktív lépés-becslés a lead státuszából.
  const active: StepKey =
    status === "converted" ? (mode === "sales" ? "contract" : "ai") :
    status === "qualified" ? (mode === "sales" ? "quote" : "followup") :
    status === "contacted" ? (mode === "sales" ? "quote" : "email") :
    "lead";

  return (
    <div className="rounded-md border bg-muted/30 p-2">
      <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {mode === "sales" ? "Értékesítési folyamat" : "Marketing folyamat"}
      </div>
      <div className="flex items-center gap-1">
        {steps.map((s, i) => {
          const isActive = s.key === active;
          const Icon = s.icon;
          return (
            <div key={s.key} className="flex flex-1 items-center gap-1">
              <div
                className={`flex flex-1 items-center justify-center gap-1 rounded px-1.5 py-1 text-[10px] font-medium ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground border"
                }`}
              >
                <Icon className="h-3 w-3" />
                <span className="truncate">{s.label}</span>
              </div>
              {i < steps.length - 1 && <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground/60" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}