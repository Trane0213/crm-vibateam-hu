import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Send, Plus, Trash2, MessageSquare, Loader2, CalendarCheck, BellRing, Briefcase, FileText, AlertTriangle, Search, TrendingUp, Hammer, Phone, AlertOctagon, ClipboardList, CheckCircle2, XCircle, ExternalLink, BarChart3, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import georgePortrait from "@/assets/agent-george.jpg";
import timothyPortrait from "@/assets/agent-timothy.jpg";
import bossPortrait from "@/assets/agent-boss.jpg";
import michaelPortrait from "@/assets/agent-michael.jpg";
import { AgentResponse } from "@/components/ai/agent-response";
import { runAiAgent } from "@/lib/ai-os/runtime.functions";
import { AgentGate } from "@/components/ai/agent-gate";
import { useVisibleAgents } from "@/hooks/use-visible-agents";

/** UI agent azonosítók — a `?agent=` paraméter és a thread agent mezője ezt használja. */
type AgentId = "crm" | "sales" | "pm" | "ads";

export const Route = createFileRoute("/_authenticated/ai-assistant")({
  component: AiAssistantRoute,
});

function AiAssistantRoute() {
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const urlAgent = new URLSearchParams(searchStr ?? "").get("agent");
  // Csak akkor érvényesítünk gate-et, ha az URL kifejezetten megad agentet.
  // Ha nincs ?agent=, akkor a default crm (George) tölt be, ami mindenki számára látható.
  const agentToGate =
    urlAgent === "crm" || urlAgent === "sales" || urlAgent === "pm" || urlAgent === "ads" ? urlAgent : null;
  return (
    <AgentGate agentId={agentToGate}>
      <AiAssistantPage />
    </AgentGate>
  );
}

type NavCard = { to: string; params?: Record<string, string>; label: string };
type ApprovalLevel = "safe" | "confirm" | "dangerous";
type ToolApproval = {
  tool_call_id: string;
  tool_name: string;
  arguments_json: string;
  status: "pending" | "approved" | "rejected" | "error";
  error?: string;
  approval?: ApprovalLevel;
  supports_dry_run?: boolean;
};
type Msg = {
  id: string; role: "user" | "assistant"; content: string; at: number;
  nav?: NavCard; approvals?: ToolApproval[];
  runId?: string;
};
type Thread = { id: string; title: string; agent: AgentId; updatedAt: number; messages: Msg[] };

const STORAGE_KEY = "viba.ai.threads.v1";
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

/**
 * Régi (törölt) AI rétegből származó hibaüzeneteket kiszűrjük a megjelenítéskor,
 * hogy a felhasználó ne lássa pl. a Lovable/Gemini 402-es vagy az agent_runs
 * táblahiányos legacy üzeneteket egy frissen újraindított AI OS futás után.
 */
const LEGACY_ERROR_PATTERNS = [
  /lovable\/google\/gemini/i,
  /gemini-3-flash-preview/i,
  /agent_runs/i,
  /supabaseUrl is required/i,
  /402/,
];
function isLegacyErrorMessage(m: { role: string; content: string }): boolean {
  if (m.role !== "assistant") return false;
  if (!m.content?.startsWith("⚠️")) return false;
  return LEGACY_ERROR_PATTERNS.some((re) => re.test(m.content));
}

/** UI agent id → AI OS agent id. George az orchestrator a CRM oldalra is. */
function uiAgentToAiOs(id: AgentId): string {
  if (id === "sales") return "timothy";
  if (id === "pm") return "boss";
  if (id === "ads") return "michael";
  return "george";
}

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
  ads: [
    { id: "intro",         label: "Mutatkozz be",        icon: Target,        prompt: "Mutatkozz be röviden: ki vagy, mi az elsődleges célod, és mikor tudsz éles Google Ads adattal dolgozni." },
    { id: "scope",         label: "Mit tudsz csinálni?", icon: BarChart3,     prompt: "Sorold fel, milyen jellegű elemzéseket, javaslatokat és beavatkozásokat fogsz tudni támogatni, ha aktiválják a Google Ads toolokat. Ne találj ki adatot." },
  ],
};

type AgentMeta = {
  firstName: string;
  role: string;
  name: string;
  tagline: string;
  icon: any;
  portrait: string;
  accent: string;       // bg tint for header
  accentRing: string;   // ring color for active tab
  accentText: string;   // text color
};

