// Állandó AI-panel: asztalon jobb oldali, összecsukható; mobilon teljes képernyős.
// A meglévő AI OS-t (runAiAgent) és a meglévő, felhasználónként tárolt
// beszélgetéseket használja. Modellhívás KIZÁRÓLAG a felhasználó küldésére indul.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { History, Loader2, Maximize2, Plus, Send, Trash2, X, MapPin, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useVisibleAgents } from "@/hooks/use-visible-agents";
import { useIsMobile } from "@/hooks/use-mobile";
import { runAiAgent } from "@/lib/ai-os/runtime.functions";
import { contextPrefix, detectRecordContext, type RecordContext, CONTEXT_QUESTIONS, GENERAL_QUESTIONS } from "@/lib/ai-panel-context";
import {
  AGENT_IDS, AGENT_META, Bubble, THREADS_EVENT, isLegacyErrorMessage, loadThreads, saveThreads,
  uiAgentToAiOs, uid, type AgentId, type Msg, type Thread, type ToolApproval,
} from "@/components/ai/chat-shared";

// ─── Nyitás/zárás állapot ────────────────────────────────────────────────
type PanelCtx = { open: boolean; setOpen: (v: boolean) => void; toggle: () => void };
const Ctx = createContext<PanelCtx>({ open: false, setOpen: () => {}, toggle: () => {} });
const OPEN_KEY = "viba.ai.panel.open";

