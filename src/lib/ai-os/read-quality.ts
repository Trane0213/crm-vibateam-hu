import { z } from 'zod';
import { budapestTimestamp } from './adapters/crm-read-page';

/** Read IDs never gain authority from names, me, or an earlier assistant answer. */
export function validateReadIds(args: Record<string, unknown>) {
  for (const [key,value] of Object.entries(args)) {
    if ((key === 'id' || key.endsWith('_id')) && value !== undefined && value !== null) {
      if (!z.string().uuid().safeParse(value).success) throw new Error(`A(z) ${key} pontos rekordazonosítót igényel. Kereséssel azonosítsd az ügyet; ne találj ki azonosítót.`);
    }
  }
}

export function localModelDates(value: unknown, key=''): unknown {
  if (typeof value === 'string') return (key==='at'||key.endsWith('_at')||key==='due_date'||key==='due') ? budapestTimestamp(value) ?? value : value;
  if (Array.isArray(value)) return value.map(v=>localModelDates(v,key));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,localModelDates(v,k)]));
  return value;
}

export function groundedReadAnswer(answer:string,caveats:string[],role:string|null) {
  // Withhold contradicting prose rather than append a disclaimer to false facts.
  const unsafe = caveats.some(c=>c.includes('Gmailben')) && /nem érkezett|nem kapott|biztosan nincs.*válasz/i.test(answer)
    || caveats.some(c=>c.includes('TESZT-jelölés')) && /mivel.*nem valós|azért.*teszt/i.test(answer)
    || caveats.some(c=>c.includes('befejezett')) && /tervezett.*completed|egy tervezett és/i.test(answer);
  if(unsafe)return `${caveats.join('\n')}\n\nA részletes értelmezés bizonytalan; a mentett előzmények alapján pontosítsuk a következő lépést.`;
  if(/lead tulajdonosa|ügy tulajdonosa/i.test(answer))return roleAdvice(role);
  return `${answer}${caveats.length?'\n\n'+caveats.join('\n'):''}`;
}

export function roleAdvice(role: string | null) {
  return role === 'owner' ? 'A tulajdonosi (Owner) szerepkör nyitott ügy felelősét külön jóváhagyással adhatja át; megnyert vagy elveszett ügy nem adható át.' : 'Sales munkatársként nem adhatsz át felelőst, akkor sem, ha az ügy hozzád tartozik. Ezt a tulajdonosi (Owner) szerepkör intézheti nyitott ügyön, külön jóváhagyással.';
}

export function readCaveats(output: unknown): string[] {
  if (!output || typeof output !== 'object') return [];
  const data=(output as {data?:Record<string,unknown>}).data;
  if (!data) return [];
  const caveats:string[]=[];
  if (data.mailbox_context || data.mailboxes) caveats.push('Csak a CRM-ben tárolt, jogosultan elérhető levelezést ellenőriztem. Üres lista nem bizonyítja, hogy nem érkezett ügyfélválasz a Gmailben.');
  if (data.company) caveats.push('A hiányzó céges adatok okát a nyilvántartás nem igazolja; a TESZT-jelölésből ezt nem következtetem ki.');
  if (data.section==='followups' && Array.isArray(data.items)) {
    const done=data.items.filter((r:Record<string,unknown>)=>r.completed===true).length;
    const open=data.items.filter((r:Record<string,unknown>)=>r.completed===false).length;
    caveats.push(`Az ellenőrzött előzményoldalon ${done} befejezett és ${open} nyitott utánkövetés van. Befejezett rekord nem elvégzendő teendő.`);
  }
  return caveats;
}
/** Az adott futásban user-RLS-sel visszaolvasott lead → mentett company_id párok gyűjtése. */
export function collectLeadCompanies(toolName: string, output: unknown, into: Map<string, string>) {
  if (!/lead/.test(toolName)) return;
  const visit = (v: unknown, depth: number) => {
    if (!v || typeof v !== "object" || depth > 4) return;
    if (Array.isArray(v)) { for (const x of v) visit(x, depth + 1); return; }
    const o = v as Record<string, unknown>;
    if (typeof o.id === "string" && typeof o.company_id === "string" && ("assigned_to" in o || "status" in o) && !("quote_kind" in o)) into.set(o.id, o.company_id);
    for (const k of ["data", "items", "lead"]) if (k in o) visit(o[k], depth + 1);
  };
  visit(output, 0);
}

/** Olvasó hívásban a company_id helyére tett, ugyanebben a futásban látott lead-ID-t a lead mentett cégére cseréli. */
export function correctLeadAsCompany(args: Record<string, unknown>, leads: Map<string, string>): { args: Record<string, unknown>; corrected: boolean } {
  const id = args.company_id;
  if (typeof id !== "string" || !leads.has(id)) return { args, corrected: false };
  return { args: { ...args, company_id: leads.get(id)! }, corrected: true };
}
