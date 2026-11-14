import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  CONTRACT_NOT_IN_CRM, CONTRACT_PHASE_LABEL, CONTRACT_RECORD_AVAILABLE, contractItemsBesideHandoff, contractNext, contractPrepSummary,
  contractTargetLink, ownerDecisionPrep, type ContractPrepInput, type ContractQuote,
} from "./contract-prep";
import { loadContractPrepInput } from "./contract-prep-loader";
import { handoffItems, handoffSummary } from "@/lib/handoff/sales-pm-handoff";
import { canAccessRoute, type RoleSlug } from "@/lib/permissions";
import { contractPrepWarnings } from "@/lib/owner/owner-day-flow";

const NOW = "2026-11-14T10:00:00Z";
const L = "11111111-1111-4111-8111-111111111111";
const quote = (o: Partial<ContractQuote> = {}): ContractQuote => ({
  id: "q1", title: "TESZT ajánlat", status: "accepted", sent_at: "2026-11-02T09:00:00Z", is_current: true, valid_until: "2026-12-31",
  site_address: "TESZT utca 1.", total_amount: 1_000_000, manual_net_amount: null, tax_percent: 27,
  template_terms: { payment: "30 nap", warranty: "12 hó" }, version: 1, alternative_key: "A", ...o,
});
const base = (o: Partial<ContractPrepInput> = {}): ContractPrepInput => ({
  lead: { id: L, status: "contract", company_id: "c1", contact_id: "p1", assigned_to: "s1", pipeline_entered_at: "2026-11-01T00:00:00Z" },
  company: { id: "c1", name: "TESZT Kft.", company_type: "generalkivitelezo", tax_number: "12345678-2-42" },
  contact: { id: "p1", name: "TESZT Kapcsolat", email: "teszt@example.invalid", email_invalid: false },
  quotes: [quote()], termsDocs: [], project: null, contractDocs: [], now: NOW, ...o,
});
const state = (s: ReturnType<typeof contractPrepSummary>, k: string) => s.items.find((i) => i.key === k)!.state;
const can = (r: RoleSlug) => (p: string) => canAccessRoute(r, p);

describe("szerződés-előkészítés — nincs szimulált jóváhagyás", () => {
  it("szerződés-nyilvántartás / jóváhagyás / e-aláírás nincs a CRM-ben", () => {
    expect(CONTRACT_RECORD_AVAILABLE).toBe(false);
    expect(CONTRACT_NOT_IN_CRM.map((n) => n.key)).toEqual(expect.arrayContaining(["record", "approval", "esign"]));
    for (const l of Object.values(CONTRACT_PHASE_LABEL)) expect(l.toLowerCase()).not.toMatch(/jóváhagyva|aláírva/);
  });
  it("teljes adat → előkészítve, de a szöveg kimondja, hogy ez nem jóváhagyás", () => {
    const s = contractPrepSummary(base({ project: { id: "pr1", title: "P", address: null, status: "atadas", lead_id: L }, lead: { ...base().lead!, status: "won" },
      contractDocs: [{ id: "d1", name: "szerzodes.pdf", file_url: "k", created_at: NOW, parent_id: "pr1", table: "project_documents" }] }));
    expect(s.phase).toBe("ready");
    expect(s.items.every((i) => i.state === "ok")).toBe(true);
    expect(CONTRACT_PHASE_LABEL.ready).toContain("nem jóváhagyás");
    expect(s.items.find((i) => i.key === "contract_doc")!.detail).toContain("nem igazolja az aláírást");
    expect(contractNext(s, "owner").detail).toContain("nem jóváhagyás");
  });
  it("megnyerés előtt a szerződésfájl csak ellenőrizendő, sosem rendben", () => {
    const s = contractPrepSummary(base());
    expect(state(s, "contract_doc")).toBe("pending");
    expect(s.phase).toBe("check");
    expect(s.canWin).toBe(true);
  });
});

