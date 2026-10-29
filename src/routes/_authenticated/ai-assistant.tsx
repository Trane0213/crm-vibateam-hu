import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Send, Plus, Trash2, MessageSquare, Loader2, CalendarCheck, BellRing, Briefcase, FileText, AlertTriangle, Search, TrendingUp, Hammer, Phone, AlertOctagon, ClipboardList, CheckCircle2, XCircle, ExternalLink, BarChart3, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  type AgentId, type AgentMeta, type QuickAction, type Msg, type Thread, type ToolApproval,
  AGENT_META, QUICK_ACTIONS, uid, isLegacyErrorMessage, uiAgentToAiOs, loadThreads, saveThreads, isAgentId,
  Bubble,
} from "@/components/ai/chat-shared";
import { runAiAgent } from "@/lib/ai-os/runtime.functions";
import { AgentGate } from "@/components/ai/agent-gate";
import { useVisibleAgents } from "@/hooks/use-visible-agents";

/** UI agent azonosítók — a `?agent=` paraméter és a thread agent mezője ezt használja. */

export const Route = createFileRoute("/_authenticated/ai-assistant")({
  component: AiAssistantRoute,
});

function AiAssistantRoute() {
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const urlAgent = new URLSearchParams(searchStr ?? "").get("agent");
  // Csak akkor érvényesítünk gate-et, ha az URL kifejezetten megad agentet.
  // Ha nincs ?agent=, akkor a default crm (George) tölt be, ami mindenki számára látható.
  const agentToGate =
    isAgentId(urlAgent) ? urlAgent : null;
  return (
    <AgentGate agentId={agentToGate}>
      <AiAssistantPage />
    </AgentGate>
  );
}

