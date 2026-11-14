/**
 * P7 — reprodukálható üzleti forgatókönyvek TESZT-adatai. Minden adat kitalált és „TESZT” jelölésű;
 * valós ügyfél, ár, jegyzőkönyv vagy levél nincs benne. A „Sopron út 66.” csak a forgatókönyv neve
 * (a valós VBF-ajánlatkérés kérdésszerkezetét követi), a hibapontok szövege kitalált.
 */
import { materialLaborBudget, sourcesFor } from "@/lib/pricing/__fixtures__/workbooks";
import type { PackageRequest } from "@/lib/quote-package/package-schema";
import { DEFAULT_COMMERCIAL, type CalcInput, type Rate } from "@/lib/viba-offer/calc-model";

type Row = Record<string, unknown>;
export type Tables = Record<string, Row[]>;

/** Csak olvasó, szűrő Supabase-utánzat; minden hívást naplóz, hogy az írásmentesség ellenőrizhető legyen. */
export function fakeSb(role: string | null, tables: Tables) {
  const calls: { table: string; op: string }[] = [];
  const from = (table: string) => {
    const filters: [string, string, unknown][] = []; let op = "select";
    const run = () => { calls.push({ table, op }); return (tables[table] ?? []).filter((r) => filters.every(([k, c, v]) => (k === "eq" ? r[c] === v : k === "in" ? (v as unknown[]).includes(r[c]) : true))); };
    const b: any = {
      select: () => b, eq: (c: string, v: unknown) => (filters.push(["eq", c, v]), b), in: (c: string, v: unknown[]) => (filters.push(["in", c, v]), b),
      order: () => b, limit: () => b, gte: () => b, lt: () => b,
      insert: () => { op = "insert"; return b; }, update: () => { op = "update"; return b; }, delete: () => { op = "delete"; return b; }, upsert: () => { op = "upsert"; return b; },
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      then: (res: (v: unknown) => unknown) => Promise.resolve({ data: run(), error: null }).then(res),
    };
    return b;
  };
  const rpc = async (name: string) => (name === "crm_role_of" ? { data: role, error: null } : { data: [], error: null });
  return { sb: { from, rpc } as never, calls };
}

// ---------- A) Alvállalkozói kapott Excel (és ugyanaz teljes kivitelezői módban) ----------
export const RECEIVED = (() => {
  const Q = "aaaaaaaa-0000-4000-8000-00000000a001", B = "aaaaaaaa-0000-4000-8000-00000000b001", N = 12;
  const budget = materialLaborBudget(N);
  const quote: Row = { id: Q, title: "TESZT P7 csarnok – alvállalkozói", version: 1, alternative_key: "A", quote_kind: "received_budget", scope_type: "labor_only",
    technical_scope: "Erősáramú szerelés a kiírás szerint", exclusions: "Gyengeáramú rendszerek", valid_until: "2026-12-31", manual_net_amount: null, locked_at: null, status: "draft", contact_id: null, lead_id: null, project_id: null };
  const budgetDoc: Row = { id: B, quote_id: Q, name: "TESZT_P7_arazatlan.xlsx", file_url: `quote-documents/${Q}/unpriced_budget/b.xlsx`, size_bytes: budget.length, document_type: "unpriced_budget", created_at: "2026-11-15" };
  const input: PackageRequest = { quoteId: Q, budgetDocumentId: null, overrides: {}, template: null, includeFiles: true };
  return { Q, B, N, budget, quote, budgetDoc, input, sources: () => sourcesFor(N), asOf: "2026-11-15" };
})();

// ---------- B) Saját teljes kivitelezői ajánlat (családi ház m², anyag + munkadíj) ----------
const r = (huf: number, note: string, basis: Rate["basis"] = "sell"): Rate => ({ huf, basis, source: "manual", note });
export function ownFullConstruction(over: { area?: number | null; areaStatus?: "measured" | "estimated" | "unknown"; mode?: CalcInput["mode"] } = {}): CalcInput {
  return {
    mode: over.mode ?? "material_labor", commercial: DEFAULT_COMMERCIAL,
    profile: {
      profile: "house_sqm", areaM2: over.area === undefined ? 140 : over.area, areaStatus: over.areaStatus ?? "measured", packageLabel: "TESZT Közép", packageVersion: "TESZT-v1",
      content: { outlets: "included", distribution: "included", cabling: "included", devices: "included", low_voltage: "excluded", metering: "included" },
      exclusionsNote: "Gyengeáramú rendszerek kiépítése.", conditionsNote: "TESZT feltétel: új építésű, födém alatti szerelés.", detailedPlan: false,
      materialPerM2: r(9000, "TESZT anyagdíj, nem VIBA-tarifa"), laborPerM2: r(7000, "TESZT munkadíj, nem VIBA-tarifa"),
      extras: [
        { id: "x_ev", group: "Többlettételek", name: "Elektromos autó töltő kiállás", unit: "db", qty: 1, qtyStatus: "measured", material: r(60000, "TESZT"), labor: r(40000, "TESZT") },
        { id: "x_kert", group: "Többlettételek", name: "Kerti világítás", unit: "db", qty: 0, qtyStatus: "measured", labor: r(15000, "TESZT") },
        { id: "x_pv", group: "Többlettételek", name: "Napelemes rendszer előkészítés", unit: "klt", qty: 1, qtyStatus: "measured", labor: null },
      ],
    },
  };
}

// ---------- C) VBF — „Sopron út 66.” forgatókönyv (kitalált hibapontok) ----------
export const VBF_TESZT_TEXT = `TESZT – VBF jegyzőkönyv minta, „Sopron út 66.” forgatókönyv (kitalált adatok, nem valós jegyzőkönyv)
Megállapítások:
1. A főelosztóban a PE sín bekötése hiányzik, áramütés veszélye, azonnali javítás szükséges.
2. A 2. emeleti lépcsőházi lámpatest burkolata sérült, cseréje javasolt.
3. A pincei elosztó feliratozása hiányos.
4. Megjegyzés: a felülvizsgálat időpontja 2026.10.20.
- EPH csomópont kötése laza, MSZ HD 60364-5-54 szerint utánhúzandó
`;
