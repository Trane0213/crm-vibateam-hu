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
