/** Bounded, explicit pagination for model-facing CRM reads (user RLS remains upstream). */
export const CRM_PAGE_PROPERTIES = {
  limit: { type: "integer", default: 25, minimum: 1, maximum: 100 },
  offset: { type: "integer", default: 0, minimum: 0 },
};

export function readWindow(args: Record<string, unknown>, defaultLimit = 25) {
  const limit = args.limit === undefined ? defaultLimit : Number(args.limit);
  const offset = args.offset === undefined ? 0 : Number(args.offset);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0) {
    throw new Error("Érvénytelen lapozás: limit 1–100, offset nemnegatív egész.");
  }
  return { limit, offset };
}

function boundText(value: unknown, truncated: string[], path: string): unknown {
  if (typeof value === "string" && value.length > 1500) {
    truncated.push(path);
    return value.slice(0, 1500);
  }
  if (Array.isArray(value)) return value.map((v, i) => boundText(v, truncated, `${path}.${i}`));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, boundText(v, truncated, `${path}.${k}`)]));
  return value;
}

export function budapestTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) return null;
  return new Intl.DateTimeFormat('hu-HU', { timeZone: 'Europe/Budapest', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value)) + ' (Europe/Budapest)';
}

/** Interpretation is attached to saved fields, not inferred by the model. */
export function crmRecordFacts(row: Record<string, unknown>, source: string, now = new Date()): Record<string, unknown> {
  const dates = Object.fromEntries(Object.entries(row).flatMap(([key, value]) => {
    const display = (key.endsWith('_at') || key === 'due_date') ? budapestTimestamp(value) : null;
    return display ? [[key, display]] : [];
  }));
  const facts: Record<string, unknown> = { ...row, ...(Object.keys(dates).length ? { budapest_times: dates } : {}) };
  if (source === 'followups') {
    facts.work_state = row.completed === true ? 'completed' : row.completed === false ? (typeof row.due_date === 'string' && Date.parse(row.due_date) < now.getTime() ? 'overdue' : 'open') : 'unknown';
    facts.action_required = row.completed === false;
  }
  if (source === 'contacts') facts.email_verification = !row.email ? 'missing' : row.email_invalid === true ? 'flagged_invalid' : 'not_verified';
  return facts;
}

export function crmReadPage(rows: unknown[], count: number | null, window: { limit: number; offset: number }, source: string, budget = 18000) {
  const items: Record<string, unknown>[] = [];
  const truncatedFields: string[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row) || !("id" in row) || typeof row.id !== "string") throw new Error("Érvénytelen CRM rekord; hiányzó forrásazonosító.");
    const fields: string[] = [];
    const item = boundText(crmRecordFacts(row as Record<string, unknown>, source), fields, String(row.id)) as Record<string, unknown>;
    if (JSON.stringify([...items, item]).length > budget) break;
    items.push(item);
    truncatedFields.push(...fields);
  }
  if (rows.length && !items.length) throw new Error("A rekord túl nagy; a tartalom nem adható vissza teljesként.");
  const consumed = window.offset + items.length;
  const hasMore = items.length < rows.length || (count === null ? rows.length >= window.limit : consumed < count);
  return {
    items,
    pagination: { offset: window.offset, limit: window.limit, returned: items.length, total_visible: count, has_more: hasMore, next_offset: hasMore ? consumed : null },
    completeness: { scope: "authenticated_user_visible_records", full_company_history: false, page_complete: !hasMore && window.offset === 0, truncated_fields: truncatedFields, missing_data_reason: 'not_documented', empty_result_meaning: 'no_visible_matches_in_this_selection_not_proof_of_nonexistence' },
    sources: items.map((item) => ({ table: source, id: item.id })),
  };
}

export const LEAD_CONTEXT_SELECT = "id,company_id,contact_id,status,source,summary,assigned_to,assigned_at,created_at,pipeline_entered_at,next_step_type,next_step_due_at,next_step_note,won_at,lost_at,lost_reason,lost_note";

export type HistoryEvent = { at: string; kind: string; source: { table: string; id: unknown }; record: Record<string, unknown> };
export function leadTimeline(history: Record<string, unknown>[], followups: Record<string, unknown>[], activities: Record<string, unknown>[] = []): HistoryEvent[] {
  const events: HistoryEvent[] = [];
  for (const [table, rows, field, kind] of [
    ["lead_status_history", history, "changed_at", "status_change"],
    ["followups", followups.filter((r) => r.completed === true), "due_date", "recorded_contact"],
    ["activities", activities, "created_at", "audit_event"],
  ] as const) {
    for (const row of rows) {
      const at = row[field];
      if (typeof at === "string" && Number.isFinite(Date.parse(at))) events.push({ at, kind, source: { table, id: row.id }, record: row });
    }
  }
  return events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || String(a.source.id).localeCompare(String(b.source.id)));
}