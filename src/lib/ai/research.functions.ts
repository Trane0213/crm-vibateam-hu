/**
 * Marketing Agent — Cégkutatás server function.
 * Lovable AI Gateway-n keresztül hívja a Gemini modellt és strukturált
 * (JSON) választ kér. Az eredmény közvetlenül a UI tábla forrása.
 */
import { createServerFn } from "@tanstack/react-start";
import { aiChat } from "@/lib/ai/provider.server";

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

// Ha OPENAI_API_KEY van beállítva, az OpenAI provider default modelljét használjuk.
// Csak ha a workspace kifejezetten Gemini-t akar (Lovable Gateway), állítsa be a RESEARCH_MODEL-t.
const RESEARCH_MODEL = process.env.RESEARCH_MODEL
  ?? process.env.OPENAI_MODEL
  ?? (process.env.OPENAI_API_KEY ? "gpt-4o-mini" : "google/gemini-3-flash-preview");

function buildPrompt(input: ResearchInput): string {
  const count = Math.min(Math.max(input.count ?? 15, 1), 50);
  const area = input.area?.trim() || "Magyarország";
  return [
    `Keress ${count} valós magyar céget az alábbi szempontok szerint:`,
    `- Tevékenység / kulcsszó: ${input.keyword}`,
    `- Terület: ${area}`,
    "",
    "Csak olyan cégeket adj vissza, amelyek tényleg léteznek és publikus elérhetőséggel rendelkeznek.",
    "Ne találj ki céget, weboldalt, telefonszámot vagy email címet. Ha valamelyik mező nem ismert, hagyd null-on.",
    "",
    "Válaszodat KIZÁRÓLAG az alábbi JSON sémában add meg, semmilyen kommentárt vagy markdownt ne tegyél köré:",
    `{ "results": [ { "company_name": "", "website": "", "email": "", "phone": "", "city": "", "reason": "" }, ... ] }`,
    "",
    "A `reason` mezőbe írj egy rövid (max 1 mondat) indoklást, hogy miért illik a célcsoportba.",
  ].join("\n");
}

export const researchCompanies = createServerFn({ method: "POST" })
  .inputValidator((input: ResearchInput) => {
    if (!input?.keyword || typeof input.keyword !== "string") {
      throw new Error("Hiányzó kulcsszó.");
    }
    return {
      keyword: input.keyword.trim(),
      area: input.area?.trim() || null,
      count: Math.min(Math.max(Number(input.count) || 15, 1), 50),
    } satisfies ResearchInput;
  })
  .handler(async ({ data }) => {
    const prompt = buildPrompt(data);
    const messages = [
      {
        role: "system",
        content:
          "Magyar B2B cégkutató asszisztens vagy. Csak strukturált JSON-t adsz vissza, mindig magyar cégekről.",
      },
      { role: "user", content: prompt },
    ];
    const res = await aiChat(messages, RESEARCH_MODEL);
    const raw = (res.text ?? "").trim();
    const jsonStr = extractJson(raw);
    let parsed: any = null;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e: any) {
      throw new Error("AI nem JSON választ adott: " + raw.slice(0, 300));
    }
    const list: ResearchCompany[] = Array.isArray(parsed?.results) ? parsed.results : [];
    const cleaned = list
      .map((r) => ({
        company_name: String(r?.company_name ?? "").trim(),
        website: cleanStr(r?.website),
        email: cleanStr(r?.email),
        phone: cleanStr(r?.phone),
        city: cleanStr(r?.city),
        reason: cleanStr(r?.reason),
      }))
      .filter((r) => r.company_name.length > 1);
    return { results: cleaned, model: RESEARCH_MODEL };
  });

function cleanStr(v: any): string | null {
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