function AiAssistantPage() {
  const navigate = useNavigate();
  const { visibleAgentIds } = useVisibleAgents();
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const urlAgent = (() => {
    const v = new URLSearchParams(searchStr ?? "").get("agent");
    return isAgentId(v) ? (v as AgentId) : null;
  })();

  const [threads, setThreads] = useState<Thread[]>(() => loadThreads());
  const [activeId, setActiveId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const sp = new URLSearchParams(window.location.search);
    const urlA = sp.get("agent");
    const all = loadThreads();
    // Ha az URL agentet kér, csak az adott agenthez tartozó thread induljon aktívként.
    if (isAgentId(urlA)) {
      return all.find((t) => t.agent === urlA)?.id ?? null;
    }
    return all[0]?.id ?? null;
  });
  const [agent, setAgent] = useState<AgentId>(() => {
    const v = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("agent") : null;
    if (isAgentId(v)) return v as AgentId;
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
  // FONTOS: ha az URL kifejezetten megad agentet (`?agent=...`), az felülír mindent.
  // Enélkül egy régi (pl. Timothy/sales) thread automatikusan átkapcsolná az
  // agentet George helyett — ez okozta a "George kártyán Timothy nyílik meg" hibát.
  useEffect(() => {
    if (urlAgent) return; // URL az igazságforrás
    if (active?.agent) setAgent(active.agent);
    /* eslint-disable-next-line */
  }, [activeId, urlAgent]);

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
    if (question.length > 4000) {
      toast.error("A kérdés túl hosszú", { description: "Rövidítsd 4000 karakter alá." });
      return;
    }
    let thread = active;
    if (!thread) thread = newThread(question, agent);
    const usedAgent: AgentId = thread.agent ?? agent;
    const userMsg: Msg = { id: uid(), role: "user", content: question, at: Date.now() };
    setThreads((prev) => prev.map((t) => t.id === thread!.id ? {
      ...t,
      title: t.messages.length === 0 ? question.slice(0, 60) : t.title,
      updatedAt: Date.now(),
      messages: [...t.messages, userMsg],
    } : t));
    setInput("");
    setBusy(true);
    try {
      const aiAgentId = uiAgentToAiOs(usedAgent);
      const history = [...(thread.messages ?? []), userMsg]
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-20)
        .map((m) => ({ role: m.role, content: m.modelContent ?? m.content }));
      const result = await runAiAgent({ data: { agentId: aiAgentId, history } });
      const approvals: ToolApproval[] | undefined = result.pendingApprovals.length
        ? result.pendingApprovals.map((p) => ({
            tool_call_id: p.tool_call_id,
            tool_name: p.tool_name,
            arguments_json: p.arguments_json,
            status: "pending" as const,
            approval: (p as any).approval,
            supports_dry_run: (p as any).supports_dry_run,
          }))
        : undefined;
      const assistantMsg: Msg = {
        id: uid(),
        role: "assistant",
        content: result.finalText || (approvals ? "Jóváhagyást igénylő művelet vár rád." : "(üres válasz)"),
        at: Date.now(),
        approvals,
        runId: result.runId,
      };
      setThreads((prev) => prev.map((t) => t.id === thread!.id ? {
        ...t, updatedAt: Date.now(), messages: [...t.messages, assistantMsg],
      } : t));
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

  async function approveToolCall(msgId: string, toolCallId: string) {
    const thread = active;
    if (!thread) return;
    const msg = thread.messages.find((m) => m.id === msgId);
    if (!msg?.approvals) return;
    const approval = msg.approvals.find((a) => a.tool_call_id === toolCallId);
    if (!approval || approval.status !== "pending") return;
    updateApprovalStatus(msgId, toolCallId, "pending");
    setBusy(true);
    try {
      const aiAgentId = uiAgentToAiOs(thread.agent ?? agent);
      // A history-t a userMsg-ig építjük újra (az approvals az utolsó assistant lépéshez tartoznak).
      const idx = thread.messages.findIndex((m) => m.id === msgId);
      const history = thread.messages
        .slice(0, idx)
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-20)
        .map((m) => ({ role: m.role, content: m.modelContent ?? m.content }));
      const result = await runAiAgent({
        data: { agentId: aiAgentId, history, approvedToolCallIds: [toolCallId] },
      });
      updateApprovalStatus(msgId, toolCallId, "approved");
      const followup: Msg = {
        id: uid(), role: "assistant", at: Date.now(),
        content: result.finalText || "Művelet végrehajtva.",
        runId: result.runId,
      };
      setThreads((prev) => prev.map((t) => t.id === thread.id ? {
        ...t, updatedAt: Date.now(), messages: [...t.messages, followup],
      } : t));
      toast.success(`${approval.tool_name} végrehajtva`);
    } catch (e: any) {
      updateApprovalStatus(msgId, toolCallId, "error", e?.message ?? String(e));
      toast.error("Végrehajtás sikertelen", { description: e?.message });
    } finally {
      setBusy(false);
    }
  }

  function rejectToolCall(msgId: string, toolCallId: string) {
    updateApprovalStatus(msgId, toolCallId, "rejected");
  }

  function updateApprovalStatus(msgId: string, toolCallId: string, status: ToolApproval["status"], error?: string) {
    setThreads((prev) => prev.map((t) => t.id !== activeId ? t : {
      ...t,
      messages: t.messages.map((m) => m.id === msgId && m.approvals
        ? { ...m, approvals: m.approvals.map((a) => a.tool_call_id === toolCallId ? { ...a, status, error } : a) }
        : m),
    }));
  }

  const meta = AGENT_META[agent];
  const quickActions = QUICK_ACTIONS[agent];
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Agent fejléc — portré + név + szerep + váltó */}
      <div className={`border-b ${meta.accent} transition-colors`}>
        <div className="flex items-start gap-4 px-6 py-4">
          <img
            src={meta.portrait}
            alt={meta.name}
            width={1024}
            height={1024}
            loading="lazy"
            className={`h-16 w-16 shrink-0 rounded-full object-cover ring-2 ring-offset-2 ring-offset-background ${meta.accentRing}`}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-lg font-semibold tracking-tight">{meta.name}</h1>
              <Badge variant="outline" className="text-[10px] font-normal">Csak olvasás</Badge>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">"{meta.tagline}"</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => newThread(undefined, agent)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Új beszélgetés
          </Button>
        </div>
        {/* Agent váltó pillek */}
        <div className="flex flex-wrap items-center gap-2 px-6 pb-3">
          {(Object.keys(AGENT_META) as AgentId[])
            .filter((a) => visibleAgentIds.has(a))
            .map((a) => {
            const m = AGENT_META[a];
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
                className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition ${isActive
                  ? `border-transparent bg-background shadow-sm ${m.accentText} font-medium`
                  : "border-border bg-background/60 text-muted-foreground hover:bg-background"}`}
              >
                <img src={m.portrait} alt="" className="h-5 w-5 rounded-full object-cover" />
                <span>{m.firstName}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid flex-1 min-h-0 gap-4 p-4 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)]">
        {/* Beszélgetés lista */}
        <Card className="flex h-full min-h-0 flex-col overflow-hidden">
          <CardContent className="flex-1 overflow-y-auto p-2">
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
                      <span className="ml-1 shrink-0 text-[10px] text-muted-foreground">· {AGENT_META[t.agent]?.firstName ?? "CRM"}</span>
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
        <Card className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
          {/* Üzenetlista — kizárólag ez görgethető */}
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
            <div className="mx-auto w-full max-w-[1100px] space-y-4 p-6">
              {(() => {
                const visibleMessages = active?.messages.filter((m) => !isLegacyErrorMessage(m)) ?? [];
                if (!active || visibleMessages.length === 0) {
                  return <EmptyChat onPick={ask} disabled={busy} agent={agent} meta={meta} actions={quickActions} />;
                }
                return visibleMessages.map((m) => (
                  <Bubble
                    key={m.id}
                    msg={m}
                    onOpenNav={() => m.nav && navigate({ to: m.nav.to as any, params: m.nav.params as any })}
                    onApproveTool={(cid) => approveToolCall(m.id, cid)}
                    onRejectTool={(cid) => rejectToolCall(m.id, cid)}
                  />
                ));
              })()}
              {busy && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Az AI az aktuális CRM adatok alapján dolgozik…
                </div>
              )}
            </div>
          </div>
          {/* Composer — mindig alul fix */}
          <div className="shrink-0 border-t bg-muted/20 p-3">
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
                placeholder={`Kérdezz ${meta.firstName}-tól… (Enter = küldés, Shift+Enter = új sor)`}
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

function EmptyChat({ onPick, disabled, agent, meta, actions }: {
  onPick: (p: string) => void; disabled: boolean; agent: AgentId;
  meta: AgentMeta;
  actions: QuickAction[];
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 py-12 text-center">
      <img
        src={meta.portrait}
        alt={meta.name}
        width={1024}
        height={1024}
        loading="lazy"
        className={`h-20 w-20 rounded-full object-cover ring-2 ring-offset-2 ring-offset-background ${meta.accentRing}`}
      />
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