/**
 * Következő lépés dátum + időpont bevitel segédfüggvényei (helyi idő ↔ ISO).
 * Külön "Dátum" (YYYY-MM-DD) és "Időpont" (HH:MM) mező, mindkettő kötelező.
 */
export const NEXT_STEP_INCOMPLETE_MSG = "Add meg a következő lépés típusát, dátumát és időpontját.";

const pad = (n: number) => String(n).padStart(2, "0");

export function splitIsoToLocal(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/** Érvényes helyi dátum + idő → ISO, egyébként null. */
export function localDateTimeToIso(date: string, time: string): string | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? "");
  const tm = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(time ?? "");
  if (!dm || !tm) return null;
  const [y, mo, da] = [Number(dm[1]), Number(dm[2]), Number(dm[3])];
  const [h, mi] = [Number(tm[1]), Number(tm[2])];
  if (h > 23 || mi > 59) return null;
  const d = new Date(y, mo - 1, da, h, mi, 0, 0);
  if (d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== da) return null;
  return d.toISOString();
}

export type NextStepPayload = {
  next_step_type: string;
  next_step_due_at: string;
  next_step_note: string | null;
};

/** Mentési payload, vagy null ha bármely kötelező mező hiányzik/érvénytelen. */
export function buildNextStepPayload(type: string, date: string, time: string, note: string): NextStepPayload | null {
  if (!type) return null;
  const iso = localDateTimeToIso(date, time);
  if (!iso) return null;
  return { next_step_type: type, next_step_due_at: iso, next_step_note: note.trim() || null };
}

/** Pipeline-ba léptetés feltétele: ≥1 aktivitás, típus és mentett határidő. */
export function canEnterPipeline(p: {
  activityCount: number;
  nextStepType: string | null | undefined;
  nextStepDueAt: string | null | undefined;
  inPipeline: boolean;
  isLost: boolean;
}): boolean {
  const dueOk = !!p.nextStepDueAt && !Number.isNaN(new Date(p.nextStepDueAt).getTime());
  return !p.inPipeline && !p.isLost && p.activityCount >= 1 && !!p.nextStepType && dueOk;
}