export function AiPanelProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpenState] = useState(false);
  useEffect(() => {
    // Mobilon újratöltéskor nem nyílik ki magától, asztalon megjegyzi.
    if (window.innerWidth >= 768 && localStorage.getItem(OPEN_KEY) === "1") setOpenState(true);
  }, []);
  const setOpen = useCallback((v: boolean) => {
    setOpenState(v);
    try { localStorage.setItem(OPEN_KEY, v ? "1" : "0"); } catch { /* ignore */ }
  }, []);
  const value = useMemo(() => ({ open, setOpen, toggle: () => setOpen(!open) }), [open, setOpen]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useAiPanel = () => useContext(Ctx);

// ─── Rekord-kontextus felirata (RLS alatt, a felhasználó saját jogával) ──
function useContextLabel(ctx: RecordContext | null) {
  return useQuery({
    queryKey: ["ai-panel-ctx-label", ctx?.kind, ctx?.id],
    enabled: !!ctx,
    staleTime: Infinity,
    queryFn: async () => {
      if (!ctx) return null;
      const one = async (q: PromiseLike<{ data: unknown }>) => (await q).data as Record<string, any> | null;
      switch (ctx.kind) {
        case "company": return (await one(supabase.from("companies").select("name").eq("id", ctx.id).maybeSingle()))?.name ?? null;
        case "contact": return (await one(supabase.from("contacts").select("name").eq("id", ctx.id).maybeSingle()))?.name ?? null;
        case "project": return (await one(supabase.from("projects").select("title").eq("id", ctx.id).maybeSingle()))?.title ?? null;
        case "quote": return (await one(supabase.from("quotes").select("title").eq("id", ctx.id).maybeSingle()))?.title ?? null;
        case "lead": {
          const r = await one(supabase.from("leads").select("companies(name)").eq("id", ctx.id).maybeSingle());
          return r?.companies?.name ?? null;
        }
      }
    },
  });
}

// ─── A panel ─────────────────────────────────────────────────────────────
export function AiPanel() {
  const { open, setOpen } = useAiPanel();
  const isMobile = useIsMobile();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Az önálló AI-oldalon nem nyitjuk meg duplán.
  if (!open || pathname.startsWith("/ai-assistant")) return null;
  return isMobile ? (
    <div className="fixed inset-0 z-50 flex flex-col bg-background pb-[env(safe-area-inset-bottom)] animate-in slide-in-from-bottom-4 duration-200">
      <PanelBody onClose={() => setOpen(false)} />
    </div>
  ) : (
    <aside className="sticky top-0 hidden h-screen w-[400px] shrink-0 flex-col border-l bg-card md:flex xl:w-[420px] animate-in slide-in-from-right-4 duration-200" aria-label="AI-asszisztens">
      <PanelBody onClose={() => setOpen(false)} />
    </aside>
  );
}

function PanelBody({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { visibleAgentIds } = useVisibleAgents();
  const agents = AGENT_IDS.filter((a) => visibleAgentIds.has(a));

  const [threads, setThreads] = useState<Thread[]>(() => loadThreads());
  const [activeId, setActiveId] = useState<string | null>(() => loadThreads()[0]?.id ?? null);
  const active = threads.find((t) => t.id === activeId) ?? null;
  const [agent, setAgent] = useState<AgentId>(() => (loadThreads()[0]?.agent as AgentId) ?? "crm");
  const [showHistory, setShowHistory] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [useCtx, setUseCtx] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const SOURCE = "panel";

  const recordCtx = useMemo(() => detectRecordContext(pathname), [pathname]);
  const { data: ctxLabel } = useContextLabel(recordCtx);

  // Ha nem engedélyezett agent maradt aktív, vissza George-ra.
  useEffect(() => { if (!agents.includes(agent)) setAgent("crm"); }, [agents.join(","), agent]); // eslint-disable-line react-hooks/exhaustive-deps
  // Mentés + más fülek/AI-oldal változásainak átvétele.
  const commit = useCallback((fn: (prev: Thread[]) => Thread[]) => {
    setThreads((prev) => { const next = fn(prev); saveThreads(next, SOURCE); return next; });
  }, []);
  useEffect(() => {
    const reload = (e: Event) => { if ((e as CustomEvent).detail !== SOURCE) setThreads(loadThreads()); };
    const onStorage = () => setThreads(loadThreads());
    window.addEventListener(THREADS_EVENT, reload);
    window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener(THREADS_EVENT, reload); window.removeEventListener("storage", onStorage); };
  }, []);
  useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [active?.messages.length, busy]);
  useEffect(() => { inputRef.current?.focus(); }, [activeId, agent]);

  const meta = AGENT_META[agent];
  const ctxOn = useCtx && !!recordCtx;
  const quick = ctxOn ? CONTEXT_QUESTIONS[recordCtx!.kind] : GENERAL_QUESTIONS;

  function startNew(a: AgentId = agent) {
    setAgent(a);
    setActiveId(null);
    setShowHistory(false);
  }

  async function ask(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    if (question.length > 4000) { toast.error("A kérdés túl hosszú", { description: "Rövidítsd 4000 karakter alá." }); return; }
    let thread = active && active.agent === agent ? active : null;
    if (!thread) {
      thread = { id: uid(), title: question.slice(0, 60), agent, updatedAt: Date.now(), messages: [] };
      const t = thread;
      commit((prev) => [t, ...prev]);
      setActiveId(t.id);
    }
    const prefix = ctxOn ? contextPrefix(recordCtx!, ctxLabel ?? null) : "";
    const userMsg: Msg = { id: uid(), role: "user", content: question, at: Date.now(), modelContent: prefix ? `${prefix}\n\n${question}` : undefined, contextLabel: ctxOn ? (ctxLabel ?? recordCtx!.label) : undefined };
    const tid = thread.id;
    commit((prev) => prev.map((t) => t.id === tid ? { ...t, updatedAt: Date.now(), messages: [...t.messages, userMsg] } : t));
    setInput("");
    setBusy(true);
    try {
      const history = [...thread.messages, userMsg].slice(-20).map((m) => ({ role: m.role, content: m.modelContent ?? m.content }));
      const result = await runAiAgent({ data: { agentId: uiAgentToAiOs(thread.agent), history } });
      const approvals: ToolApproval[] | undefined = result.pendingApprovals.length
        ? result.pendingApprovals.map((p) => ({
            tool_call_id: p.tool_call_id, tool_name: p.tool_name, arguments_json: p.arguments_json,
            status: "pending" as const, approval: (p as any).approval, supports_dry_run: (p as any).supports_dry_run,
          }))
        : undefined;
      const msg: Msg = { id: uid(), role: "assistant", at: Date.now(), runId: result.runId, approvals,
        content: result.finalText || (approvals ? "Jóváhagyást igénylő művelet vár rád." : "(üres válasz)") };
      commit((prev) => prev.map((t) => t.id === tid ? { ...t, updatedAt: Date.now(), messages: [...t.messages, msg] } : t));
    } catch (err: any) {
      const m = err?.message ?? "Ismeretlen AI hiba.";
      toast.error("Az AI most nem tudott válaszolni", { description: m });
      commit((prev) => prev.map((t) => t.id === tid ? { ...t, messages: [...t.messages, { id: uid(), role: "assistant", at: Date.now(), content: `⚠️ Hiba: ${m}` }] } : t));
    } finally {
      setBusy(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  function setApproval(msgId: string, callId: string, status: ToolApproval["status"], error?: string) {
    commit((prev) => prev.map((t) => t.id !== activeId ? t : { ...t, messages: t.messages.map((m) => m.id === msgId && m.approvals
      ? { ...m, approvals: m.approvals.map((a) => a.tool_call_id === callId ? { ...a, status, error } : a) } : m) }));
  }

  // Jóváhagyás: csak a felhasználó kifejezett kattintására fut le a művelet.
  async function approve(msgId: string, callId: string) {
    if (!active || busy) return;
    const idx = active.messages.findIndex((m) => m.id === msgId);
    const history = active.messages.slice(0, idx).slice(-20).map((m) => ({ role: m.role, content: m.modelContent ?? m.content }));
    setBusy(true);
    try {
      const result = await runAiAgent({ data: { agentId: uiAgentToAiOs(active.agent), history, approvedToolCallIds: [callId] } });
      setApproval(msgId, callId, "approved");
      const tid = active.id;
      commit((prev) => prev.map((t) => t.id === tid ? { ...t, updatedAt: Date.now(), messages: [...t.messages, { id: uid(), role: "assistant", at: Date.now(), content: result.finalText || "Művelet végrehajtva.", runId: result.runId }] } : t));
    } catch (e: any) {
      setApproval(msgId, callId, "error", e?.message ?? String(e));
      toast.error("Végrehajtás sikertelen", { description: e?.message });
    } finally { setBusy(false); }
  }

  const visible = active?.messages.filter((m) => !isLegacyErrorMessage(m)) ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Fejléc */}
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <img src={meta.portrait} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover ring-2 ring-primary/30" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-sm font-semibold">{meta.firstName}</div>
          <div className="truncate text-[11px] text-muted-foreground">{meta.role}</div>
        </div>
        <Button size="icon" variant="ghost" className="h-8 w-8" title="Korábbi beszélgetések" onClick={() => setShowHistory((v) => !v)}>
          <History className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" title="Új beszélgetés" onClick={() => startNew()}>
          <Plus className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" className="hidden h-8 w-8 md:inline-flex" title="Megnyitás teljes oldalon"
          onClick={() => navigate({ to: "/ai-assistant", search: { agent } as never })}>
          <Maximize2 className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" title="Bezárás" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Asszisztensváltó */}
      <div className="flex gap-1.5 overflow-x-auto border-b px-3 py-2">
        {agents.map((a) => {
          const m = AGENT_META[a];
          const on = a === agent;
          return (
            <button key={a} type="button" onClick={() => { if (a !== agent) startNew(a); }}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${on ? "border-primary bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted"}`}>
              <img src={m.portrait} alt="" className="h-5 w-5 rounded-full object-cover" />
              {m.firstName}
            </button>
          );
        })}
      </div>

      {showHistory ? (
        <div className="flex-1 overflow-y-auto p-2">
          <button type="button" onClick={() => setShowHistory(false)} className="mb-2 flex items-center gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Vissza
          </button>
          {threads.length === 0 && <p className="px-2 text-xs text-muted-foreground">Még nincs korábbi beszélgetés.</p>}
          <ul className="space-y-1">
            {threads.map((t) => (
              <li key={t.id} className={`group flex items-center gap-2 rounded-lg px-2 py-2 text-sm ${t.id === activeId ? "bg-accent" : "hover:bg-muted"}`}>
                <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  onClick={() => { setActiveId(t.id); setAgent(t.agent); setShowHistory(false); }}>
                  <img src={AGENT_META[t.agent]?.portrait} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
                  <span className="truncate">{t.title}</span>
                </button>
                <button type="button" title="Törlés" className="opacity-60 hover:opacity-100"
                  onClick={() => { commit((prev) => prev.filter((x) => x.id !== t.id)); if (t.id === activeId) setActiveId(null); }}>
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div ref={scrollRef} className="flex-1 min-h-0 space-y-4 overflow-y-auto px-4 py-4">
          {visible.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <img src={meta.portrait} alt="" className="h-16 w-16 rounded-full object-cover ring-2 ring-primary/30 ring-offset-2 ring-offset-background" />
              <div>
                <div className="font-display text-sm font-semibold">Szia, {meta.firstName} vagyok.</div>
                <p className="mx-auto mt-1 max-w-[280px] text-xs text-muted-foreground">
                  {meta.tagline}. Csak a számodra elérhető CRM-adatokból dolgozom; ha valami nincs a rendszerben, jelzem.
                </p>
              </div>
            </div>
          ) : (
            visible.map((m) => (
              <div key={m.id}>
                {m.role === "user" && m.contextLabel && (
                  <div className="mb-1 flex justify-end text-[10px] text-muted-foreground"><MapPin className="mr-1 h-3 w-3" />{m.contextLabel}</div>
                )}
                <Bubble msg={m}
                  onOpenNav={() => m.nav && navigate({ to: m.nav.to as any, params: m.nav.params as any })}
                  onApproveTool={(cid) => approve(m.id, cid)}
                  onRejectTool={(cid) => setApproval(m.id, cid, "rejected")} />
              </div>
            ))
          )}
          {busy && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {meta.firstName} a CRM-adatokat nézi…
            </div>
          )}
        </div>
      )}

      {/* Kontextus + gyors kérdések + beviteli mező */}
      <div className="shrink-0 space-y-2 border-t bg-muted/30 p-3">
        {recordCtx && (
          <label className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5 text-xs">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate">
              <span className="text-muted-foreground">{recordCtx.label}: </span>
              <span className="font-medium">{ctxLabel ?? "betöltés…"}</span>
            </span>
            <Switch checked={useCtx} onCheckedChange={setUseCtx} aria-label="Kontextus használata" />
          </label>
        )}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {quick.map((q) => (
            <Button key={q} size="sm" variant="outline" className="h-7 shrink-0 rounded-full px-3 text-xs" disabled={busy} onClick={() => ask(q)}>
              {q}
            </Button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <Textarea ref={inputRef} value={input} rows={2} disabled={busy}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input); } }}
            placeholder={`Kérdezd ${meta.firstName}-t…`}
            className="min-h-[44px] resize-none bg-background text-sm" />
          <Button size="icon" variant="glow" onClick={() => ask(input)} disabled={busy || !input.trim()} aria-label="Küldés">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