describe("hiányzó és hibás adat", () => {
  it("ügyfél nélkül: hiány, Sales-pótlás, Megnyertük nem lehetséges", () => {
    const s = contractPrepSummary(base({ lead: { ...base().lead!, company_id: null }, company: null }));
    expect(state(s, "customer")).toBe("missing");
    expect(state(s, "customer_identity")).toBe("unknown");
    expect(s.phase).toBe("sales_gap");
    expect(s.canWin).toBe(false);
  });
  it("nem olvasható (RLS) lead → NINCS ADAT, semmi sem rendben", () => {
    const s = contractPrepSummary(base({ lead: undefined, company: undefined, contact: undefined, quotes: undefined }));
    for (const k of ["stage", "responsible", "customer", "contact", "accepted", "sent", "amount"]) expect(state(s, k)).toBe("unknown");
  });
  it("be nem tölthető ajánlatok → NINCS ADAT, nem hiány", () => {
    const s = contractPrepSummary(base({ quotes: undefined }));
    expect(["accepted", "sent", "amount", "validity", "terms"].map((k) => state(s, k))).toEqual(["unknown", "unknown", "unknown", "unknown", "unknown"]);
    expect(s.phase).toBe("unknown");
  });
  it("nincs elfogadott verzió: hiány, a függő tételek NINCS ADAT", () => {
    const s = contractPrepSummary(base({ quotes: [quote({ status: "sent" })] }));
    expect(state(s, "accepted")).toBe("missing");
    expect(s.items.find((i) => i.key === "amount")!.detail).toContain("NINCS ADAT");
  });
  it("visszavont / nem aktuális elfogadott verzió nem számít", () => {
    const s = contractPrepSummary(base({ quotes: [quote({ is_current: false })] }));
    expect(state(s, "accepted")).toBe("missing");
  });
  it("magánszemély: személyes adatok NINCS ADAT; cég adószám nélkül hiány; típus nélkül ellenőrizendő", () => {
    const priv = contractPrepSummary(base({ company: { id: "c1", name: "TESZT Magán", company_type: "maganszemely", tax_number: null } }));
    expect(state(priv, "customer_identity")).toBe("pending");
    expect(priv.items.find((i) => i.key === "customer_identity")!.detail).toContain("NINCS ADAT");
    expect(state(contractPrepSummary(base({ company: { ...base().company!, tax_number: " " } })), "customer_identity")).toBe("missing");
    expect(state(contractPrepSummary(base({ company: { ...base().company!, company_type: null } })), "customer_identity")).toBe("pending");
  });
  it("kapcsolattartó e-mail nélkül vagy hibás címmel ellenőrizendő", () => {
    expect(state(contractPrepSummary(base({ contact: { id: "p1", name: "X", email: null } })), "contact")).toBe("pending");
    expect(state(contractPrepSummary(base({ contact: { id: "p1", name: "X", email: "a@b.invalid", email_invalid: true } })), "contact")).toBe("pending");
    expect(state(contractPrepSummary(base({ lead: { ...base().lead!, contact_id: null }, contact: null })), "contact")).toBe("missing");
  });
  it("összeg: hiányzó → hiány, tételes/megadott eltérés → ellenőrizendő", () => {
    expect(state(contractPrepSummary(base({ quotes: [quote({ total_amount: 0, manual_net_amount: null })] })), "amount")).toBe("missing");
    expect(state(contractPrepSummary(base({ quotes: [quote({ total_amount: 1000, manual_net_amount: 2000 })] })), "amount")).toBe("pending");
    expect(state(contractPrepSummary(base({ quotes: [quote({ total_amount: 0, manual_net_amount: 5000 })] })), "amount")).toBe("ok");
  });
  it("érvényesség budapesti nap szerint; lejárt / hiányzó → ellenőrizendő", () => {
    expect(state(contractPrepSummary(base({ quotes: [quote({ valid_until: "2026-11-13" })] })), "validity")).toBe("pending");
    expect(state(contractPrepSummary(base({ quotes: [quote({ valid_until: "2026-11-14" })] })), "validity")).toBe("ok");
    expect(state(contractPrepSummary(base({ quotes: [quote({ valid_until: null })] })), "validity")).toBe("pending");
  });
  it("feltételek: sablon fizetési feltétel vagy feltétel-fájl kell", () => {
    expect(state(contractPrepSummary(base({ quotes: [quote({ template_terms: null })] })), "terms")).toBe("pending");
    expect(state(contractPrepSummary(base({ quotes: [quote({ template_terms: { warranty: "x" } })] })), "terms")).toBe("pending");
    expect(state(contractPrepSummary(base({ quotes: [quote({ template_terms: null })], termsDocs: [{ id: "t", name: "f.pdf", file_url: "k", created_at: NOW, parent_id: "q1", table: "quote_documents" }] })), "terms")).toBe("ok");
    expect(state(contractPrepSummary(base({ quotes: [quote({ template_terms: null })], termsDocs: [{ id: "t", name: "f.pdf", file_url: "k", created_at: NOW, parent_id: "MÁSIK", table: "quote_documents" }] })), "terms")).toBe("pending");
    expect(state(contractPrepSummary(base({ quotes: [quote({ template_terms: null })], termsDocs: undefined })), "terms")).toBe("unknown");
  });
  it("projekt be nem tölthető → szerződésfájl NINCS ADAT", () => {
    expect(state(contractPrepSummary(base({ project: undefined })), "contract_doc")).toBe("unknown");
    expect(state(contractPrepSummary(base({ project: { id: "pr", title: null, address: null, status: "atadas", lead_id: L }, contractDocs: undefined })), "contract_doc")).toBe("unknown");
  });
  it("Sales-ügy nélküli projekt: a projekt ügyfele a megrendelő, a lead NINCS ÖSSZEKÖTVE", () => {
    const s = contractPrepSummary(base({ lead: null, project: { id: "pr", title: null, address: "X", status: "kivitelezes", lead_id: null, company_id: "c1" }, contact: null, quotes: [] }));
    expect(state(s, "stage")).toBe("not_linked");
    expect(state(s, "customer")).toBe("ok");
  });
  it("korai szakasz elfogadott ajánlat nélkül nem releváns", () => {
    expect(contractPrepSummary(base({ lead: { ...base().lead!, status: "quote_prep" }, quotes: [quote({ status: "draft" })] })).phase).toBe("not_relevant");
    expect(contractPrepSummary(base({ lead: { ...base().lead!, status: "follow_up" } })).relevant).toBe(true);
  });
});

