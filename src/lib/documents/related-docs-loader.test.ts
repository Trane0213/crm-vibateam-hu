import { describe, expect, it } from "vitest";
import { loadRelatedDocs, quoteLabel, sourceStateText } from "./related-docs-loader";

const L = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const P = "11111111-1111-4111-8111-111111111111";
const C = "22222222-2222-4222-8222-222222222222";
const Q = "33333333-3333-4333-8333-333333333333";
const Q2 = "33333333-3333-4333-8333-333333333334";

type Res = { data?: unknown; error?: unknown };
function fakeClient(tables: Record<string, Res | Res[]>) {
  const calls: { table: string; ops: string[]; args: unknown[][] }[] = [];
  const seen: Record<string, number> = {};
  const from = (t: string) => {
    const conf = tables[t];
    const i = seen[t] = (seen[t] ?? -1) + 1;
    const res: Res = Array.isArray(conf) ? conf[Math.min(i, conf.length - 1)] : conf ?? { data: [] };
    const rec = { table: t, ops: [] as string[], args: [] as unknown[][] };
    calls.push(rec);
    const chain: any = new Proxy({}, {
      get(_o, k: string) {
        if (k === "then") return (ok: any, bad: any) => Promise.resolve({ data: res.data ?? null, error: res.error ?? null }).then(ok, bad);
        return (...a: unknown[]) => { rec.ops.push(k); rec.args.push(a); return chain; };
      },
    });
    return chain;
  };
  return { client: { from }, calls };
}
const ALL = ["project_documents", "company_documents", "quote_documents"] as const;

