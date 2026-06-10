import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Send, Plus, Trash2, MessageSquare, Loader2, CalendarCheck, BellRing, Briefcase, FileText, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/page-header";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { aiComplete } from "@/lib/ai/ai.functions";
import { SYSTEM_PROMPTS } from "@/lib/ai/prompts";
import { loadCrmSnapshot, serializeSnapshot } from "@/lib/ai/crm-context";

export const Route = createFileRoute("/_authenticated/ai-assistant")({
  component: AiAssistantPage,
});

type Msg = { id: string; role: "user" | "assistant"; content: string; at: number };
type Thread = { id: string; title: string; updatedAt: number; messages: Msg[] };

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

const QUICK_ACTIONS: { id: string; label: string; icon: any; prompt: string }[] = [
  { id: "today",     label: "Mai teendők",        icon: CalendarCheck, prompt: "Sorold fel a mai teendőket: ma esedékes feladatok és follow-upok. Csoportosítsd projekt szerint." },
  { id: "overdue",   label: "Lejárt follow-upok", icon: BellRing,      prompt: "Mutasd a lejárt (esedékességi határidőt túllépett, nem lezárt) follow-upokat. Sorold prioritás szerint, jelöld a napok számát." },
  { id: "projects",  label: "Aktív projektek",    icon: Briefcase,     prompt: "Mely projektek aktívak jelenleg? Adj rövid státusz-összefoglalót projektenként (ajánlat-érték, következő follow-up, nyitott feladatok)." },
  { id: "quotes",    label: "Nyitott ajánlatok",  icon: FileText,      prompt: "Listázd a nyitott (még nem megnyert / elveszett) ajánlatokat. Add meg az összértéket, és a 3 legnagyobb ajánlatot emeld ki." },
  { id: "urgent",    label: "Sürgős feladatok",   icon: AlertTriangle, prompt: "Mely feladatok sürgősek (lejárt vagy ma esedékes, magas prioritás)? Készíts cselekvési listát." },
];

function AiAssistantPage() {
  const [threads, setThreads] = useState<Thread[]>(() => loadThreads());
  const [activeId, setActiveId] = useState<string | null>(() => {
    const all = loadThreads();
    return all[0]?.id ?? null;
  });
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

  function newThread(initial?: string): Thread {
    const t: Thread = { id: uid(), title: initial?.slice(0, 60) || "Új beszélgetés", updatedAt: Date.now(), messages: [] };
    setThreads((prev) => [t, ...prev]);
    setActiveId(t.id);
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
    if (!thread) thread = newThread(question);
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
    try {
      const snapshot = await loadCrmSnapshot();
      const context = serializeSnapshot(snapshot);
      const history = (thread.messages ?? []).slice(-10).map((m) => ({ role: m.role, content: m.content }));
      const messages = [
        { role: "system" as const, content: SYSTEM_PROMPTS.crm },
        { role: "system" as const, content: `[CRM KONTEXTUS — ${new Date().toLocaleString("hu-HU")}]\n${context}` },
        ...history,
        { role: "user" as const, content: question },
      ];
      const res = await aiComplete({ data: { messages } });
      const assistantMsg: Msg = { id: uid(), role: "assistant", content: res.text || "(üres válasz)", at: Date.now() };
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

  return (
    <div className="flex flex-col">
      <PageHeader
        title="AI Asszisztens"
        description="Kérdezz a CRM adataidról — cégek, kapcsolatok, leadek, projektek, ajánlatok, follow-upok, feladatok, dokumentumok."
        actions={
          <Button size="sm" variant="outline" onClick={() => newThread()}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Új beszélgetés
          </Button>
        }
      />
      <div className="grid gap-4 p-6 lg:grid-cols-[260px_1fr] min-h-[calc(100vh-12rem)]">
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
        <Card className="flex h-full flex-col">
          <div className="flex-1 min-h-[400px]">
            <ScrollArea className="h-full">
              <div ref={scrollRef} className="space-y-3 p-4">
                {!active || active.messages.length === 0 ? (
                  <EmptyChat onPick={ask} disabled={busy} />
                ) : (
                  active.messages.map((m) => <Bubble key={m.id} msg={m} />)
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
          <div className="border-t p-3">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {QUICK_ACTIONS.map((q) => (
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
                placeholder="Kérdezz a CRM adatokról… (Enter = küldés, Shift+Enter = új sor)"
                rows={2}
                disabled={busy}
                className="resize-none"
              />
              <Button size="icon" onClick={() => ask(input)} disabled={busy || !input.trim()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Bubble({ msg }: { msg: Msg }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Bot className="h-3.5 w-3.5" />
        </div>
      )}
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed ${
          isUser ? "bg-primary text-primary-foreground" : "bg-muted"
        }`}
      >
        {msg.content}
      </div>
    </div>
  );
}

function EmptyChat({ onPick, disabled }: { onPick: (p: string) => void; disabled: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Bot className="h-6 w-6" />
      </div>
      <div>
        <h3 className="text-sm font-semibold">CRM Asszisztens</h3>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          Tegyél fel kérdést, vagy indíts egy gyors művelettel. Az asszisztens a saját jogosultságoddal látja az adatokat.
        </p>
      </div>
      <div className="grid w-full max-w-md grid-cols-1 gap-2 sm:grid-cols-2">
        {QUICK_ACTIONS.map((q) => (
          <Button key={q.id} variant="outline" size="sm" disabled={disabled} onClick={() => onPick(q.prompt)} className="justify-start">
            <q.icon className="mr-2 h-3.5 w-3.5" /> {q.label}
          </Button>
        ))}
      </div>
    </div>
  );
}