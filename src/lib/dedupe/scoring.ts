/**
 * Megosztott cég adatminőség pontozás.
 * Ugyanaz a képlet, mint a CompanyHealthPanel-ben (D2 elemzés szerint).
 */
export type CompanyForScore = {
  id: string;
  name: string;
  company_type?: string | null;
  website?: string | null;
  tax_number?: string | null;
};
export type ContactForScore = { email?: string | null; phone?: string | null };

export type CompanyScore = {
  pct: number;
  missing: string[];
  band: "green" | "yellow" | "red";
};

export const SCORE_BAND_LABEL = {
  green:  "Teljes",
  yellow: "Részleges",
  red:    "Hiányos",
} as const;

export function computeCompanyScore(company: CompanyForScore, contacts: ContactForScore[]): CompanyScore {
  const isPersonal = company.company_type === "maganszemely";
  const hasContact = contacts.length > 0;
  const hasEmail   = contacts.some((c) => !!c.email);
  const hasPhone   = contacts.some((c) => !!c.phone);

  const items: Array<{ key: string; label: string; ok: boolean; weight: number }> = isPersonal
    ? [
        { key: "name",          label: "Név",                    ok: !!company.name, weight: 25 },
        { key: "contact_email", label: "Email",                  ok: hasEmail,       weight: 35 },
        { key: "contact_phone", label: "Telefon",                ok: hasPhone,       weight: 40 },
      ]
    : [
        { key: "name",          label: "Cégnév",                 ok: !!company.name,        weight: 15 },
        { key: "company_type",  label: "Cégforma",               ok: !!company.company_type,weight: 10 },
        { key: "tax_number",    label: "Adószám",                ok: !!company.tax_number,  weight: 20 },
        { key: "website",       label: "Weboldal",               ok: !!company.website,     weight: 20 },
        { key: "contact",       label: "Kapcsolattartó",         ok: hasContact,            weight: 15 },
        { key: "contact_email", label: "Kapcsolattartó email",   ok: hasEmail,              weight: 10 },
        { key: "contact_phone", label: "Kapcsolattartó telefon", ok: hasPhone,              weight: 10 },
      ];

  const total = items.reduce((a, i) => a + i.weight, 0);
  const got   = items.reduce((a, i) => a + (i.ok ? i.weight : 0), 0);
  const pct   = Math.round((got / total) * 100);
  const missing = items.filter((i) => !i.ok).map((i) => i.label);
  const band: CompanyScore["band"] = pct >= 85 ? "green" : pct >= 50 ? "yellow" : "red";
  return { pct, missing, band };
}