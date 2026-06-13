/**
 * Lead-szintű adatminőség pontozás — a már létező cég-pontozás mintájára.
 * Csak meglévő mezőket néz: company_id, contact_id, email, phone, summary, source.
 * Új tábla / mező NEM jön létre.
 */

export type LeadForScore = {
  id: string;
  company_id?: string | null;
  contact_id?: string | null;
  email?: string | null;
  phone?: string | null;
  summary?: string | null;
  source?: string | null;
};
export type ContactForLeadScore = { email?: string | null; phone?: string | null };

export type LeadScoreItem = { key: string; label: string; ok: boolean; weight: number };
export type LeadScore = {
  pct: number;
  band: "green" | "yellow" | "red";
  items: LeadScoreItem[];
  missing: string[];
};

/** Egy lead pontszáma + tételes lista a panelhez. */
export function computeLeadScore(
  lead: LeadForScore,
  primaryContact?: ContactForLeadScore | null,
  company?: { domain?: string | null; website?: string | null } | null,
): LeadScore {
  const hasEmail = !!(lead.email || primaryContact?.email);
  const hasPhone = !!(lead.phone || primaryContact?.phone);
  const hasDomain = !!(company?.domain || company?.website);

  const items: LeadScoreItem[] = [
    { key: "summary", label: "Összefoglaló",  ok: !!(lead.summary && lead.summary.trim().length >= 8), weight: 10 },
    { key: "source",  label: "Forrás",        ok: !!lead.source, weight: 10 },
    { key: "company", label: "Cég",           ok: !!lead.company_id, weight: 25 },
    { key: "contact", label: "Kapcsolattartó",ok: !!lead.contact_id, weight: 15 },
    { key: "email",   label: "Email",         ok: hasEmail, weight: 20 },
    { key: "phone",   label: "Telefonszám",   ok: hasPhone, weight: 15 },
    { key: "domain",  label: "Domain",        ok: hasDomain, weight: 5  },
  ];
  const total = items.reduce((a, i) => a + i.weight, 0);
  const got = items.reduce((a, i) => a + (i.ok ? i.weight : 0), 0);
  const pct = Math.round((got / total) * 100);
  const band: LeadScore["band"] = pct >= 85 ? "green" : pct >= 50 ? "yellow" : "red";
  return { pct, band, items, missing: items.filter((i) => !i.ok).map((i) => i.label) };
}