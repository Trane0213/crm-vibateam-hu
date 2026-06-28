/**
 * AI OS — Sales Research server function.
 *
 * A `/sales/research` oldal hívja. A `research_companies` agentet futtatja
 * (tool nélkül, strukturált JSON kimenet). Nem érinti a régi `src/lib/ai/*`
 * réteget.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/middleware";

export type ResearchCompany = {
  company_name: string;
  website: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  reason: string | null;
};

export type ResearchInput = {
  keyword: string;
  area?: string | null;
  count?: number;
};

function validate(input: unknown): ResearchInput {
  const i = (input ?? {}) as ResearchInput;
  if (!i.keyword || typeof i.keyword !== "string") {
    throw new Error("Hiányzó kulcsszó.");
  }
  return {
    keyword: i.keyword.trim(),
    area: i.area?.trim() || null,
    count: Math.min(Math.max(Number(i.count) || 15, 1), 50),
  };
}

function buildPrompt(input: ResearchInput): string {
  const count = input.count ?? 15;
  const area = input.area || "Magyarország";
  return [
    `Keress ${count} valós magyar céget az alábbi szempontok szerint:`,
    `- Tevékenység / kulcsszó: ${input.keyword}`,
    `- Terület: ${area}`,
    ``,
    `Csak olyan cégeket adj vissza, amelyek tényleg léteznek és publikus elérhetőséggel rendelkeznek.`,
    `Ne találj ki céget, weboldalt, telefonszámot vagy email címet. Ha valamelyik mező nem ismert, hagyd null-on.`,
    ``,
    `Válaszodat KIZÁRÓLAG az alábbi JSON sémában add meg, semmilyen kommentárt vagy markdownt ne tegyél köré:`,
    `{ "results": [ { "company_name": "", "website": "", "email": "", "phone": "", "city": "", "reason": "" }, ... ] }`,
    ``,
    `A "reason" mezőbe írj egy rövid (max 1 mondat) indoklást, hogy miért illik a célcsoportba.`,
  ].join("\n");
}

function cleanStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s || s.toLowerCase() === "null" || s === "-") return null;
  return s;
}

function extractJson(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) return text.slice(first, last + 1);
  return text;
}

export const researchCompanies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data, context }) => {
    const { ensureBootstrapped } = await import("./bootstrap.server");
    const { runAgent } = await import("./runtime.server");
    const { getAdminClient } = await import("@/integrations/supabase/server");
    ensureBootstrapped();

    const admin = getAdminClient();
    const userPrompt = buildPrompt(data);

    const result = await runAgent(context.supabase, admin, {
      agentId: "research_companies",
      userId: context.userId,
      userRole: null,
      threadId: null,
      history: [{ role: "user", content: userPrompt }],
    });

    const raw = (result.finalText ?? "").trim();
    const jsonStr = extractJson(raw);
    let parsed: { results?: unknown } | null = null;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      throw new Error("AI nem JSON választ adott: " + raw.slice(0, 300));
    }
    const list = Array.isArray(parsed?.results) ? (parsed!.results as unknown[]) : [];
    const cleaned: ResearchCompany[] = list
      .map((r) => {
        const o = (r ?? {}) as Record<string, unknown>;
        return {
          company_name: String(o.company_name ?? "").trim(),
          website: cleanStr(o.website),
          email: cleanStr(o.email),
          phone: cleanStr(o.phone),
          city: cleanStr(o.city),
          reason: cleanStr(o.reason),
        };
      })
      .filter((r) => r.company_name.length > 1);

    return { results: cleaned, model: "ai-os:research_companies", runId: result.runId };
  });