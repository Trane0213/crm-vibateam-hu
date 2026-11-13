/**
 * AI OS 2.0 / 5. szakasz — automatikus AI-felülvizsgálat tiszta logikája.
 * A jelzéseket SQL gyűjti determinisztikusan (0 LLM). LLM-vizsgálat csak érdemi (warning/critical),
 * még nem vizsgált jelzésre indul, kizárólag az érintett szakértővel és a jóváhagyott kereten belül.
 */
export type Severity = "critical" | "warning" | "info";
export type ReviewAgent = "george" | "scarlet" | "timothy" | "boss";

export interface PendingSignal {
  id: string;
  signal_key: string;
  domain: string;
  agent: ReviewAgent;
  severity: Severity;
  title: string;
  detail: Record<string, unknown>;
  source_table: string | null;
  source_id: string | null;
  occurrences: number;
  first_seen_at: string;
}

export type ReviewPlan =
  | { type: "issue"; issueId: string; mode: "initial" | "rerun"; signals: PendingSignal[] }
  | { type: "area"; agent: ReviewAgent; signals: PendingSignal[] };

export interface ReviewConfig {
  enabled: boolean;
  daily_review_limit: number;
  daily_token_limit: number;
  max_reviews_per_run: number;
  paused_reason: string | null;
}

export const AREA_LABEL: Record<ReviewAgent, string> = { george: "Rendszer és dokumentumok (George)", scarlet: "Marketing (Scarlet)", timothy: "Sales (Timothy)", boss: "Projektek (Boss)" };
/** Az oldalútvonal dönti el a meglévő routeSpecialist szerint, melyik szakértőt kérdezi George. */
export const AREA_PATH: Record<ReviewAgent, string> = { george: "/settings/ai-review", scarlet: "/campaign-list", timothy: "/pipeline", boss: "/projects" };
export const MAX_SIGNALS_PER_AREA = 25;
const SEV_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

/** Csak vizsgálandó (nem info) jelzésekből tervez; jelzés nélkül üres terv = 0 AI-hívás. */
export function planReviews(signals: PendingSignal[], slots: number): ReviewPlan[] {
  if (slots <= 0) return [];
  const due = signals.filter((s) => s.severity !== "info").sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || a.first_seen_at.localeCompare(b.first_seen_at));
  const plans: ReviewPlan[] = [];
  const seenIssues = new Set<string>();
  const areas = new Map<ReviewAgent, PendingSignal[]>();
  for (const s of due) {
    const issueId = s.domain === "feedback" && typeof s.detail?.issue_id === "string" ? s.detail.issue_id : null;
    if (issueId) {
      if (seenIssues.has(issueId)) continue;
      seenIssues.add(issueId);
      plans.push({ type: "issue", issueId, mode: s.signal_key.startsWith("issue_reopened:") ? "rerun" : "initial", signals: [s] });
      continue;
    }
    const list = areas.get(s.agent) ?? [];
    if (list.length < MAX_SIGNALS_PER_AREA) list.push(s);
    areas.set(s.agent, list);
  }
  for (const [agent, list] of areas) plans.push({ type: "area", agent, signals: list });
  const hasCritical = (p: ReviewPlan) => p.signals.some((s) => s.severity === "critical");
  plans.sort((a, b) => Number(hasCritical(b)) - Number(hasCritical(a)) || Number(b.type === "issue") - Number(a.type === "issue") || b.signals.length - a.signals.length);
  return plans.slice(0, slots);
}

/** Költségkeret: szüneteltetés, napi vizsgálatszám és napi tokenkeret. */
export function reviewAllowance(cfg: ReviewConfig, usage: { reviewsToday: number; tokensToday: number }): { slots: number; reason: string | null } {
  if (cfg.paused_reason) return { slots: 0, reason: "paused" };
  if (usage.tokensToday >= cfg.daily_token_limit) return { slots: 0, reason: "token_limit" };
  const left = cfg.daily_review_limit - usage.reviewsToday;
  if (left <= 0) return { slots: 0, reason: "daily_limit" };
  return { slots: Math.min(cfg.max_reviews_per_run, left), reason: null };
}

/** Kredit-, kvóta- vagy rate-limit hiba → biztonságos leállás, nincs automatikus újrapróbálás. */
export function isCreditError(e: unknown): boolean {
  if (e && typeof e === "object" && (e as { code?: unknown }).code === "credit") return true;
  const m = e instanceof Error ? e.message : String(e ?? "");
  return /429|credit|insufficient_quota|rate.?limit|egyenleg/i.test(m);
}

/** Hiba után legfeljebb egyszer kerül vissza a sorba; utána "failed", kézi döntésig. */
export const MAX_REVIEW_ATTEMPTS = 2;
export function nextStatusAfterFailure(attempts: number): "pending" | "failed" {
  return attempts + 1 >= MAX_REVIEW_ATTEMPTS ? "failed" : "pending";
}

/** Azonos jelzéscsoport = azonos hibajegy (idempotencia): determinisztikus UUID a kulcsokból. */
export async function areaSubmissionKey(agent: ReviewAgent, signalKeys: string[]): Promise<string> {
  const text = `${agent}|${[...signalKeys].sort().join("|")}`;
  const buf = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  buf[6] = (buf[6] & 0x0f) | 0x50;
  buf[8] = (buf[8] & 0x3f) | 0x80;
  const h = [...buf.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function refs(detail: Record<string, unknown>): string {
  return Object.entries(detail ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== "").map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(", ");
}

/** A közös hibajegyzékbe kerülő AI-jegy szövege: gyanú, nem igazolt hiba; csak azonosítók, személyes adat nélkül. */
export function areaIssueText(agent: ReviewAgent, signals: PendingSignal[]) {
  const head = `[Automatikus AI-felülvizsgálat] ${AREA_LABEL[agent]}: ${signals.length} determinisztikusan észlelt jelzés. Ez GYANÚ, nem igazolt hiba — George és a szakértő ellenőrzi a forrásrekordokkal.`;
  const lines = signals.map((s) => `- [${s.severity === "critical" ? "SÚLYOS" : "figyelmeztetés"}] ${s.title} (${refs(s.detail)}; észlelve ${s.occurrences}×)`);
  let description = head;
  for (const l of lines) { if ((description + "\n" + l).length > 1950) { description += `\n… további ${signals.length - description.split("\n").length + 1} jelzés`; break; } description += "\n" + l; }
  return {
    description: description.slice(0, 2000),
    expected: "Az érintett rekordok a CRM szabályai szerint, hiánytalanul állnak (következő lépés, felelős, bizonyíték, feldolgozás).",
    actual: `Az óránkénti ellenőrzés ${signals.length} eltérést jelzett. Ellenőrizendő, mely jelzés valós hiba, melyik ismert vagy elfogadott állapot.`.slice(0, 1000),
  };
}

/** Budapest-napkezdet UTC ISO-ban (napi keretekhez). */
export function budapestDayStartIso(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const local = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  const offset = local - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day")) - offset).toISOString();
}
