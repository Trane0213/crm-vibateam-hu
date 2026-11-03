/** Email contents are model input, not duplicated into the tool audit record. */
export function emailToolAudit(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return { content_omitted: true };
  const value = payload as Record<string, unknown>;
  const data = value.data && typeof value.data === "object" ? value.data as Record<string, unknown> : {};
  const items = Array.isArray(data.items) ? data.items as Record<string, unknown>[] : [];
  return { ok: value.ok, content_omitted: true, sources: items.map((r) => ({ id: r.id, thread_id: r.thread_id })),
    pagination: data.pagination, completeness: data.completeness };
}