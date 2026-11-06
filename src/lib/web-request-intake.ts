// Weboldali igény → CRM cég/kapcsolattartó felvétel döntése (tiszta logika).
// Nyers igényből soha nem lesz automatikusan lead: csak cég+kontakt jön létre,
// a Sales-átadás a meglévő marketinges céges munkafelületen történik.

export type IntakeMatch = { id: string; company_id: string | null };
export type IntakeDecision =
  | { kind: "existing"; companyId: string }
  | { kind: "ambiguous"; reason: string }
  | { kind: "blocked"; reason: string }
  | { kind: "create"; companyName: string; contactName: string };

export function normalizeEmail(e: string | null | undefined): string | null {
  const v = (e ?? "").trim().toLowerCase();
  return v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
}

export function decideIntake(input: {
  name: string | null;
  company_name: string | null;
  email: string | null;
  isTest: boolean;
  contactMatches: IntakeMatch[];
  companyNameMatches: { id: string }[];
}): IntakeDecision {
  const withCompany = input.contactMatches.filter((m) => m.company_id);
  const companies = new Set(withCompany.map((m) => m.company_id as string));
  if (companies.size === 1) return { kind: "existing", companyId: [...companies][0] };
  if (companies.size > 1) return { kind: "ambiguous", reason: "Ez az email több céghez tartozó kapcsolattartónál is szerepel — kézi ellenőrzés kell." };
  if (input.contactMatches.length > 0) return { kind: "ambiguous", reason: "Ez az email már szerepel egy cég nélküli kapcsolattartónál — kézi ellenőrzés kell." };
  if (input.companyNameMatches.length > 0) return { kind: "ambiguous", reason: "Már van azonos nevű cég — nyisd meg és kézzel döntsd el, ugyanaz-e." };
  const person = (input.name ?? "").trim();
  const base = (input.company_name ?? "").trim() || person;
  if (!base) return { kind: "blocked", reason: "Nincs név vagy cégnév — nem vehető fel." };
  if (!normalizeEmail(input.email) && !person) return { kind: "blocked", reason: "Nincs kapcsolattartó adat." };
  const prefix = input.isTest && !/^TESZT/i.test(base) ? "TESZT – " : "";
  return { kind: "create", companyName: prefix + base, contactName: person || base };
}
