/**
 * SERVER-ONLY. AI provider réteg.
 *
 * Provider választás futásidőben:
 *   1) ha OPENAI_API_KEY van → közvetlen OpenAI API (api.openai.com),
 *   2) különben fallback a Lovable AI Gateway-re (LOVABLE_API_KEY).
 *
 * Override: OPENAI_API_BASE_URL, OPENAI_MODEL.
 * Csak `createServerFn` handler törzséből importálható.
 */

type Provider = {
  name: "openai" | "lovable";
  key: string;
  baseUrl: string;
  defaultModel: string;
};

function resolveProvider(): Provider | null {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    return {
      name: "openai",
      key: openaiKey,
      baseUrl: (process.env.OPENAI_API_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, ""),
      defaultModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    };
  }
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (lovableKey) {
    return {
      name: "lovable",
      key: lovableKey,
      baseUrl: (process.env.OPENAI_API_BASE_URL ?? "https://ai.gateway.lovable.dev/v1").replace(/\/$/, ""),
      defaultModel: process.env.OPENAI_MODEL ?? "google/gemini-3-flash-preview",
    };
  }
  return null;
}

const _boot = resolveProvider();
export const OPENAI_API_URL = _boot?.baseUrl ?? "https://api.openai.com/v1";
export const DEFAULT_MODEL = _boot?.defaultModel ?? "gpt-4o-mini";

export type AiMessage = { role: "system" | "user" | "assistant"; content: string };

export type AiToolDef = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, any> };
};

export type AiToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type AiChatResult = {
  text: string;
  tool_calls: AiToolCall[];
  finish_reason: string | null;
};

// ============================================================
// Védőhálók (stabilitás)
// ============================================================
/** Egy hívás maximális ideje. Ezután AbortError + felhasználóbarát hiba. */
const REQUEST_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS ?? 60_000);
/** Maximum próbálkozások száma (1 = nincs retry; 3 = 2 retry). */
const MAX_ATTEMPTS = Math.max(1, Math.min(5, Number(process.env.AI_MAX_ATTEMPTS ?? 3)));
/** Egy üzenet content mező maximum hossza karakterben. Vágás előzi meg a token-robbanást. */
const MAX_CONTENT_CHARS = 24_000;
/** Maximális üzenet darabszám (system + history + user). Régebbiek kiesnek. */
const MAX_MESSAGES = 40;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Üzenetlista bemenetének normalizálása: trim, vágás, darabszám-korlát. */
function clampMessages(messages: any[]): any[] {
  if (!Array.isArray(messages) || messages.length === 0) return [];
  const out = messages.map((m) => {
    if (!m || typeof m !== "object") return m;
    const c = m.content;
    if (typeof c === "string" && c.length > MAX_CONTENT_CHARS) {
      return { ...m, content: c.slice(0, MAX_CONTENT_CHARS) + "\n…[csonkolva, túl hosszú]" };
    }
    return m;
  });
  if (out.length <= MAX_MESSAGES) return out;
  // Tartsuk meg az első system üzeneteket és a legutolsó (MAX_MESSAGES-1) elemet.
  const head: any[] = [];
  let i = 0;
  while (i < out.length && out[i]?.role === "system" && head.length < 3) {
    head.push(out[i]);
    i++;
  }
  const tail = out.slice(Math.max(i, out.length - (MAX_MESSAGES - head.length)));
  return [...head, ...tail];
}

/** Lefuttat egy fetch-et időkorláttal. */
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function friendlyError(provider: Provider, status: number, raw: string): Error {
  if (status === 401) return new Error(`AI: érvénytelen API kulcs (${provider.name}). Vedd fel a kapcsolatot az adminisztrátorral.`);
  if (status === 403) return new Error("AI: a kulcsnak nincs jogosultsága ehhez a modellhez (403).");
  if (status === 404) return new Error("AI: a kért modell nem található (404). Ellenőrizd az OPENAI_MODEL beállítást.");
  if (status === 408) return new Error("AI: a szolgáltató nem válaszolt időben (408). Próbáld újra.");
  if (status === 413) return new Error("AI: a kérés túl nagy (413). Kérlek tedd fel egy rövidebb kérdést.");
  if (status === 422) return new Error("AI: érvénytelen kérés (422). Próbáld pontosabb kérdéssel.");
  if (status === 429) return new Error("AI: pillanatnyi terhelés, túl gyors hívások (429). Próbáld kicsit később.");
  if (status === 402) {
    return new Error(
      provider.name === "lovable"
        ? "AI: nincs elég kredit (402). Tölts fel egyenleget a Lovable workspace beállításainál."
        : "AI (OpenAI): számlázási vagy kvóta hiba (402). Ellenőrizd az OpenAI billinget.",
    );
  }
  if (status >= 500) return new Error(`AI: a szolgáltató szervere átmenetileg nem elérhető (${status}). Próbáld újra később.`);
  return new Error(`AI hiba: ${status} ${raw?.slice(0, 200) ?? ""}`.trim());
}