describe("tulajdonosi döntés-előkészítés és deduplikáció", () => {
  it("felelős nélkül tulajdonosi döntés", () => {
    const s = contractPrepSummary(base({ lead: { ...base().lead!, assigned_to: null } }));
    expect(s.phase).toBe("owner_gap");
    expect(s.ownerDecisions.map((i) => i.key)).toEqual(["responsible"]);
  });
  it("több elfogadott verzió: tulajdonosi döntés, a CRM nem választ", () => {
    const s = contractPrepSummary(base({ quotes: [quote(), quote({ id: "q2", alternative_key: "B" })] }));
    const a = s.items.find((i) => i.key === "accepted")!;
    expect(a.state).toBe("pending"); expect(a.role).toBe("owner"); expect(a.ownerDecision).toBe(true);
    expect(a.detail).toContain("A CRM nem dönt");
    expect(state(s, "amount")).toBe("unknown");
    expect(s.phase).toBe("owner_gap");
  });
  it("szerződés + átadás tulajdonosi tételei témánként egyszer, determinisztikusan", () => {
    const c = contractPrepSummary(base({ lead: { ...base().lead!, assigned_to: null }, quotes: [quote(), quote({ id: "q2" })] }));
    const h = handoffSummary({ project: { id: "pr", status: "atadas", lead_id: L, project_manager_user_id: null }, quoteCount: 2, acceptedCount: 0, contactCount: 0, contractDocCount: 0, taskCount: 0, now: NOW });
    const d1 = ownerDecisionPrep(c, h);
    expect(d1.map((d) => d.topic)).toEqual(["responsible", "accepted_version", "pm"]);
    expect(new Set(d1.map((d) => d.topic)).size).toBe(d1.length);
    expect(ownerDecisionPrep(c, h)).toEqual(d1);
    expect(ownerDecisionPrep(null, null)).toEqual([]);
  });
  it("az Átadás fülön egyetlen tétel sem szerepel kétszer (átadás + szerződés)", () => {
    const shown = contractItemsBesideHandoff(contractPrepSummary(base()).items).map((i) => i.key as string);
    const handoffKeys = handoffItems({ project: { id: "pr", status: "atadas", lead_id: L }, quoteCount: 1, acceptedCount: 1, contactCount: 1, contractDocCount: 0, taskCount: 0 }).map((i) => i.key as string);
    expect(shown.filter((k) => handoffKeys.includes(k))).toEqual([]);
    expect(shown).not.toContain("contact"); expect(shown).not.toContain("contract_doc"); expect(shown).not.toContain("accepted");
  });
  it("Mai vezetői munka figyelmeztetései ugyanabból a modellből", () => {
    const lead = { id: L, status: "contract", summary: null, company_id: "c1", contact_id: "p1", assigned_to: "s1", next_step_due_at: null, pipeline_entered_at: NOW };
    const q = { id: "q1", lead_id: L, title: null, status: "accepted", is_current: true, net: 100 };
    expect(contractPrepWarnings(lead, [q, { ...q, id: "q2" }])).toEqual(["Több elfogadott ajánlatverzió — tulajdonosi döntés: melyik a szerződés alapja"]);
    expect(contractPrepWarnings(lead, [{ ...q, lead_id: "MÁSIK" }])).toEqual(["Nincs elfogadottnak jelölt ajánlat"]);
  });
});

