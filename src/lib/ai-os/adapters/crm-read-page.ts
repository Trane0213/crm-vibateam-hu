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

export function crmReadPage(rows: Record<string, unknown>[], count: number | null, window: { limit: number; offset: number }, source: string, budget = 18000) {
  const items: Record<string, unknown>[] = [];
  const truncatedFields: string[] = [];
  for (const row of rows) {
    const fields: string[] = [];
    const item = boundText(row, fields, String(row.id)) as Record<string, unknown>;
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
    completeness: { scope: "authenticated_user_visible_records", full_company_history: false, page_complete: !hasMore && window.offset === 0, truncated_fields: truncatedFields },
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