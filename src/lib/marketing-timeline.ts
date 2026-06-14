/**
 * Marketing idővonal — EGYETLEN forrás a cég-szintű idővonal eseményekre.
 * A workspace és minden más képernyő, ami idővonalat mutat, ezt használja.
 *
 * Bemenet: a workspace által amúgy is kérdezett adathalmazok.
 * Kimenet: dátum szerint csökkenő sorrendű, egységes formátumú eseménylista.
 */
import { MARKETING_STATUS_LABEL, type MarketingMeta } from "@/lib/marketing-status";

export type TimelineEvent = {
  at: string;            // ISO timestamp
  kind:
    | "company_created"
    | "contact_added"
    | "email_sent"
    | "email_received"
    | "doc_uploaded"
    | "status_change"
    | "handoff";
  label: string;
  detail?: string;
};

type Input = {
  company: { name: string; created_at: string };
  contacts: { id: string; name: string | null; email: string | null; created_at?: string | null }[];
  emails: {
    id: string;
    subject?: string | null;
    from_email?: string | null;
    to_email?: string | null;
    internal_date?: string | null;
    created_at?: string | null;
    is_outbound?: boolean | null;
  }[];
  docs: { id: string; name: string | null; created_at: string }[];
  meta: MarketingMeta;
};

const STATUS_HISTORY_RX =
  /\[MKT:STATUS:(new|contacted|qualified|handoff|rejected)(?::([0-9]{4}-[0-9]{2}-[0-9]{2}))?(?::([^\]]+))?\]/g;

export function buildTimeline(input: Input, notes: string | null): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  events.push({
    at: input.company.created_at,
    kind: "company_created",
    label: "Cég létrehozva",
    detail: input.company.name,
  });

  for (const c of input.contacts) {
    if (!c.created_at) continue;
    events.push({
      at: c.created_at,
      kind: "contact_added",
      label: "Kapcsolattartó hozzáadva",
      detail: c.name ?? c.email ?? "—",
    });
  }

  for (const e of input.emails) {
    const at = e.internal_date ?? e.created_at;
    if (!at) continue;
    events.push({
      at,
      kind: e.is_outbound ? "email_sent" : "email_received",
      label: e.is_outbound ? "Email elküldve" : "Email érkezett",
      detail: e.subject ?? (e.is_outbound ? e.to_email ?? "" : e.from_email ?? ""),
    });
  }

  for (const d of input.docs) {
    events.push({
      at: d.created_at,
      kind: "doc_uploaded",
      label: "Dokumentum feltöltve",
      detail: d.name ?? "",
    });
  }

  // Státusz történet: minden MKT:STATUS marker (a notes-ból, időrendben).
  const seen = new Set<string>();
  if (notes) {
    let m: RegExpExecArray | null;
    const rx = new RegExp(STATUS_HISTORY_RX.source, "g");
    while ((m = rx.exec(notes)) !== null) {
      const status = m[1] as keyof typeof MARKETING_STATUS_LABEL;
      const date = m[2];
      if (!date) continue;
      const key = `${status}:${date}`;
      if (seen.has(key)) continue;
      seen.add(key);
      events.push({
        at: `${date}T00:00:00`,
        kind: status === "handoff" ? "handoff" : "status_change",
        label:
          status === "handoff"
            ? "Átadva sales-nek"
            : `Státusz: ${MARKETING_STATUS_LABEL[status]}`,
        detail: status === "handoff" && m[3] ? `lead #${m[3].slice(0, 8)}` : undefined,
      });
    }
  }

  events.sort((a, b) => {
    const ta = new Date(a.at).getTime();
    const tb = new Date(b.at).getTime();
    return tb - ta;
  });

  return events;
}