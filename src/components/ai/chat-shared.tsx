// Közös AI-chat elemek: az AI-oldal és az állandó AI-panel ugyanezt használja.
import { useState } from "react";
import { Bot, MessageSquare, CalendarCheck, BellRing, Briefcase, FileText, AlertTriangle, Search, TrendingUp, Hammer, Phone, AlertOctagon, ClipboardList, CheckCircle2, XCircle, ExternalLink, BarChart3, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import georgePortrait from "@/assets/agent-george.jpg";
import timothyPortrait from "@/assets/agent-timothy.jpg";
import bossPortrait from "@/assets/agent-boss.jpg";
import michaelPortrait from "@/assets/agent-michael.jpg";
import scarletPortrait from "@/assets/agent-scarlet.jpg";
import { AgentResponse } from "@/components/ai/agent-response";
import { ACTION_LABELS, type ActionStatus } from "@/lib/ai-os/approval";
import { prepActionSchema } from '@/lib/ai-os/prep-action';
import { nextStepActionSchema,nextStepBudapestTime } from '@/lib/ai-os/next-step-action';
import { NEXT_STEP_LABEL,type NextStepType } from '@/lib/sales/constants';
import {followupActionSchema} from '@/lib/ai-os/followup-action';
import {contactActionSchema} from '@/lib/ai-os/contact-action';
import {assignmentActionSchema} from '@/lib/ai-os/assignment-action';
import {pipelineStatusSchema} from '@/lib/ai-os/pipeline-status-action';
import {LEAD_STATUS_LABEL} from '@/lib/sales/constants';
import {emailSendAction} from '@/lib/ai-os/email-send-action';
import {EmailSendApproval} from './email-send-approval';
import { MessageAttachments } from "@/components/ai/chat-attachments";
import type { ChatAttachment } from "@/lib/chat-uploads/chat-attachments";
import { RUN_STATE_LABEL, runState, type RunTransparency } from '@/lib/ai-os/transparency';

/** UI agent azonosítók — a `?agent=` paraméter és a thread agent mezője ezt használja. */
export type AgentId = "crm" | "sales" | "pm" | "marketing" | "ads";
export const AGENT_IDS: AgentId[] = ["crm", "marketing", "sales", "pm", "ads"];
export function isAgentId(v: unknown): v is AgentId { return typeof v === "string" && (AGENT_IDS as string[]).includes(v); }
export const uid = () => crypto.randomUUID();
export type NavCard = { to: string; params?: Record<string, string>; label: string };
export type ApprovalLevel = "safe" | "confirm" | "dangerous";
export type ToolApproval = {
  tool_call_id: string;
  tool_name: string;
  arguments_json: string;
  action_id?: string; expires_at?: string;
  status: ActionStatus | "approved" | "error";
  verified?: boolean; submitting?: boolean; transportError?: string; no_op?: boolean;
  error?: string;
  approval?: ApprovalLevel;
  supports_dry_run?: boolean;
};
export type Msg = {
  id: string; role: "user" | "assistant"; content: string; at: number;
  nav?: NavCard; approvals?: ToolApproval[];
  runId?: string;
  /** A modellnek küldött tartalom (pl. rejtett rekord-kontextussal); megjelenítés a content-ből. */
  modelContent?: string;
  contextLabel?: string;
  /** Melyik agent válaszolt (asszisztens üzenetnél). */
  agent?: AgentId;
  /** Mit nézett meg ténylegesen a futás, mi hiányzott, kell-e döntés. */
  transparency?: RunTransparency;
  /** Hibaüzenet-e (érthető hibaszöveg, nem történt módosítás). */
  failed?: boolean;
  /** Chatbe feltöltött, szerepköri mappába mentett fájlok (csak azonosító + kulcs; megnyitás jogosultság-ellenőrzéssel). */
  attachments?: ChatAttachment[];
};
export type Thread = { id: string; title: string; agent: AgentId; updatedAt: number; messages: Msg[] };

const LEGACY_STORAGE_KEY = "viba.ai.threads.v1";
/** A bejelentkezett felhasználó azonosítója a Supabase munkamenetből (szinkron). */
function currentUserId(): string | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.startsWith("sb-") && k.endsWith("-auth-token")) {
        const v = JSON.parse(localStorage.getItem(k) ?? "null");
        return v?.user?.id ?? null;
      }
    }
  } catch { /* ignore */ }
  return null;
}
/** Felhasználónként külön tárolt beszélgetések — más munkatárs ugyanazon a gépen sem látja. */
export function storageKey(): string {
  const u = currentUserId();
  return u ? `${LEGACY_STORAGE_KEY}:${u}` : `${LEGACY_STORAGE_KEY}:anon`;
}
export const THREADS_EVENT = "viba-ai-threads-changed";

