/**
 * Marketing workflow markerek a `companies.notes` szabad szöveg mezőben.
 *
 * SZIGORÚAN nincs séma-módosítás — minden marketing állapotot a meglévő
 * `companies.notes` mező tárol fenced markerekkel. Ezeket a markereket a
 * UI nem mutatja a tartalomban (a sales note régió kibontásra kerül,
 * a státusz markerek pedig kiszűrésre).
 *
 * Markerek:
 *  - `[MKT:STATUS:new|contacted|qualified|handoff:YYYY-MM-DD[:LEADID]]`
 *  - `[MKT:SALES_NOTE]\n…\n[/MKT:SALES_NOTE]`
 *  - `[KAMPANY:EMAIL_SENT:YYYY-MM-DD]`   (campaign-list-ben már létezett)
 *  - `[KAMPANY:REJECTED:YYYY-MM-DD]`     (campaign-list-ben már létezett)
 *
 * Egy cégen mindig csak egyetlen aktív `[MKT:STATUS:…]` marker él — új
 * állapot beállítása előtt a régiek törlődnek.
 */

export type MarketingStatus = "new" | "contacted" | "qualified" | "handoff" | "rejected";

export const MARKETING_STATUS_LABEL: Record<MarketingStatus, string> = {
  new:        "Új",
  contacted:  "Kapcsolatban",
  qualified:  "Átadható",
  handoff:    "Átadva sales-nek",
  rejected:   "Kikerült",
};

export const MARKETING_STATUS_TONE: Record<MarketingStatus, string> = {
  new:        "border-[color:var(--status-info)]/40    bg-[color:var(--status-info)]/10    text-[color:var(--status-info)]",
  contacted:  "border-primary/40                       bg-primary/10                       text-primary",
  qualified:  "border-[color:var(--status-warning)]/40 bg-[color:var(--status-warning)]/10 text-[color:var(--status-warning)]",
  handoff:    "border-[color:var(--status-success)]/40 bg-[color:var(--status-success)]/10 text-[color:var(--status-success)]",
  rejected:   "border-muted-foreground/30              bg-muted/40                          text-muted-foreground",
};

const STATUS_RX = /\[MKT:STATUS:(new|contacted|qualified|handoff|rejected)(?::([0-9]{4}-[0-9]{2}-[0-9]{2}))?(?::([^\]]+))?\]/g;
const SALES_NOTE_RX = /\[MKT:SALES_NOTE\]([\s\S]*?)\[\/MKT:SALES_NOTE\]/;
const ALL_MARKER_RX = /\[(?:MKT|KAMPANY):[^\]]+\]|\[MKT:SALES_NOTE\][\s\S]*?\[\/MKT:SALES_NOTE\]/g;
const KAMPANY_EMAIL_SENT_RX = /\[KAMPANY:EMAIL_SENT:([0-9]{4}-[0-9]{2}-[0-9]{2})\]/;
const KAMPANY_REJECTED_RX   = /\[KAMPANY:REJECTED:([0-9]{4}-[0-9]{2}-[0-9]{2})\]/;

export type MarketingMeta = {
  status: MarketingStatus;
  statusDate: string | null;
  handoffLeadId: string | null;
  salesNote: string;
};

/** Marker-mentes, ember által olvasható szöveg a `notes`-ból. */
export function stripMarkers(notes: string | null): string {
  if (!notes) return "";
  return notes
    .replace(SALES_NOTE_RX, "")
    .replace(ALL_MARKER_RX, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function readMarketingMeta(notes: string | null): MarketingMeta {
  if (!notes) return { status: "new", statusDate: null, handoffLeadId: null, salesNote: "" };
  // Legutoljára felvett MKT:STATUS marker érvényes (időrendileg új).
  STATUS_RX.lastIndex = 0;
  let last: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = STATUS_RX.exec(notes)) !== null) last = m;
  const sn = SALES_NOTE_RX.exec(notes);
  const salesNote = sn ? sn[1].trim() : "";

  // Egységesített leképezés. Ha van explicit MKT:STATUS marker, az nyer.
  // Ha nincs, akkor a régi KAMPANY markerekből vezetjük le a státuszt,
  // hogy a marketing-home / campaign-list / workspace ugyanazt mutassa.
  if (last) {
    const status = last[1] as MarketingStatus;
    const statusDate = last[2] ?? null;
    const handoffLeadId = status === "handoff" ? last[3] ?? null : null;
    return { status, statusDate, handoffLeadId, salesNote };
  }
  const rej = KAMPANY_REJECTED_RX.exec(notes);
  if (rej) return { status: "rejected", statusDate: rej[1], handoffLeadId: null, salesNote };
  const sent = KAMPANY_EMAIL_SENT_RX.exec(notes);
  if (sent) return { status: "contacted", statusDate: sent[1], handoffLeadId: null, salesNote };
  return { status: "new", statusDate: null, handoffLeadId: null, salesNote };
}

function removeAllStatusMarkers(notes: string): string {
  return notes.replace(STATUS_RX, "").replace(/[ \t]*\n{3,}/g, "\n\n");
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Új státusz beállítása — régi STATUS markereket eltávolítja, újat fűz a végére. */
export function withMarketingStatus(
  notes: string | null,
  status: MarketingStatus,
  handoffLeadId?: string,
): string {
  const base = removeAllStatusMarkers(notes ?? "").trimEnd();
  const tail =
    status === "handoff" && handoffLeadId
      ? `[MKT:STATUS:handoff:${todayIso()}:${handoffLeadId}]`
      : `[MKT:STATUS:${status}:${todayIso()}]`;
  return base ? `${base}\n${tail}` : tail;
}

/** Sales note régió frissítése (vagy létrehozása). Üres tartalom törli a régiót. */
export function withSalesNote(notes: string | null, content: string): string {
  const trimmed = content.trim();
  const base = (notes ?? "").replace(SALES_NOTE_RX, "").replace(/\n{3,}/g, "\n\n").trimEnd();
  if (!trimmed) return base;
  const region = `[MKT:SALES_NOTE]\n${trimmed}\n[/MKT:SALES_NOTE]`;
  return base ? `${base}\n\n${region}` : region;
}