export async function aiChat(messages: any[], model?: string, tools?: AiToolDef[]): Promise<AiChatResult> {
  const provider = resolveProvider();
  if (!provider) throw new Error("AI provider nincs konfigurálva (OPENAI_API_KEY vagy LOVABLE_API_KEY hiányzik).");
  const usedModel = model ?? provider.defaultModel;
  const clamped = clampMessages(messages);
  if (clamped.length === 0) throw new Error("Üres üzenetlistát nem lehet az AI-nak elküldeni.");

  const body: Record<string, any> = { model: usedModel, messages: clamped, stream: false };
  if (tools && tools.length) {
    body.tools = tools;
    body.tool_choice = "auto";
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${provider.key}`,
    "Content-Type": "application/json",
  };
  if (provider.name === "lovable") headers["Lovable-API-Key"] = provider.key;

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const t0 = Date.now();
    console.log(
      `[ai:${provider.name}] → POST ${provider.baseUrl}/chat/completions  model=${usedModel}  messages=${clamped.length}  tools=${tools?.length ?? 0}  attempt=${attempt}/${MAX_ATTEMPTS}`,
    );
    let res: Response;
    try {
      res = await fetchWithTimeout(
        `${provider.baseUrl}/chat/completions`,
        { method: "POST", headers, body: JSON.stringify(body) },
        REQUEST_TIMEOUT_MS,
      );
    } catch (err: any) {
      const dt = Date.now() - t0;
      const aborted = err?.name === "AbortError";
      lastError = aborted
        ? new Error(`AI: a kérés ${Math.round(REQUEST_TIMEOUT_MS / 1000)} mp után megszakadt (timeout). Próbáld újra.`)
        : new Error(`AI hálózati hiba: ${err?.message ?? "ismeretlen"}.`);
      console.warn(`[ai:${provider.name}] ✗ ${aborted ? "timeout" : "network"} after ${dt}ms — ${lastError.message}`);
      if (attempt < MAX_ATTEMPTS) {
        await sleep(400 * attempt);
        continue;
      }
      throw lastError;
    }
    const dt = Date.now() - t0;

    // Retry-elendő státuszok: 429 (rate limit) + 5xx (szerver). 402/401/4xx üzleti hiba — azonnal dob.
    if (res.status === 429 || res.status >= 500) {
      const raw = await res.text().catch(() => "");
      lastError = friendlyError(provider, res.status, raw);
      const retryAfter = Number(res.headers.get("retry-after"));
      const backoffMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 5_000)
        : 500 * Math.pow(2, attempt - 1);
      console.warn(`[ai:${provider.name}] ↻ retry after ${backoffMs}ms (status=${res.status} dt=${dt}ms)`);
      if (attempt < MAX_ATTEMPTS) {
        await sleep(backoffMs);
        continue;
      }
      throw lastError;
    }
    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      const err = friendlyError(provider, res.status, raw);
      console.warn(`[ai:${provider.name}] ✗ ${res.status} dt=${dt}ms — ${err.message}`);
      throw err;
    }

    let json: any;
    try {
      json = await res.json();
    } catch {
      throw new Error("AI válasz nem értelmezhető (érvénytelen JSON).");
    }
    const respModel = json?.model ?? usedModel;
    const usage = json?.usage ?? {};
    const choice = json?.choices?.[0] ?? {};
    const msg = choice.message ?? {};
    console.log(
      `[ai:${provider.name}] ← ${res.status} OK  model=${respModel}  tokens=${usage.prompt_tokens}→${usage.completion_tokens}  tool_calls=${msg.tool_calls?.length ?? 0}  finish=${choice.finish_reason}  latency=${dt}ms`,
    );
    return {
      text: msg.content ?? "",
      tool_calls: (msg.tool_calls ?? []) as AiToolCall[],
      finish_reason: choice.finish_reason ?? null,
    };
  }
  // Elvileg nem érünk ide, de TS miatt:
  throw lastError ?? new Error("AI hívás ismeretlen okból sikertelen.");
}