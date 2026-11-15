// Az új munkaterületen (/munka) belül a meglévő, beágyazott komponensek régi
// CRM-hivatkozásait a megfelelő új képernyőre fordítja. Tiszta függvény: jogot
// nem ad, adatot nem ír — a cél útvonal ugyanazon szerepkör-szabály alatt áll.
export type CrmLinkTarget = { to?: string; params?: Record<string, unknown>; search?: unknown };

const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : undefined);
const searchObj = (s: unknown): Record<string, unknown> => (s && typeof s === "object" ? (s as Record<string, unknown>) : {});

/** null = nincs új megfelelője; ilyenkor a hívó változatlanul hagyja. */
export function remapToWorkspace(t: CrmLinkTarget): CrmLinkTarget | null {
  const to = t.to;
  if (!to) return null;
  const p = t.params ?? {};
  const s = searchObj(t.search);
  const id = str(p.id);
  switch (to) {
    case "/customers/$id":
    case "/companies/$id": {
      const tab = str(s.tab);
      return id ? { to: "/munka/ugyfel/$id", params: { id }, search: tab ? { tab } : {} } : null;
    }
    case "/customers":
    case "/companies":
      return { to: "/munka/ugyfelek", search: {} };
    case "/contacts/$id":
      return id ? { to: "/munka/kapcsolattarto/$id", params: { id } } : null;
    case "/leads/$id":
      return id ? { to: "/munka/ugy/$id", params: { id } } : null;
    case "/leads": {
      const lead = str(s.lead);
      return lead ? { to: "/munka/ugy/$id", params: { id: lead } } : { to: "/munka" };
    }
    case "/sales/leads": {
      const lead = str(s.lead);
      return lead ? { to: "/munka/ugy/$id", params: { id: lead } } : { to: "/munka/sales/pipeline", search: {} };
    }
    case "/quotes/$id":
      return id ? { to: "/munka/sales/ajanlat/$id", params: { id } } : null;
    case "/quotes":
    case "/sales/quotes":
      return { to: "/munka/sales/ajanlatok" };
    case "/emails/$threadId": {
      const threadId = str(p.threadId);
      const mailbox = str(s.mailbox);
      return threadId ? { to: "/munka/levelezes/$threadId", params: { threadId }, search: mailbox ? { mailbox } : {} } : null;
    }
    case "/emails":
      return { to: "/munka/levelezes" };
    case "/campaign-list": {
      const out: Record<string, string> = {};
      for (const k of ["companyId", "contactId", "campaignId"]) { const v = str(s[k]); if (v) out[k] = v; }
      return { to: "/munka/marketing/kampany", search: out };
    }
    case "/web-quote-requests/$id":
      return id ? { to: "/munka/marketing/erdeklodo/$id", params: { id } } : null;
    case "/web-quote-requests":
      return { to: "/munka/marketing/erdeklodok" };
    case "/projects/$id":
      return id ? { to: "/munka/sales/projekt/$id", params: { id } } : null;
    case "/today":
    case "/sales":
    case "/sales/todo":
    case "/followups":
    case "/tasks":
      return { to: "/munka" };
    default:
      return null;
  }
}

/** Ezek a célok az új munkaterületen nem jelennek meg (külön AI-oldal, régi beállítások). */
export const WORKSPACE_HIDDEN_TARGETS = ["/ai-assistant"] as const;
