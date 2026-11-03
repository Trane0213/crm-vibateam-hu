/** Source/completeness only: do not duplicate private extracted content or signed URLs into audit. */
export function documentToolAudit(payload: unknown) {
  const value = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const data = value.data && typeof value.data === "object" ? value.data as Record<string, unknown> : {};
  return { ok: value.ok, content_omitted: true, source: data.source, provenance: data.provenance,
    status: data.status, pagination: data.pagination, completeness: data.completeness };
}