/**
 * Régi (törölt) AI rétegből származó hibaüzeneteket kiszűrjük a megjelenítéskor,
 * hogy a felhasználó ne lássa pl. a Lovable/Gemini 402-es vagy az agent_runs
 * táblahiányos legacy üzeneteket egy frissen újraindított AI OS futás után.
 */
export const LEGACY_ERROR_PATTERNS = [
  /lovable\/google\/gemini/i,
  /gemini-3-flash-preview/i,
  /agent_runs/i,
  /supabaseUrl is required/i,
  /402/,
];
export function isLegacyErrorMessage(m: { role: string; content: string }): boolean {
  if (m.role !== "assistant") return false;
  if (!m.content?.startsWith("⚠️")) return false;
  return LEGACY_ERROR_PATTERNS.some((re) => re.test(m.content));
}

/** UI agent id → AI OS agent id. George az orchestrator a CRM oldalra is. */
export function uiAgentToAiOs(id: AgentId): string {
  if (id === "marketing") return "scarlet";
  if (id === "sales") return "timothy";
  if (id === "pm") return "boss";
  if (id === "ads") return "michael";
  return "george";
}

export function loadThreads(): Thread[] {
  if (typeof window === "undefined") return [];
  try {
    const key = storageKey();
    let raw = localStorage.getItem(key);
    if (!raw) {
      // Egyszeri átköltöztetés a régi, felhasználóhoz nem kötött tárolóból.
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy) { localStorage.setItem(key, legacy); localStorage.removeItem(LEGACY_STORAGE_KEY); raw = legacy; }
    }
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Thread[];
    return parsed.map(t => ({ ...t, messages: t.messages.map(m => ({ ...m, approvals: m.approvals?.map(a => ({ ...a, verified: false, submitting: false })) })) }));
  } catch {
    return [];
  }
}
export function saveThreads(threads: Thread[], source?: string) {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(threads.slice(0, 50)));
    window.dispatchEvent(new CustomEvent(THREADS_EVENT, { detail: source }));
  } catch { /* ignore */ }
}

export type QuickAction = { id: string; label: string; icon: any; prompt: string };