const AGENT_META: Record<AgentId, AgentMeta> = {
  crm: {
    firstName: "George",
    role: "CRM Navigátor",
    name: "George – CRM Navigátor",
    tagline: "CRM adatok és ügyfélinformációk specialistája",
    icon: Search,
    portrait: georgePortrait,
    accent: "bg-blue-50 dark:bg-blue-950/30",
    accentRing: "ring-blue-500/40",
    accentText: "text-blue-600 dark:text-blue-300",
  },
  sales: {
    firstName: "Timothy",
    role: "Értékesítési Segítő",
    name: "Timothy – Értékesítési Segítő",
    tagline: "Ajánlatok, utókövetések és értékesítési lehetőségek",
    icon: TrendingUp,
    portrait: timothyPortrait,
    accent: "bg-emerald-50 dark:bg-emerald-950/30",
    accentRing: "ring-emerald-500/40",
    accentText: "text-emerald-600 dark:text-emerald-300",
  },
  pm: {
    firstName: "Boss",
    role: "Projektfelügyelő",
    name: "Boss – Projektfelügyelő",
    tagline: "Projektek, határidők és feladatok felügyelete",
    icon: Hammer,
    portrait: bossPortrait,
    accent: "bg-orange-50 dark:bg-orange-950/30",
    accentRing: "ring-orange-500/40",
    accentText: "text-orange-600 dark:text-orange-300",
  },
  ads: {
    firstName: "Michael",
    role: "Google Ads Specialista",
    name: "Michael – Google Ads Specialista",
    tagline: "Google Ads elemzés a VIBA-TEAM üzleti céljainak támogatására",
    icon: BarChart3,
    portrait: michaelPortrait,
    accent: "bg-teal-50 dark:bg-teal-950/30",
    accentRing: "ring-teal-500/40",
    accentText: "text-teal-600 dark:text-teal-300",
  },
};

function AiAssistantPage() {
  const navigate = useNavigate();
  const { visibleAgentIds } = useVisibleAgents();
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const urlAgent = (() => {
    const v = new URLSearchParams(searchStr ?? "").get("agent");
    return v === "sales" || v === "pm" || v === "crm" || v === "ads" ? (v as AgentId) : null;
  })();

  const [threads, setThreads] = useState<Thread[]>(() => loadThreads());
  const [activeId, setActiveId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const sp = new URLSearchParams(window.location.search);
    const urlA = sp.get("agent");
    const all = loadThreads();
    // Ha az URL agentet kér, csak az adott agenthez tartozó thread induljon aktívként.
    if (urlA === "crm" || urlA === "sales" || urlA === "pm" || urlA === "ads") {
      return all.find((t) => t.agent === urlA)?.id ?? null;
    }
    return all[0]?.id ?? null;
  });
  const [agent, setAgent] = useState<AgentId>(() => {
    const v = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("agent") : null;
    if (v === "sales" || v === "pm" || v === "crm" || v === "ads") return v as AgentId;
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
        .map((m) => ({ role: m.role, content: m.content }));
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
        .map((m) => ({ role: m.role, content: m.content }));
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

function Bubble({ msg, onOpenNav, onApproveTool, onRejectTool }: {
  msg: Msg;
  onOpenNav?: () => void;
  onApproveTool?: (toolCallId: string) => void;
  onRejectTool?: (toolCallId: string) => void;
}) {
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
          {msg.approvals?.map((a) => (
            <ToolApprovalCardView
              key={a.tool_call_id}
              approval={a}
              onApprove={() => onApproveTool?.(a.tool_call_id)}
              onReject={() => onRejectTool?.(a.tool_call_id)}
            />
          ))}
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


function ToolApprovalCardView({ approval, onApprove, onReject }: {
  approval: ToolApproval;
  onApprove?: () => void;
  onReject?: () => void;
}) {
  let argsPretty = approval.arguments_json;
  try { argsPretty = JSON.stringify(JSON.parse(approval.arguments_json), null, 2); } catch { /* keep raw */ }
  const tone = approval.status === "approved" ? "border-[color:var(--status-success)]/40 bg-[color:var(--status-success)]/5"
    : approval.status === "rejected" ? "border-muted bg-muted/30"
    : approval.status === "error" ? "border-destructive/40 bg-destructive/5"
    : "border-primary/30 bg-primary/5";
  return (
    <div className={`mt-2 rounded-md border p-3 text-xs ${tone}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider">Jóváhagyás: {approval.tool_name}</span>
        {approval.status === "approved" && <Badge variant="outline" className="text-[10px]"><CheckCircle2 className="mr-1 h-3 w-3" />Végrehajtva</Badge>}
        {approval.status === "rejected" && <Badge variant="outline" className="text-[10px]">Elvetve</Badge>}
        {approval.status === "error" && <Badge variant="destructive" className="text-[10px]">Hiba</Badge>}
        {approval.status === "pending" && <Badge variant="outline" className="text-[10px]">Jóváhagyásra vár</Badge>}
      </div>
      <pre className="max-h-48 overflow-auto rounded bg-background/60 p-2 text-[11px] leading-snug">{argsPretty}</pre>
      {approval.error && <p className="mt-2 text-destructive">{approval.error}</p>}
      {approval.status === "pending" && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" className="h-7 px-2 text-[11px]" onClick={onApprove}>
            <CheckCircle2 className="mr-1 h-3 w-3" /> Jóváhagy és végrehajt
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