describe("loadRelatedDocs", () => {
  it("lead kontextus: a lead ajánlatai és projektje alapján olvas, címkékkel", async () => {
    const { client, calls } = fakeClient({
      quotes: [{ data: [{ id: Q }, { id: Q2 }] }, { data: [{ id: Q, title: "Tetőfelújítás", version: 2, alternative_key: "A" }] }],
      projects: [{ data: [{ id: P }] }, { data: [{ id: P, title: "Tető 2026" }] }],
      project_documents: { data: [{ id: "p1", name: "Fotó.jpg", file_url: "k1", document_type: "photo", created_at: "2026-11-01", project_id: P }] },
      company_documents: { data: [{ id: "c1", name: "Céginfó.pdf", file_url: "k2", document_type: "marketing", created_at: "2026-10-01", company_id: C }] },
      quote_documents: { data: [{ id: "q1", name: "Árazott.xlsx", file_url: "k3", document_type: "priced_budget", created_at: "2026-11-05", quote_id: Q }] },
      companies: { data: [{ id: C, name: "TESZT Kft." }] },
    });
    const r = await loadRelatedDocs(client, { leadId: L, companyIds: [C] }, [...ALL]);
    expect(r.states).toEqual({ project_documents: "ok", company_documents: "ok", quote_documents: "ok" });
    expect(r.docs.map((d) => d.uid)).toEqual(["quote_documents:q1", "project_documents:p1", "company_documents:c1"]);
    expect(r.docs[0].parentLabel).toBe("Tetőfelújítás v2 · A alt.");
    expect(r.docs[1].parentLabel).toBe("Tető 2026");
    expect(r.docs[2].parentLabel).toBe("TESZT Kft.");
    const qd = calls.find((c) => c.table === "quote_documents")!;
    expect(qd.args[qd.ops.indexOf("in")]).toEqual(["quote_id", [Q, Q2]]);
    const leadQuotes = calls.find((c) => c.table === "quotes")!;
    expect(leadQuotes.args[leadQuotes.ops.indexOf("eq")]).toEqual(["lead_id", L]);
  });

  it("egy forrás hibája NINCS ADAT, a többi megmarad", async () => {
    const { client } = fakeClient({
      company_documents: { error: { message: "permission denied" } },
      project_documents: { data: [{ id: "p1", name: "a.pdf", file_url: "k", project_id: P }] },
    });
    const r = await loadRelatedDocs(client, { projectIds: [P], companyIds: [C] }, [...ALL]);
    expect(r.states.company_documents).toBe("error");
    expect(r.states.project_documents).toBe("ok");
    expect(r.states.quote_documents).toBe("skipped");
    expect(r.docs).toHaveLength(1);
  });

  it("ha a lead ajánlatai nem olvashatók, az ajánlati forrás NINCS ADAT (nem „nincs fájl”)", async () => {
    const { client } = fakeClient({ quotes: { error: { message: "x" } }, projects: { data: [] } });
    const r = await loadRelatedDocs(client, { leadId: L }, [...ALL]);
    expect(r.states.quote_documents).toBe("error");
    expect(r.states.project_documents).toBe("skipped");
  });

  it("kapcsolódó rekord nélkül nem kérdez le (NINCS ÖSSZEKÖTVE), érvénytelen azonosítót kiszűr", async () => {
    const { client, calls } = fakeClient({});
    const r = await loadRelatedDocs(client, { companyIds: ["nem-uuid", null, undefined], projectIds: [] }, [...ALL]);
    expect(r.states).toEqual({ project_documents: "skipped", company_documents: "skipped", quote_documents: "skipped" });
    expect(calls).toHaveLength(0);
  });

  it("nem kért forrás rejtett, és nem is kérdezzük le (Marketing: csak ügyfél)", async () => {
    const { client, calls } = fakeClient({ company_documents: { data: [] } });
    const r = await loadRelatedDocs(client, { leadId: L, companyIds: [C], projectIds: [P], quoteIds: [Q] }, ["company_documents"]);
    expect(r.states.project_documents).toBe("hidden");
    expect(r.states.quote_documents).toBe("hidden");
    expect(calls.map((c) => c.table)).toEqual(["company_documents"]);
  });

  it("felső határ elérése = a lista nem teljes", async () => {
    const rows = [1, 2].map((i) => ({ id: `c${i}`, name: `${i}.pdf`, file_url: `k${i}`, company_id: C }));
    const { client } = fakeClient({ company_documents: { data: rows } });
    const r = await loadRelatedDocs(client, { companyIds: [C] }, ["company_documents"], { limit: 2 });
    expect(r.states.company_documents).toBe("truncated");
    expect(sourceStateText("truncated", 2, r.limit)).toContain("nem teljes");
  });

  it("Dokumentumtár (all): szülőszűrő nélkül, felső határral olvas", async () => {
    const { client, calls } = fakeClient({ quote_documents: { data: [{ id: "q1", file_url: "k", quote_id: Q }] } });
    const r = await loadRelatedDocs(client, { all: true }, ["quote_documents"]);
    const qd = calls.find((c) => c.table === "quote_documents")!;
    expect(qd.ops).not.toContain("in");
    expect(qd.args[qd.ops.indexOf("limit")]).toEqual([500]);
    expect(r.states.quote_documents).toBe("ok");
  });

  it("duplikált sorokat egyszer ad vissza; csak olvas", async () => {
    const row = { id: "p1", name: "a.pdf", file_url: "k", project_id: P };
    const { client, calls } = fakeClient({ project_documents: { data: [row, row] } });
    const r = await loadRelatedDocs(client, { projectIds: [P, P] }, ["project_documents"]);
    expect(r.docs).toHaveLength(1);
    for (const c of calls) for (const op of c.ops) expect(["select", "in", "eq", "order", "limit"]).toContain(op);
  });

  it("címkehiba nem bukja el a listát", async () => {
    const { client } = fakeClient({ project_documents: { data: [{ id: "p1", file_url: "k", project_id: P }] }, projects: { error: { message: "x" } } });
    const r = await loadRelatedDocs(client, { projectIds: [P] }, ["project_documents"]);
    expect(r.states.project_documents).toBe("ok");
    expect(r.docs[0].parentLabel).toBeNull();
  });

  it("ajánlatcímke és állapotszövegek", () => {
    expect(quoteLabel({ title: "", version: 1, alternative_key: null })).toBe("Ajánlat v1");
    expect(sourceStateText("error", 0, 200)).toContain("NINCS ADAT");
    expect(sourceStateText("skipped", 0, 200)).toBe("NINCS ÖSSZEKÖTVE");
    expect(sourceStateText("ok", 3, 200)).toBe("3 fájl");
  });
});