describe("szerepkör szerinti hivatkozás és következő lépés (negatív jogosultság)", () => {
  it("PM nem kap Pipeline- és Leadek-hivatkozást; Marketing nem nyit ajánlatot/projektet", () => {
    expect(contractTargetLink({ kind: "pipeline", leadId: L }, can("project_manager"))).toBeNull();
    expect(contractTargetLink({ kind: "lead", leadId: L }, can("project_manager"))).toBeNull();
    expect(contractTargetLink({ kind: "quote", quoteId: "q1" }, can("marketing"))).toBeNull();
    expect(contractTargetLink({ kind: "project", projectId: "p", tab: "docs" }, can("marketing"))).toBeNull();
    expect(contractTargetLink({ kind: "none" }, can("owner"))).toBeNull();
  });
  it("Sales és Owner a forrásra jut; projekt-hivatkozás a megfelelő fülre", () => {
    expect(contractTargetLink({ kind: "pipeline", leadId: L }, can("sales"))).toMatchObject({ to: "/sales/leads", search: { lead: L } });
    expect(contractTargetLink({ kind: "project", projectId: "p", tab: "docs" }, can("project_manager"))).toMatchObject({ to: "/projects/$id", params: { id: "p" }, search: { tab: "docs" } });
    expect(contractTargetLink({ kind: "customer", companyId: "c1" }, can("owner"))).toMatchObject({ to: "/customers/$id" });
  });
  it("következő lépés: Sales saját hiánya; PM-nek nem a feladata; Owner a döntésre", () => {
    const s = contractPrepSummary(base({ company: { ...base().company!, tax_number: null } }));
    expect(contractNext(s, "sales")).toMatchObject({ mine: true });
    expect(contractNext(s, "sales").title).toContain("adószáma");
    expect(contractNext(s, "project_manager").detail).toContain("nem a te szerepköröd");
    const o = contractPrepSummary(base({ lead: { ...base().lead!, assigned_to: null } }));
    expect(contractNext(o, "owner")).toMatchObject({ mine: true, item: expect.objectContaining({ key: "responsible" }) });
    expect(contractNext(o, "sales").waitingFor).toBe("owner");
  });
});

