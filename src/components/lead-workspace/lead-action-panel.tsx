import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Mail, BellRing, Bot, FileText, Radar, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { EmailComposer } from "@/components/emails/email-composer";
import { FollowupQuickForm } from "./followup-quick-form";
import { AiSheet } from "./ai-sheet";

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

  if (!leadId) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div className="text-xs text-muted-foreground">Válassz egy érdeklődőt az akciókhoz.</div>
      </div>
    );
  }

  const leadForFu = lead.data
    ? { id: lead.data.id, company_id: lead.data.company_id ?? null }
    : null;

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-3">
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
          <Button size="sm" variant="secondary" className="w-full" asChild>
            <Link to="/quotes" search={{ new: 1 } as any}>
              <FileText className="mr-1.5 h-3.5 w-3.5" /> Új ajánlat indítása
            </Link>
          </Button>
          {lead.data?.company_id && (
            <div className="mt-1.5 text-[11px] text-muted-foreground">
              Az ajánlat oldalon válaszd ki ezt a céget.
            </div>
          )}
        </div>
      )}

      <EmailComposer
        open={emailOpen}
        onOpenChange={setEmailOpen}
        defaultTo={defaultTo}
        defaultSubject={defaultSubject}
      />
      <AiSheet open={aiOpen} onOpenChange={setAiOpen} agent={agent} agentLabel={agentLabel} />
    </div>
  );
}