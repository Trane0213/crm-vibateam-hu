/**
 * Follow-up figyelmeztetések kategorizálása due_date alapján.
 * Tisztán dátum-aritmetika, OpenAI-tól függetlenül működik.
 */

export type FollowupBucket =
  | "overdue"
  | "due-3d"
  | "due-7d"
  | "due-14d"
  | "due-30d"
  | "future"
  | "done";

export const BUCKET_LABEL: Record<FollowupBucket, string> = {
  overdue: "Lejárt",
  "due-3d": "3 napon belül",
  "due-7d": "7 napon belül",
  "due-14d": "14 napon belül",
  "due-30d": "30 napon belül",
  future: "Jövőbeli",
  done: "Lezárt",
};

export const BUCKET_TONE: Record<FollowupBucket, string> = {
  overdue:
    "border-destructive/40 bg-destructive/10 text-destructive",
  "due-3d":
    "border-[color:var(--status-warning)]/40 bg-[color:var(--status-warning)]/15 text-[color:var(--status-warning)]",
  "due-7d":
    "border-[color:var(--status-warning)]/30 bg-[color:var(--status-warning)]/10 text-[color:var(--status-warning)]",
  "due-14d":
    "border-[color:var(--status-info)]/30 bg-[color:var(--status-info)]/10 text-[color:var(--status-info)]",
  "due-30d":
    "border-muted bg-muted/40 text-muted-foreground",
  future: "border-muted bg-transparent text-muted-foreground",
  done:
    "border-[color:var(--status-success)]/30 bg-[color:var(--status-success)]/10 text-[color:var(--status-success)]",
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function bucketFollowup(
  due_date: string | Date | null | undefined,
  completed?: boolean | null,
  now: Date = new Date(),
): FollowupBucket {
  if (completed) return "done";
  if (!due_date) return "future";
  const due = due_date instanceof Date ? due_date : new Date(due_date);
  if (Number.isNaN(due.getTime())) return "future";
  const diff = Math.ceil((due.getTime() - now.getTime()) / MS_PER_DAY);
  if (diff < 0) return "overdue";
  if (diff <= 3) return "due-3d";
  if (diff <= 7) return "due-7d";
  if (diff <= 14) return "due-14d";
  if (diff <= 30) return "due-30d";
  return "future";
}

export function summarizeFollowups(
  rows: { due_date?: string | null; completed?: boolean | null }[],
): Record<FollowupBucket, number> {
  const out: Record<FollowupBucket, number> = {
    overdue: 0,
    "due-3d": 0,
    "due-7d": 0,
    "due-14d": 0,
    "due-30d": 0,
    future: 0,
    done: 0,
  };
  for (const r of rows) {
    out[bucketFollowup(r.due_date ?? null, r.completed ?? false)]++;
  }
  return out;
}