/** Hamis, csak olvasó kliens: minden hívott metódust rögzít. */
function fakeClient(tables: Record<string, { data?: unknown; error?: unknown }>) {
  const calls: string[] = [];
  const from = (t: string) => {
    const res = tables[t] ?? { data: [] };
    const chain: any = new Proxy({}, {
      get(_o, k: string) {
        if (k === "then") return (ok: any, bad: any) => Promise.resolve({ data: res.data ?? null, error: res.error ?? null }).then(ok, bad);
        return (..._a: unknown[]) => { calls.push(`${t}.${k}`); return chain; };
      },
    });
    return chain;
  };
  return { client: { from }, calls };
}

describe("betöltő — csak olvas, hibás forrás NINCS ADAT", () => {
  it("csak select hívások, írás/RPC nincs", async () => {
    const { client, calls } = fakeClient({
      leads: { data: base().lead }, companies: { data: base().company }, contacts: { data: base().contact },
      quotes: { data: [quote()] }, projects: { data: [] }, quote_documents: { data: [] }, project_documents: { data: [] },
    });
    const inp = await loadContractPrepInput(client, { leadId: L });
    expect(calls.some((c) => /\.(insert|update|delete|upsert|rpc)$/.test(c))).toBe(false);
    expect(calls).toContain("leads.select");
    expect(inp.project).toBeNull();
    expect(contractPrepSummary({ ...inp, now: NOW }).phase).toBe("check");
  });
  it("cég-olvasási hiba → NINCS ADAT; RLS által rejtett lead → NINCS ADAT", async () => {
    const a = await loadContractPrepInput(fakeClient({ leads: { data: base().lead }, companies: { error: { message: "x" } }, contacts: { data: base().contact }, quotes: { data: [quote()] } }).client, { leadId: L });
    expect(a.company).toBeUndefined();
    expect(state(contractPrepSummary({ ...a, now: NOW }), "customer")).toBe("unknown");
    const b = await loadContractPrepInput(fakeClient({ leads: { data: null } }).client, { leadId: L });
    expect(b.lead).toBeUndefined();
  });
  it("ajánlat-olvasási hiba → feltétel-dokumentum sem ismert", async () => {
    const r = await loadContractPrepInput(fakeClient({ leads: { data: base().lead }, quotes: { error: { message: "x" } } }).client, { leadId: L });
    expect(r.quotes).toBeUndefined(); expect(r.termsDocs).toBeUndefined();
  });
});

describe("forrásszintű biztonsági határ", () => {
  const src = (p: string) => readFileSync(p, "utf8");
  it("modell, betöltő, horog és panel nem ír, nem használ admin klienst", () => {
    for (const p of ["src/lib/contract/contract-prep.ts", "src/lib/contract/contract-prep-loader.ts", "src/hooks/use-contract-prep.ts", "src/components/contract/contract-prep-panel.tsx"]) {
      const s = src(p);
      expect(s).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/);
      expect(s).not.toMatch(/client\.server|supabaseAdmin|service_role/);
    }
  });
  it("a panel fájlt csak a meglévő jogosultság-ellenőrzött letöltéssel nyit, törlést nem kínál", () => {
    const s = src("src/components/contract/contract-prep-panel.tsx");
    expect(s).toContain("r2PresignDownload");
    expect(s).not.toContain("r2DeleteDocument");
    expect(s).not.toMatch(/Jóváhagyom|Aláírom|Jóváhagyva/);
  });
  it("Pipeline adatlap a közös panelt használja; a megnyerés továbbra is a meglévő ablakon át", () => {
    const s = src("src/components/pipeline/pipeline-detail-sheet.tsx");
    expect(s).toContain("<ContractPrepPanel");
    expect(s).not.toContain("contractReadiness(");
    expect(s).toContain("<CreateProjectDialog");
  });
});
