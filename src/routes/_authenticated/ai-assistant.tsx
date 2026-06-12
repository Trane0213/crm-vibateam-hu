import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Send, Plus, Trash2, MessageSquare, Loader2, CalendarCheck, BellRing, Briefcase, FileText, AlertTriangle, Search, TrendingUp, Hammer, Phone, AlertOctagon, ClipboardList, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/page-header";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { aiStep } from "@/lib/ai/ai.functions";
import { SYSTEM_PROMPTS } from "@/lib/ai/prompts";
import { loadCrmSnapshot, serializeSnapshot } from "@/lib/ai/crm-context";
import type { AgentId } from "@/lib/ai/agents";
import { getToolDefsForAgent, runTool } from "@/lib/ai/tools";
import { AgentResponse } from "@/components/ai/agent-response";
import { executeProposal, proposalTitle, type Proposal } from "@/lib/ai/operator";
import { logAiAction, updateAiAction, type ActionType, type AgentType } from "@/lib/ai/action-log";

export const Route = createFileRoute("/_authenticated/ai-assistant")({
  component: AiAssistantPage,
});

type NavCard = { to: string; params?: Record<string, string>; label: string };
type ProposalCard = { logId: string | null; proposal: Proposal; status: "pending" | "approved" | "rejected" | "error"; error?: string };
type Msg = { id: string; role: "user" | "assistant"; content: string; at: number; nav?: NavCard; proposal?: ProposalCard };
type Thread = { id: string; title: string; agent: AgentId; updatedAt: number; messages: Msg[] };

const STORAGE_KEY = "viba.ai.threads.v1";
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

function loadThreads(): Thread[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Thread[]) : [];
  } catch {
    return [];
  }
}
function saveThreads(threads: Thread[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(threads)); } catch { /* ignore */ }
}

type QuickAction = { id: string; label: string; icon: any; prompt: string };

const QUICK_ACTIONS: Record<AgentId, QuickAction[]> = {
  crm: [
    { id: "search-company", label: "Cég keresés",        icon: Search,        prompt: "Listázd a CRM-ben lévő cégeket, és minden céghez mondd meg: hány kapcsolattartó, hány projekt, hány ajánlat tartozik hozzá." },
    { id: "project-overview", label: "Projekt áttekintés", icon: Briefcase,     prompt: "Adj projekt-áttekintést: minden projektnél a cég neve, a kapcsolattartó, az ajánlatok száma és a legutóbbi tevékenység." },
    { id: "docs",          label: "Dokumentumok",        icon: ClipboardList, prompt: "Mely projektekhez tartozik dokumentum, és melyikhez nem? Adj listát mindkét csoportról." },
    { id: "contacts",      label: "Kapcsolattartók",     icon: MessageSquare, prompt: "Listázd a kapcsolattartókat cég szerint csoportosítva. Emeld ki, ahol nincs telefonszám vagy e-mail." },
  ],
  sales: [
    { id: "call-today",    label: "Kit hívjak ma?",       icon: Phone,         prompt: "Kit hívjak ma? Használd a daily_call_list toolt és prezentáld a top 5 ügyfelet indoklással." },
    { id: "fu-suggest",    label: "Utókövetés javaslatok", icon: BellRing,      prompt: "Mely ajánlatokra kell most utókövetés? Használd a quote_followup_assistant toolt és add meg ajánlatonként a javasolt típust (call/email/task) az indoklással." },
    { id: "open-quotes",   label: "Nyitott ajánlatok",    icon: FileText,      prompt: "Listázd a nyitott ajánlatokat érték szerint csökkenő sorrendben. Használd a quote_risk_report toolt. Jelöld, melyik mióta nyitott és mely ajánlatok elakadtak (>14 nap)." },
    { id: "overdue-fu",    label: "Lejárt utókövetések",   icon: AlertTriangle, prompt: "Mutasd a lejárt utókövetésekat prioritás szerint. Használd a daily_call_list toolt — az 'overdue_followup' indokkal szereplő ügyfeleket emeld ki, hány napja lejárt jelöléssel." },
    { id: "marketing-leads", label: "Új marketing érdeklődők", icon: TrendingUp,  prompt: "Listázd az új marketing érdeklődőket. Használd a lead_priority_report toolt, és szűrd azokra az érdeklődőkre, ahol source = 'Marketing Agent' ÉS status = 'new'. Minden érdeklődőhöz add meg: cég neve, létrehozás dátuma (hány napja), elérhetőség (telefon/email a kapcsolattartóból), hogy a kolléga azonnal tudja hívni. Sorrend: legfrissebb először." },
  ],
  pm: [
    { id: "daily-pm",      label: "Napi PM riport",      icon: Hammer,        prompt: "Készítsd el a mai napi projektvezetői riportot a sablon szerint." },
    { id: "today-tasks",   label: "Mai feladatok",       icon: CalendarCheck, prompt: "Sorold fel a ma esedékes és lejárt feladatokat projekt szerint csoportosítva." },
    { id: "deadlines",     label: "Közelgő határidők",   icon: BellRing,      prompt: "Mely projekteknek vannak 7 napon belüli határidős feladatai? Adj projekt + dátum listát." },
    { id: "missing-docs",  label: "Hiányzó dokumentáció", icon: ClipboardList, prompt: "Mely aktív projekteknek nincs egyetlen dokumentumuk sem? Adj listát." },
    { id: "risks",         label: "Kockázatos projektek", icon: AlertOctagon,  prompt: "Mely projektek kockázatosak (lejárt feladat, nincs utókövetés, nincs dokumentum)? Indoklással." },
  ],
};