export const QUICK_ACTIONS: Record<AgentId, QuickAction[]> = {
  crm: [
    { id: "search-company", label: "Cég keresés",        icon: Search,        prompt: "Listázd a CRM-ben lévő cégeket, és minden céghez mondd meg: hány kapcsolattartó, hány projekt, hány ajánlat tartozik hozzá." },
    { id: "project-overview", label: "Projekt áttekintés", icon: Briefcase,     prompt: "Adj projekt-áttekintést: minden projektnél a cég neve, a kapcsolattartó, az ajánlatok száma és a legutóbbi tevékenység." },
    { id: "docs",          label: "Dokumentumok",        icon: ClipboardList, prompt: "Mely projektekhez tartozik dokumentum, és melyikhez nem? Adj listát mindkét csoportról." },
    { id: "contacts",      label: "Kapcsolattartók",     icon: MessageSquare, prompt: "Listázd a kapcsolattartókat cég szerint csoportosítva. Emeld ki, ahol nincs telefonszám vagy e-mail." },
  ],
  sales: [
    { id: "call-today", label: "Kit hívjak ma?", icon: Phone, prompt: "Kit hívjak ma? Használd a crm_sales_daily_priorities eszközt, a saját mai prioritásaimból adj legfeljebb öt ügyet indoklással és forrással. Csak olvass." },
    { id: "fu-suggest", label: "Utókövetés javaslatok", icon: BellRing, prompt: "Mely ajánlatokra kell most utókövetés? Olvasd a crm_sales_daily_priorities és crm_list_quotes adatokat; crm_quote_context alapján ellenőrizd a küldést és a meglévő utánkövetést. Csak javasolj, ne hozz létre semmit; jelezd a részlegességet." },
    { id: "open-quotes", label: "Nyitott ajánlatok", icon: FileText, prompt: "Listázd a saját nyitott ajánlatokat crm_list_quotes alapján, nettó értékkel, draft-jelöléssel és pontos /quotes/<id> linkkel. Lapozz vagy jelezd a részlegességet; alternatívákat/verziókat ne adj össze. Csak olvass." },
    { id: "overdue-fu", label: "Lejárt utókövetések", icon: AlertTriangle, prompt: "Mutasd a saját lejárt utánkövetéseimet: crm_list_followups assigned_to=me, due_before teljes ISO időpont a jelenlegi idővel. Lapozz, mutasd a határidőt és forrásazonosítót. A mai közös prioritáshoz crm_sales_daily_priorities. Csak olvass." },
    { id: "marketing-leads", label: "Új marketing érdeklődők", icon: TrendingUp, prompt: "Listázd a saját új érdeklődőket crm_list_leads status=new assigned_to=me alapján. A tényleges source mezőt mutasd, ne találj ki marketingforrást. Cég és kontakt azonosítóval crm_get_company és crm_list_company_contacts; csak olvass, lapozz vagy jelezd a részlegességet." },
  ],
  pm: [
    { id: "daily-pm",      label: "Mai projektáttekintés", icon: Hammer,        prompt: "Készíts mai áttekintést a saját aktív projektjeimről: crm_list_projects project_manager_user_id=me, majd projektenként crm_list_tasks (nyitott, lejárt, ma esedékes, status=blocked) és crm_list_followups. Projektenként egy mondat és a következő teendő felelőssel. Dokumentumot, fotót és jelenlétet nem látsz – ezt mondd ki, ne következtess rájuk. Csak olvass; lapozz vagy jelezd a részlegességet." },
    { id: "today-tasks",   label: "Mai feladatok",       icon: CalendarCheck, prompt: "Sorold fel a saját aktív projektjeim ma esedékes és lejárt nyitott feladatait projekt szerint csoportosítva (crm_list_projects project_manager_user_id=me, majd crm_list_tasks project_id szerint), felelőssel és határidővel, Budapest idő szerint. Csak olvass; részleges listát jelezz." },
    { id: "blocked",       label: "Akadályozott feladatok", icon: AlertTriangle, prompt: "Mely saját aktív projektjeimben van „Akadályozott” (status=blocked) feladat? crm_list_projects project_manager_user_id=me, majd crm_list_tasks project_id és status=blocked. Feladat, projekt, felelős, határidő; javasolj tisztázó kérdést, de ne módosíts semmit." },
    { id: "deadlines",     label: "Közelgő határidők",   icon: BellRing,      prompt: "Mely saját aktív projektjeimnek van 7 napon belüli projekt- vagy feladathatáridője? crm_list_projects project_manager_user_id=me és crm_list_tasks alapján, projekt + dátum + felelős. Csak olvass." },
    { id: "risks",         label: "Kockázatos projektek", icon: AlertOctagon,  prompt: "Mely saját aktív projektjeim kockázatosak lejárt vagy akadályozott feladat, lejárt projekthatáridő vagy lejárt utánkövetés miatt? Csak crm_list_projects, crm_list_tasks és crm_list_followups adatából, indoklással és forrásazonosítóval. Dokumentumot és jelenlétet nem látsz; ezt jelezd. Ne módosíts semmit." },
  ],
  marketing: [
    { id: "mkt-today", label: "Mai marketingteendők", icon: CalendarCheck, prompt: "Mi a mai legfontosabb marketingteendőm? Használd a crm_marketing_daily_priorities forrást (ugyanaz, mint a Marketing Ma), Budapest nap szerint, cégnévvel és forráslinkkel. Csak olvass; részleges listát jelezz." },
    { id: "mkt-replies", label: "Beérkezett válaszok", icon: AlertTriangle, prompt: "Mely kampánycégeknél érkezett válasz a saját megkeresésemre? A crm_marketing_daily_priorities reply_pending listájából indulj, és csak a jogosult pontos levélszál elolvasása után foglald össze, mit kér az ügyfél. Ne módosíts semmit." },
    { id: "mkt-handoff", label: "Átadásra kész cégek", icon: Briefcase, prompt: "Mely minősített cégek készek Sales-átadásra? A crm_marketing_daily_priorities qualified listájából indulj, cégenként ellenőrizd a kapcsolattartót, a meglévő nyitott ügyet és az összefoglalót. Csak javasolj; átadást ne indíts." },
    { id: "channels", label: "Csatornák", icon: BarChart3, prompt: "Melyik forrásból jön a legtöbb lead az elmúlt 30 napban? Csak CRM-adatból dolgozz." },
  ],
  ads: [
    { id: "intro",         label: "Mutatkozz be",        icon: Target,        prompt: "Mutatkozz be röviden: ki vagy, mi az elsődleges célod, és mikor tudsz éles Google Ads adattal dolgozni." },
    { id: "scope",         label: "Mit tudsz csinálni?", icon: BarChart3,     prompt: "Sorold fel, milyen jellegű elemzéseket, javaslatokat és beavatkozásokat fogsz tudni támogatni, ha aktiválják a Google Ads toolokat. Ne találj ki adatot." },
  ],
};

