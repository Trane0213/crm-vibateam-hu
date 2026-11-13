/** AI OS 2.0/4 — egységes értesítési központ: tiszta megjelenítési szabályok (adat: crm_notifications, RLS). */
export type NotificationRow = {
  id: string; category: string; severity: string; requires_decision: boolean; title: string; body: string;
  link_path: string | null; occurrences: number; created_at: string; last_occurred_at: string; resolved_at: string | null;
  audience_user: string | null;
};
export const NOTIFICATION_CATEGORY = { ai: "AI-megállapítás", document: "Dokumentum", business: "Üzleti esemény", system: "Rendszerhiba", feedback: "Visszajelzés" } as const;
export const NOTIFICATION_SEVERITY = { critical: "Kritikus", warning: "Figyelmeztetés", info: "Tájékoztatás" } as const;

/**
 * Tulajdonos azonnal csak kritikus vagy döntést igénylő jelzést kap; a többi a napi összesítőbe kerül.
 * Más szerepkörnél (és a személyesen címzett jelzésnél) a figyelmeztetés is azonnali.
 */
export function isImmediate(n: Pick<NotificationRow, "severity" | "requires_decision" | "audience_user">, isOwner: boolean, me?: string) {
  if (n.severity === "critical" || n.requires_decision) return true;
  if (isOwner && n.audience_user !== me) return false;
  return n.severity === "warning";
}

/** Csak nyitott (nem lezárt), olvasatlan, azonnali jelzés számít a csengő számlálójába. */
export function badgeCount(rows: NotificationRow[], read: Set<string>, isOwner: boolean, me?: string) {
  return rows.filter((n) => !n.resolved_at && !read.has(n.id) && isImmediate(n, isOwner, me)).length;
}

/** Csak belső, abszolút CRM-útvonal nyitható meg (nincs külső hivatkozás). */
export function safeLink(path: string | null) {
  return path && /^\/[A-Za-z0-9/_?=&.-]*$/.test(path) && !path.startsWith("//") ? path : null;
}

/** AI OS 2.0/7 — azonos típusú, című és célú jelzések összevonása, hogy sok hasonló esemény ne árassza el a listát. */
export type NotificationGroup = { key: string; lead: NotificationRow; rows: NotificationRow[]; requiresDecision: boolean };
const SEVERITY_RANK: Record<string, number> = { critical: 0, warning: 1, info: 2 };
export function groupNotifications(rows: NotificationRow[], minGroup = 3): NotificationGroup[] {
  const buckets = new Map<string, NotificationRow[]>();
  for (const n of rows) {
    const k = `${n.category}|${n.title}|${n.link_path ?? ""}`;
    const b = buckets.get(k); if (b) b.push(n); else buckets.set(k, [n]);
  }
  const out: NotificationGroup[] = [];
  for (const [k, b] of buckets) {
    if (b.length >= minGroup) {
      const lead = [...b].sort((x, y) => (SEVERITY_RANK[x.severity] ?? 3) - (SEVERITY_RANK[y.severity] ?? 3))[0];
      out.push({ key: `g:${k}`, lead, rows: b, requiresDecision: b.some((n) => n.requires_decision) });
    } else for (const n of b) out.push({ key: n.id, lead: n, rows: [n], requiresDecision: n.requires_decision });
  }
  // A sorrend a csoport legfrissebb eseménye szerint (a bemenet már időrendben érkezik).
  const firstIndex = new Map(rows.map((n, i) => [n.id, i]));
  return out.sort((a, b) => Math.min(...a.rows.map((n) => firstIndex.get(n.id)!)) - Math.min(...b.rows.map((n) => firstIndex.get(n.id)!)));
}