const AGENT_META: Record<AgentId, { name: string; tagline: string; icon: any }> = {
  crm:   { name: "Marven – CRM Navigátor", tagline: "Segít eligibálni a CRM-ben — megtalál cégeket, projekteket, ajánlatokat, kapcsolattartókat.", icon: Search },
  sales: { name: "Eladási Segítő",          tagline: "Az értékesítésben segít — megmondja kit kell ma hívni, mely ajánlatok állnak, mely leadek aktívak.", icon: TrendingUp },
  pm:    { name: "Projektsegítő",           tagline: "A projektek vezetésében segít — határidők, mai feladatok, veszélyes projektek, hiányzó dokumentumok.", icon: Hammer },
};

function AiAssistantPage() {
  const navigate = useNavigate();
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const urlAgent = (() => {
    const v = new URLSearchParams(searchStr ?? "").get("agent");
    return v === "sales" || v === "pm" || v === "crm" ? (v as AgentId) : null;
  })();

  const [threads, setThreads] = useState<Thread[]>(() => loadThreads());
  const [activeId, setActiveId] = useState<string | null>(() => {
    const all = loadThreads();
    return all[0]?.id ?? null;
  });
  const [agent, setAgent] = useState<AgentId>(() => {
    const v = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("agent") : null;
    if (v === "sales" || v === "pm" || v === "crm") return v as AgentId;
    const all = loadThreads();
    return (all[0]?.agent as AgentId) ?? "crm";
  });

  // URL `?agent=` változás → agent váltás (sidebar deep-link).
  useEffect(() => {
    if (urlAgent && urlAgent !== agent) {
      setAgent(urlAgent);
      setActiveId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlAgent]);

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { saveThreads(threads); }, [threads]);
  useEffect(() => { inputRef.current?.focus(); }, [activeId]);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  });

  const active = useMemo(() => threads.find((t) => t.id === activeId) ?? null, [threads, activeId]);

  // Beszélgetés váltáskor állítsuk be az agentet a thread agentjére.
  useEffect(() => { if (active?.agent) setAgent(active.agent); /* eslint-disable-next-line */ }, [activeId]);

  function newThread(initial?: string, agentId: AgentId = agent): Thread {
    const t: Thread = { id: uid(), title: initial?.slice(0, 60) || "Új beszélgetés", agent: agentId, updatedAt: Date.now(), messages: [] };
    setThreads((prev) => [t, ...prev]);
    setActiveId(t.id);
    setAgent(agentId);
    return t;
  }

  function deleteThread(id: string) {
    setThreads((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (id === activeId) setActiveId(next[0]?.id ?? null);
      return next;
    });
  }

  async function ask(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    let thread = active;
    if (!thread) thread = newThread(question, agent);
    const usedAgent: AgentId = thread.agent ?? agent;
    const agentTypeForLog: AgentType = usedAgent === "crm" ? "marvin" : usedAgent;
    const userMsg: Msg = { id: uid(), role: "user", content: question, at: Date.now() };
    // Optimistic update
    setThreads((prev) => prev.map((t) => t.id === thread!.id ? {
      ...t,
      title: t.messages.length === 0 ? question.slice(0, 60) : t.title,
      updatedAt: Date.now(),
      messages: [...t.messages, userMsg],
    } : t));
    setInput("");
    setBusy(true);
    let pendingNav: NavCard | null = null;
    let pendingProposal: ProposalCard | null = null;
    try {
      const snapshot = await loadCrmSnapshot();
      const context = serializeSnapshot(snapshot);
      const history = (thread.messages ?? []).slice(-10).map((m) => ({ role: m.role, content: m.content }));
      const messages: any[] = [
        { role: "system" as const, content: SYSTEM_PROMPTS[usedAgent] },
        { role: "system" as const, content: `[CRM KONTEXTUS — ${new Date().toLocaleString("hu-HU")}]\n${context}` },
        ...history,
        { role: "user" as const, content: question },
      ];
      const tools = getToolDefsForAgent(usedAgent);
      // Tool-loop: max 5 iteráció. Az LLM toolt hívhat → kliens végrehajtja
      // (csak olvasás), az eredményt visszaadjuk neki, amíg szöveggel nem zár.
      let finalText = "";
      for (let i = 0; i < 5; i++) {
        const step = await aiStep({ data: { messages, tools } });
        if (step.tool_calls && step.tool_calls.length > 0) {
          messages.push({ role: "assistant", content: step.text ?? "", tool_calls: step.tool_calls });
          for (const call of step.tool_calls) {
            let args: any = {};
            try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* ignore */ }
            const result = await runTool(call.function.name, args);
            // __navigate envelope: jegyezzük be a navigációs kártyát
            if (result && typeof result === "object" && (result as any).__navigate) {
              const nav = (result as any).__navigate as NavCard;
              pendingNav = nav;
              await logAiAction({
                agent_type: agentTypeForLog,
                action_type: "navigate",
                payload: { tool: call.function.name, args, target: nav },
                approved: true,
                executed: true,
                result: { route: nav.to, params: nav.params ?? null },
              });
            }
            // __proposal envelope: jegyezzük be jóváhagyásra váró javaslatként
            if (result && typeof result === "object" && (result as any).__proposal) {
              const proposal = (result as any).__proposal as Proposal;
              const actionType: ActionType = proposal.kind as ActionType;
              const logId = await logAiAction({
                agent_type: agentTypeForLog,
                action_type: actionType,
                payload: proposal as any,
                approved: false,
                executed: false,
              });
              pendingProposal = { logId, proposal, status: "pending" };
            }
            messages.push({ role: "tool", tool_call_id: call.id, name: call.function.name, content: JSON.stringify(result).slice(0, 12000) });
          }
          continue;
        }
        finalText = step.text || "";
        break;
      }
      const assistantMsg: Msg = {
        id: uid(),
        role: "assistant",
        content: finalText || (pendingNav ? `Megnyitottam: ${pendingNav.label}` : pendingProposal ? "Javaslatot készítettem — kérlek hagyd jóvá." : "(üres válasz)"),
        at: Date.now(),
        nav: pendingNav ?? undefined,
        proposal: pendingProposal ?? undefined,
      };
      setThreads((prev) => prev.map((t) => t.id === thread!.id ? {
        ...t, updatedAt: Date.now(), messages: [...t.messages, assistantMsg],
      } : t));
      // Auto-navigate ha van egyértelmű cél (egyetlen találat)
      if (pendingNav) {
        try {
          navigate({ to: pendingNav.to as any, params: pendingNav.params as any });
          toast.success(`Megnyitva: ${pendingNav.label}`);
        } catch (e: any) {
          toast.error("Navigáció sikertelen", { description: e?.message });
        }
      }
    } catch (err: any) {
      const msg = err?.message ?? "Ismeretlen AI hiba.";
      toast.error(msg);
      const errorMsg: Msg = { id: uid(), role: "assistant", content: `⚠️ Hiba: ${msg}`, at: Date.now() };
      setThreads((prev) => prev.map((t) => t.id === thread!.id ? {
        ...t, updatedAt: Date.now(), messages: [...t.messages, errorMsg],
      } : t));
    } finally {
      setBusy(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  async function approveProposal(msgId: string) {
    const thread = active;
    if (!thread) return;
    const msg = thread.messages.find((m) => m.id === msgId);
    if (!msg?.proposal || msg.proposal.status !== "pending") return;
    const card = msg.proposal;
    try {
      const exec = await executeProposal(card.proposal);
      if (card.logId) {
        await updateAiAction(card.logId, { approved: true, executed: true, result: exec as any });
      }
      updateProposalStatus(msgId, "approved");
      toast.success(`${proposalTitle(card.proposal)} létrehozva`);
      if (exec.route) {
        try { navigate({ to: exec.route as any, params: exec.params as any }); } catch { /* ignore */ }
      }
    } catch (e: any) {
      const errorMsg = e?.message ?? String(e);
      if (card.logId) await updateAiAction(card.logId, { error_message: errorMsg });
      updateProposalStatus(msgId, "error", errorMsg);
      toast.error("Mentés sikertelen", { description: errorMsg });
    }
  }

  async function rejectProposal(msgId: string) {
    const thread = active;
    if (!thread) return;
    const msg = thread.messages.find((m) => m.id === msgId);
    if (!msg?.proposal) return;
    if (msg.proposal.logId) await updateAiAction(msg.proposal.logId, { approved: false });
    updateProposalStatus(msgId, "rejected");
  }

  function updateProposalStatus(msgId: string, status: ProposalCard["status"], error?: string) {
    setThreads((prev) => prev.map((t) => t.id !== activeId ? t : {
      ...t,
      messages: t.messages.map((m) => m.id === msgId && m.proposal
        ? { ...m, proposal: { ...m.proposal, status, error } }
        : m),
    }));
  }

  const meta = AGENT_META[agent];
  const quickActions = QUICK_ACTIONS[agent];
  return (
    <div className="flex flex-col">
      <PageHeader
        title="AI Asszisztens"
        description="Három agent, ugyanaz a CRM adat — különböző szemszögből. Csak olvasás: az agentek nem hoznak létre és nem módosítanak adatot."
        actions={
          <Button size="sm" variant="outline" onClick={() => newThread(undefined, agent)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Új beszélgetés
          </Button>
        }
      />
      {/* Agent választó */}
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-6 py-3">
        {(Object.keys(AGENT_META) as AgentId[]).map((a) => {
          const m = AGENT_META[a];
          const Icon = m.icon;
          const isActive = agent === a;
          return (
            <button
              key={a}
              onClick={() => {
                setAgent(a);
                if (active && active.messages.length === 0) {
                  setThreads((prev) => prev.map((t) => t.id === active.id ? { ...t, agent: a } : t));
                } else {
                  setActiveId(null);
                }
              }}
              className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition ${isActive ? "border-primary bg-primary/10 text-primary" : "border-border bg-background hover:bg-accent"}`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="font-medium">{m.name}</span>
            </button>
          );
        })}
        <Badge variant="outline" className="ml-auto text-[10px] font-normal">Csak olvasás</Badge>
      </div>
      <div className="border-b bg-background px-6 py-2 text-xs text-muted-foreground">{meta.tagline}</div>

      <div className="grid gap-4 p-4 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)] min-h-[calc(100vh-12rem)]">
        {/* Beszélgetés lista */}
        <Card className="h-full">
          <CardContent className="p-2">
            <div className="px-2 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">Beszélgetések</div>
            {threads.length === 0 ? (
              <p className="px-2 py-3 text-xs text-muted-foreground">Még nincs beszélgetés. Tegyél fel egy kérdést, vagy kattints egy gyors műveletre.</p>
            ) : (
              <ul className="space-y-1">
                {threads.map((t) => (
                  <li key={t.id} className={`group flex items-center justify-between gap-1 rounded-md px-2 py-1.5 text-sm ${t.id === activeId ? "bg-accent" : "hover:bg-muted/60"}`}>
                    <button onClick={() => setActiveId(t.id)} className="flex flex-1 items-center gap-2 truncate text-left">
                      <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{t.title}</span>
                      <span className="ml-1 shrink-0 text-[10px] text-muted-foreground">· {AGENT_META[t.agent]?.name?.split(" ")[0] ?? "CRM"}</span>
                    </button>
                    <button onClick={() => deleteThread(t.id)} className="opacity-0 transition group-hover:opacity-100" title="Törlés">
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Chat panel */}
        <Card className="flex h-full flex-col min-w-0">
          <div className="flex-1 min-h-[400px]">
            <ScrollArea className="h-full">
              <div ref={scrollRef} className="mx-auto w-full max-w-[1100px] space-y-4 p-6">
                {!active || active.messages.length === 0 ? (
                  <EmptyChat onPick={ask} disabled={busy} agent={agent} meta={meta} actions={quickActions} />
                ) : (
                  active.messages.map((m) => (
                    <Bubble
                      key={m.id}
                      msg={m}
                      onApprove={() => approveProposal(m.id)}
                      onReject={() => rejectProposal(m.id)}
                      onOpenNav={() => m.nav && navigate({ to: m.nav.to as any, params: m.nav.params as any })}
                    />
                  ))
                )}
                {busy && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Az AI az aktuális CRM adatok alapján dolgozik…
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
          {/* Composer */}
          <div className="border-t bg-muted/20 p-3">
            <div className="mx-auto w-full max-w-[1100px]">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {quickActions.map((q) => (
                <Button key={q.id} size="sm" variant="outline" disabled={busy} onClick={() => ask(q.prompt)}>
                  <q.icon className="mr-1.5 h-3.5 w-3.5" /> {q.label}
                </Button>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <Textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input); }
                }}
                placeholder={`Kérdezz a(z) ${meta.name}-tól… (Enter = küldés, Shift+Enter = új sor)`}
                rows={2}
                disabled={busy}
                className="resize-none"
              />
              <Button size="icon" onClick={() => ask(input)} disabled={busy || !input.trim()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Bubble({ msg, onApprove, onReject, onOpenNav }: { msg: Msg; onApprove?: () => void; onReject?: () => void; onOpenNav?: () => void }) {
  const isUser = msg.role === "user";
  if (!isUser) {
    return (
      <div className="flex gap-3">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Bot className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <AgentResponse text={msg.content} />
          {msg.nav && (
            <div className="mt-2 flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
              <ExternalLink className="h-3.5 w-3.5 text-primary" />
              <span className="font-medium">Megnyitva:</span>
              <span className="truncate">{msg.nav.label}</span>
              <Button size="sm" variant="outline" className="ml-auto h-6 px-2 text-[11px]" onClick={onOpenNav}>Újra megnyit</Button>
            </div>
          )}
          {msg.proposal && (
            <ProposalCardView card={msg.proposal} onApprove={onApprove} onReject={onReject} />
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-end gap-2">
      <div className="max-w-[75%] rounded-lg bg-primary px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed text-primary-foreground">
        {msg.content}
      </div>
    </div>
  );
}

function ProposalCardView({ card, onApprove, onReject }: { card: ProposalCard; onApprove?: () => void; onReject?: () => void }) {
  const p = card.proposal;
  const fields: Array<[string, any]> = [];
  if (p.kind === "create_followup") {
    fields.push(["Esedékesség", new Date(p.due_date).toLocaleString("hu-HU")]);
    if (p.followup_type) fields.push(["Típus", p.followup_type]);
    if (p.result) fields.push(["Megjegyzés", p.result]);
  } else if (p.kind === "create_task") {
    fields.push(["Megnevezés", p.title]);
    if (p.due_date) fields.push(["Határidő", new Date(p.due_date).toLocaleString("hu-HU")]);
    if (p.priority) fields.push(["Prioritás", p.priority]);
    if (p.description) fields.push(["Leírás", p.description]);
  } else if (p.kind === "create_contact") {
    fields.push(["Név", p.name]);
    if (p.email) fields.push(["E-mail", p.email]);
    if (p.phone) fields.push(["Telefon", p.phone]);
    if (p.role) fields.push(["Pozíció", p.role]);
  } else if (p.kind === "create_lead") {
    fields.push(["Összefoglaló", p.summary]);
    if (p.source) fields.push(["Forrás", p.source]);
    if (p.project_type) fields.push(["Típus", p.project_type]);
  }
  const tone = card.status === "approved" ? "border-[color:var(--status-success)]/40 bg-[color:var(--status-success)]/5"
    : card.status === "rejected" ? "border-muted bg-muted/30"
    : card.status === "error" ? "border-destructive/40 bg-destructive/5"
    : "border-primary/30 bg-primary/5";
  return (
    <div className={`mt-2 rounded-md border p-3 text-xs ${tone}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider">{proposalTitle(p)}</span>
        {card.status === "approved" && <Badge variant="outline" className="text-[10px]"><CheckCircle2 className="mr-1 h-3 w-3" />Létrehozva</Badge>}
        {card.status === "rejected" && <Badge variant="outline" className="text-[10px]">Elvetve</Badge>}
        {card.status === "error" && <Badge variant="destructive" className="text-[10px]">Hiba</Badge>}
        {card.status === "pending" && <Badge variant="outline" className="text-[10px]">Jóváhagyásra vár</Badge>}
      </div>
      <dl className="grid grid-cols-[100px_minmax(0,1fr)] gap-x-2 gap-y-1">
        {fields.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="truncate">{String(v)}</dd>
          </div>
        ))}
      </dl>
      {card.error && <p className="mt-2 text-destructive">{card.error}</p>}
      {card.status === "pending" && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" className="h-7 px-2 text-[11px]" onClick={onApprove}>
            <CheckCircle2 className="mr-1 h-3 w-3" /> Jóváhagy és létrehoz
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={onReject}>
            <XCircle className="mr-1 h-3 w-3" /> Elvet
          </Button>
        </div>
      )}
    </div>
  );
}

function EmptyChat({ onPick, disabled, agent, meta, actions }: {
  onPick: (p: string) => void; disabled: boolean; agent: AgentId;
  meta: { name: string; tagline: string; icon: any };
  actions: QuickAction[];
}) {
  const Icon = meta.icon;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <h3 className="text-sm font-semibold">{meta.name}</h3>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          {meta.tagline} A saját jogosultságoddal lát adatokat. Csak olvas — nem hoz létre és nem módosít.
        </p>
      </div>
      <div className="grid w-full max-w-md grid-cols-1 gap-2 sm:grid-cols-2">
        {actions.map((q) => (
          <Button key={q.id} variant="outline" size="sm" disabled={disabled} onClick={() => onPick(q.prompt)} className="justify-start">
            <q.icon className="mr-2 h-3.5 w-3.5" /> {q.label}
          </Button>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground">Agent: {agent.toUpperCase()}</p>
    </div>
  );
}