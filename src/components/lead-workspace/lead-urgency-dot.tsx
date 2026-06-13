/**
 * Közös sürgősség-pötty a Lead Workspace bal listához és a középső adatlap fejlécéhez.
 *
 * Színkód:
 *   red    — van lejárt utánkövetés
 *   amber  — van ma esedékes utánkövetés
 *   blue   — friss lead (24 órán belül készült) és nincs még utánkövetés
 *   muted  — minden más
 */

export type UrgencyLevel = "red" | "amber" | "blue" | "muted";

export type FollowupLite = {
  due_date: string | null;
  completed: boolean | null;
  company_id: string | null;
};

export type LeadLite = {
  company_id?: string | null;
  created_at?: string | null;
};

export function computeLeadUrgency(
  lead: LeadLite,
  followupsByCompany: Map<string, FollowupLite[]> | undefined,
): UrgencyLevel {
  const list = lead.company_id ? followupsByCompany?.get(lead.company_id) ?? [] : [];
  const now = Date.now();
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date();   endOfToday.setHours(23, 59, 59, 999);
  let hasOverdue = false;
  let hasToday = false;
  for (const f of list) {
    if (f.completed || !f.due_date) continue;
    const t = new Date(f.due_date).getTime();
    if (!Number.isFinite(t)) continue;
    if (t < startOfToday.getTime()) hasOverdue = true;
    else if (t <= endOfToday.getTime()) hasToday = true;
  }
  if (hasOverdue) return "red";
  if (hasToday) return "amber";
  if (lead.created_at) {
    const age = now - new Date(lead.created_at).getTime();
    if (Number.isFinite(age) && age <= 24 * 60 * 60 * 1000) return "blue";
  }
  return "muted";
}

const TONE: Record<UrgencyLevel, { dot: string; label: string }> = {
  red:   { dot: "bg-destructive",                 label: "Lejárt utánkövetés" },
  amber: { dot: "bg-[color:var(--status-warning)]", label: "Mai utánkövetés" },
  blue:  { dot: "bg-[color:var(--status-info)]",    label: "Új érdeklődő (24h)" },
  muted: { dot: "bg-muted-foreground/40",         label: "Nincs esedékes" },
};

export function LeadUrgencyDot({
  level, size = "sm", withLabel = false,
}: {
  level: UrgencyLevel;
  size?: "sm" | "md";
  withLabel?: boolean;
}) {
  const t = TONE[level];
  const cls = size === "md" ? "h-2.5 w-2.5" : "h-2 w-2";
  return (
    <span className="inline-flex items-center gap-1.5" title={t.label}>
      <span className={`shrink-0 rounded-full ${cls} ${t.dot}`} aria-label={t.label} />
      {withLabel && <span className="text-[11px] text-muted-foreground">{t.label}</span>}
    </span>
  );
}

/** Rendezési súly: piros (0) → sárga (1) → kék (2) → szürke (3). */
export function urgencyOrder(level: UrgencyLevel): number {
  return level === "red" ? 0 : level === "amber" ? 1 : level === "blue" ? 2 : 3;
}