export type AgentMeta = {
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

export const AGENT_META: Record<AgentId, AgentMeta> = {
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
  marketing: {
    firstName: "Scarlet",
    role: "Marketing Stratéga",
    name: "Scarlet – Marketing Stratéga",
    tagline: "Leadek, kampányok és marketingcsatornák",
    icon: TrendingUp,
    portrait: scarletPortrait,
    accent: "bg-pink-50 dark:bg-pink-950/30",
    accentRing: "ring-pink-500/40",
    accentText: "text-pink-600 dark:text-pink-300",
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


export function Bubble({ msg, onOpenNav, onApproveTool, onRejectTool, onCheckTool }: {
  msg: Msg;
  onOpenNav?: () => void;
  onApproveTool?: (toolCallId: string, confirmation?: string) => void;
  onCheckTool?: (toolCallId: string) => void;
  onRejectTool?: (toolCallId: string) => void;
}) {
  const isUser = msg.role === "user";
  if (!isUser) {
    const meta = msg.agent ? AGENT_META[msg.agent] : null;
    return (
      <div className="flex gap-3">
        {meta ? <img src={meta.portrait} alt="" className="mt-0.5 h-7 w-7 shrink-0 rounded-full object-cover" />
          : <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Bot className="h-4 w-4" /></div>}
        <div className="min-w-0 flex-1">
          {meta && <div className="mb-0.5 text-[11px] font-medium text-muted-foreground">{meta.firstName} · {meta.role}{msg.contextLabel ? ` · vizsgált ügy: ${msg.contextLabel}` : ""}</div>}
          {msg.failed ? <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /><span>{msg.content.replace(/^⚠️ Hiba: /, "")}</span></div>
            : <AgentResponse text={msg.content} />}
          {msg.transparency && <RunStatusStrip t={msg.transparency} />}
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
              onApprove={(confirmation) => onApproveTool?.(a.tool_call_id, confirmation)}
              onCheck={() => onCheckTool?.(a.tool_call_id)}
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
        {msg.attachments?.length ? <MessageAttachments items={msg.attachments} /> : null}
      </div>
    </div>
  );
}


const AGENT_FIRST_NAME: Record<string, string> = { george: "George", scarlet: "Scarlet", timothy: "Timothy", boss: "Boss", michael: "Michael" };

/** Rövid állapotsor egy AI-válasz alatt: kész/hiányos/döntésre vár, mit nézett meg ténylegesen, mi hiányzott. */
export function RunStatusStrip({ t }: { t: RunTransparency }) {
  const state = runState(t);
  const tone = state === "decision" ? "border-status-warning/50 bg-status-warning/10" : state === "partial" ? "border-status-warning/40 bg-muted/40" : "border-border bg-muted/30";
  const Icon = state === "decision" ? ClipboardList : state === "partial" ? AlertTriangle : CheckCircle2;
  return (
    <div className={`mt-2 space-y-1 rounded-md border px-3 py-2 text-[11px] leading-relaxed ${tone}`} aria-label="A válasz állapota">
      <div className="flex items-center gap-1.5 font-medium"><Icon className="h-3.5 w-3.5" />{RUN_STATE_LABEL[state]}</div>
      {t.checked.length > 0 && <div><span className="text-muted-foreground">Megnézte: </span>{t.checked.join(", ")}{t.verifiedSources > 0 ? ` (${t.verifiedSources} rekord)` : ""}</div>}
      {t.consulted.length > 0 && <div><span className="text-muted-foreground">Megkérdezett szakértő: </span>{t.consulted.map((a) => AGENT_FIRST_NAME[a] ?? a).join(", ")}</div>}
      {t.failed.length > 0 && <div><span className="text-muted-foreground">Nem sikerült beolvasni: </span>{t.failed.join(", ")} — a válasz ezek nélkül készült.</div>}
      {t.denied.length > 0 && <div><span className="text-muted-foreground">Nincs hozzáférés: </span>{t.denied.join(", ")} — ezt az adatot az asszisztens nem láthatja nálad.</div>}
      {state === "general" && <div className="text-muted-foreground">Általános válasz: konkrét ügyhöz nyiss meg egy rekordot, vagy nevezd meg az ügyfelet.</div>}
      {state === "decision" && <div className="text-muted-foreground">Semmi nem módosult. A lenti kártyán dönthetsz: jóváhagyás nélkül nem történik változás.</div>}
    </div>
  );
}

export function ToolApprovalCardView({ approval, onApprove, onReject, onCheck }: {
  approval: ToolApproval;
  onApprove?: (confirmation?: string) => void;
  onCheck?: () => void;
  onReject?: () => void;
}) {
  let argsPretty = approval.arguments_json;
  const prep = (()=>{try{return approval.tool_name==='sales_record_prep_activity'?prepActionSchema.safeParse(JSON.parse(approval.arguments_json)):null;}catch{return null;}})();
  const next = (()=>{try{return approval.tool_name==='sales_update_next_step'?nextStepActionSchema.safeParse(JSON.parse(approval.arguments_json)):null;}catch{return null;}})();
  const followup=(()=>{try{return approval.tool_name==='sales_create_followup'?followupActionSchema.safeParse(JSON.parse(approval.arguments_json)):null;}catch{return null;}})();
  const contact=(()=>{try{return approval.tool_name==='sales_set_lead_contact'?contactActionSchema.safeParse(JSON.parse(approval.arguments_json)):null;}catch{return null;}})();
  const assignment=(()=>{try{return approval.tool_name==='sales_reassign_lead'?assignmentActionSchema.safeParse(JSON.parse(approval.arguments_json)):null;}catch{return null;}})();
  const pipelineStatus=(()=>{try{return approval.tool_name==='sales_change_pipeline_status'?pipelineStatusSchema.safeParse(JSON.parse(approval.arguments_json)):null;}catch{return null;}})();
  const emailSend=(()=>{try{return approval.tool_name==='sales_send_email'?emailSendAction.safeParse(JSON.parse(approval.arguments_json)):null;}catch{return null;}})();
  try { argsPretty = JSON.stringify(JSON.parse(approval.arguments_json), null, 2); } catch { /* keep raw */ }
  const level: ApprovalLevel = approval.approval ?? "confirm";
  const [dangerText, setDangerText] = useState("");
  const dangerOk = dangerText.trim().toUpperCase() === "MEGERŐSÍTEM";
  const tone = approval.status === "succeeded" && approval.verified ? "border-[color:var(--status-success)]/40 bg-[color:var(--status-success)]/5"
    : approval.status === "rejected" ? "border-muted bg-muted/30"
    : approval.status === "error" ? "border-destructive/40 bg-destructive/5"
    : level === "dangerous" ? "border-destructive/50 bg-destructive/5"
    : "border-primary/30 bg-primary/5";
  const levelBadge = level === "dangerous"
    ? <Badge variant="destructive" className="text-[10px]">DANGEROUS</Badge>
    : level === "confirm"
      ? <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-600 dark:text-amber-400">CONFIRM</Badge>
      : <Badge variant="outline" className="text-[10px]">SAFE</Badge>;
  return (
    <div className={`mt-2 rounded-md border p-3 text-xs ${tone}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider">Jóváhagyás: {approval.tool_name}</span>
          {levelBadge}
          {approval.supports_dry_run && <Badge variant="outline" className="text-[10px]">dry_run támogatott</Badge>}
        </div>
        <Badge variant="outline" className="text-[10px]">
          {!approval.action_id ? "Korábbi művelet – nem végrehajtható" : approval.submitting ? "Döntés mentése…" : !approval.verified ? "Állapot ellenőrzése szükséges" : approval.no_op ? "Már a kívánt állapotban" : ACTION_LABELS[approval.status as ActionStatus] ?? "Nem igazolt"}
        </Badge>
      </div>
      {level === "dangerous" && approval.status === "pending" && (
        <div className="mb-2 rounded border border-destructive/40 bg-destructive/10 p-2">
          <p className="mb-1 flex items-center gap-1 font-medium text-destructive">
            <AlertTriangle className="h-3 w-3" /> {emailSend?.success?'Levélküldés – nem vonható vissza.':'Nagy kockázatú művelet (törlés / konverzió / bid strategy).'}
          </p>
          <p className="text-muted-foreground">A végrehajtáshoz gépeld be: <code className="rounded bg-background px-1">MEGERŐSÍTEM</code></p>
        </div>
      )}
      {emailSend?.success?<EmailSendApproval action={emailSend.data}/>:prep?.success?<div className="space-y-2 rounded border bg-background/60 p-2">
        <p><strong>Ügy:</strong> {prep.data.context.lead_name}</p>
        <p><strong>Cég:</strong> {prep.data.context.company_name||'Nincs megadva'} · <strong>Kapcsolattartó:</strong> {prep.data.context.contact_name||'Nincs megadva'}</p>
        <p><strong>Felelős:</strong> {prep.data.context.assigned_to||'Tulajdonosi ügy'}</p>
        <p><strong>Esemény:</strong> {prep.data.type==='call'?'Hívás':'E-mail'} · <strong>Rögzítés időpontja:</strong> jóváhagyáskor</p>
        <p className="whitespace-pre-wrap break-words"><strong>Eredmény:</strong> {prep.data.result||'Nincs eredményszöveg'}</p>
        <p className="text-muted-foreground">Csak aktivitás rögzül; a következő lépés és státusz nem változik.</p>
      </div>:next?.success?<div className="space-y-2 rounded border bg-background/60 p-2">
        <p><strong>Ügy:</strong> {next.data.context.lead_name}</p>
        <p><strong>Cég:</strong> {next.data.context.company_name||'Nincs megadva'} · <strong>Kapcsolattartó:</strong> {next.data.context.contact_name||'Nincs megadva'}</p>
        <p><strong>Felelős:</strong> {next.data.context.assigned_to||'Tulajdonosi ügy'}</p>
        <p><strong>Régi lépés:</strong> {NEXT_STEP_LABEL[next.data.context.before.next_step_type as NextStepType]||next.data.context.before.next_step_type||'Nincs megadva'} · {nextStepBudapestTime(next.data.context.before.next_step_due_at)}</p>
        <p className="whitespace-pre-wrap break-words"><strong>Régi jegyzet:</strong> {next.data.context.before.next_step_note||'Nincs megadva'}</p>
        <p><strong>Új lépés:</strong> {NEXT_STEP_LABEL[next.data.type]} · {nextStepBudapestTime(next.data.dueAt)}</p>
        <p className="whitespace-pre-wrap break-words"><strong>Új jegyzet:</strong> {next.data.note||'Nincs megadva'}</p>
        <p className="text-muted-foreground">Csak a következő lépés változik; nincs státuszváltás, új utánkövetés vagy levélküldés.</p>
      </div>:followup?.success?<div className="space-y-2 rounded border bg-background/60 p-2">
        <p><strong>Ügy:</strong> {followup.data.context.lead_name} · <strong>Cég:</strong> {followup.data.context.company_name||'Nincs megadva'}</p>
        <p><strong>Kapcsolattartó:</strong> {followup.data.context.contact_name||'Nincs megadva'} · <strong>Felelős:</strong> {followup.data.context.assigned_to||'Tulajdonosi ügy'}</p>
        <p><strong>Tervezett utánkövetés:</strong> {{call:'Telefon',email:'E-mail',meeting:'Találkozó',other:'Egyéb'}[followup.data.type]} · {nextStepBudapestTime(followup.data.dueAt)}</p>
        <p className="whitespace-pre-wrap break-words"><strong>Jegyzet:</strong> {followup.data.note||'Nincs megadva'}</p>
        <p className="text-muted-foreground">Csak új tervezett utánkövetés; a következő lépés és státusz nem változik, levél nem megy ki.</p>
      </div>:contact?.success?<div className="space-y-2 rounded border bg-background/60 p-2">
        <p><strong>Ügy:</strong> {contact.data.context.lead_name} · <strong>Cég:</strong> {contact.data.context.company_name}</p>
        <p><strong>Felelős:</strong> {contact.data.context.assigned_to||'Tulajdonosi ügy'}</p>
        <p><strong>Régi kapcsolattartó:</strong> {contact.data.context.contact_name||'Nincs megadva'} · {contact.data.context.contact_id||'—'}</p>
        <p><strong>Új kapcsolattartó:</strong> {contact.data.context.new_contact_name} · {contact.data.contactId}</p>
        <p className="text-muted-foreground">Csak az ügy kapcsolattartója változik; személyadat, ajánlat és státusz nem módosul.</p>
      </div>:assignment?.success?<div className="space-y-2 rounded border bg-background/60 p-2">
        <p><strong>Ügy:</strong> {assignment.data.context.lead_name} · {assignment.data.leadId}</p>
        <p><strong>Cég:</strong> {assignment.data.context.company_name||'Nincs megadva'}</p>
        <p><strong>Régi felelős:</strong> {assignment.data.context.assignee_name||'Tulajdonosi ügy'} · {assignment.data.context.assigned_to||'—'}</p>
        <p><strong>Új felelős:</strong> {assignment.data.context.new_assignee_name} · {assignment.data.assigneeId}</p>
        <p className="text-muted-foreground">A lead és kapcsolt ajánlat láthatósága átkerül az új értékesítőhöz. Az ajánlat és utánkövetés felelőse, Gmail-hozzáférés és projekt nem változik.</p>
      </div>:pipelineStatus?.success?<div className="space-y-2 rounded border bg-background/60 p-2">
        <p><strong>Ügy:</strong> {pipelineStatus.data.context.lead_name} · {pipelineStatus.data.leadId}</p>
        <p><strong>Cég:</strong> {pipelineStatus.data.context.company_name||'Nincs megadva'}</p>
        <p><strong>Régi státusz:</strong> {LEAD_STATUS_LABEL[pipelineStatus.data.context.status]} → <strong>Új státusz:</strong> {LEAD_STATUS_LABEL[pipelineStatus.data.status]}</p>
        <p><strong>Mentett következő lépés:</strong> {NEXT_STEP_LABEL[pipelineStatus.data.context.next_step_type]} · {nextStepBudapestTime(pipelineStatus.data.context.next_step_due_at)}</p>
        <p className="whitespace-pre-wrap break-words">{pipelineStatus.data.context.next_step_note}</p>
        <p className="text-muted-foreground">Csak az ügy státusza változik; ajánlat, következő lépés és felelős nem módosul, levél nem megy ki. Az „Ajánlat kiadva” nem kiküldési bizonyíték.</p>
      </div>:<pre className="max-h-48 overflow-auto rounded bg-background/60 p-2 text-[11px] leading-snug">{argsPretty}</pre>}
      {approval.transportError && <p className="mt-2 text-destructive">{approval.transportError}</p>}
      {approval.action_id && (!approval.verified || approval.status === "unknown" || approval.status === "executing") && <Button size="sm" variant="outline" className="mt-2" disabled={approval.submitting} onClick={onCheck}>Állapot ellenőrzése</Button>}
      {approval.error && <p className="mt-2 text-destructive">{approval.error}</p>}
      {approval.status === "pending" && approval.action_id && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {level === "dangerous" && (
            <input
              type="text"
              value={dangerText}
              onChange={(e) => setDangerText(e.target.value)}
              placeholder="MEGERŐSÍTEM"
              className="h-7 flex-1 min-w-[140px] rounded border border-destructive/40 bg-background px-2 text-[11px] outline-none focus:ring-1 focus:ring-destructive"
            />
          )}
          <Button
            size="sm"
            variant={level === "dangerous" ? "destructive" : "default"}
            className="h-7 px-2 text-[11px]"
            onClick={() => onApprove?.(level === "dangerous" ? dangerText.trim().toUpperCase() : undefined)}
            disabled={approval.submitting || !approval.verified || (level === "dangerous" && !dangerOk)}
          >
            <CheckCircle2 className="mr-1 h-3 w-3" /> Jóváhagy és végrehajt
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" disabled={approval.submitting || !approval.verified} onClick={onReject}>
            <XCircle className="mr-1 h-3 w-3" /> Elvet
          </Button>
        </div>
      )}
    </div>
  );
}

