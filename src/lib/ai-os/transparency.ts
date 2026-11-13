/**
 * AI OS 2.0/7 — felhasználói átláthatóság (tiszta, böngésző- és szerverbiztos).
 * A futás során ténylegesen meghívott eszközökből képez rövid, tartalommentes összegzést:
 * milyen forrásokat olvasott az agent, mi hiányzott (olvasási hiba / jogosultság), és vár-e emberi döntésre.
 * Nem bizonyíték az állítások helyességére — csak azt mutatja, mit nézett meg ténylegesen a futás.
 */
export type ToolCallStatus = 'ok' | 'failed' | 'denied';
export type RunTransparency = {
  /** Sikeresen olvasott forráskategóriák (felhasználóbarát címkék, egyedi). */
  checked: string[];
  /** Olvasási hibával végződött forráskategóriák. */
  failed: string[];
  /** Jogosultság vagy vizsgálati mód miatt elutasított forráskategóriák. */
  denied: string[];
  /** Ténylegesen lefutott szakértői konzultációk (agent-azonosítók). */
  consulted: string[];
  /** Az eszköz-eredményekben látott rekordazonosítók száma. */
  verifiedSources: number;
  /** Jóváhagyásra váró művelet maradt-e. */
  decisionNeeded: boolean;
};

const SOURCE_RULES: [RegExp, string][] = [
  [/^handoff|consult/, 'Szakértői konzultáció'],
  [/email|mailbox/, 'Levelezés'],
  [/quote|unit_price/, 'Ajánlatok'],
  [/document/, 'Dokumentumok'],
  [/knowledge|^kg_/, 'Közös tudásbázis'],
  [/^website_/, 'Weboldal-tudás'],
  [/(^|_)(ads?|ad_groups|campaigns?|keywords?|search_terms|budget|conversion|account_snapshot|baseline|change_history|google|recommendations|landing_urls)(_|$)/, 'Google Ads-adatok'],
  [/daily|watch|followup|history|activity|meeting|next_step|prep/, 'Előzmények és teendők'],
  [/project|task/, 'Projektek és feladatok'],
  [/lead|pipeline|sales/, 'Értékesítési ügyek'],
  [/compan|contact|customer/, 'Ügyfelek és kapcsolattartók'],
  [/memory/, 'AI-memória'],
];

export function sourceLabel(tool: string): string {
  const t = tool.toLowerCase();
  for (const [re, label] of SOURCE_RULES) if (re.test(t)) return label;
  return 'CRM-adatok';
}

export class TransparencyTracker {
  private checked = new Set<string>();
  private failed = new Set<string>();
  private denied = new Set<string>();

  record(tool: string, status: ToolCallStatus) {
    const label = sourceLabel(tool);
    if (label === 'Szakértői konzultáció' && status === 'ok') return; // a konzultációk külön listában szerepelnek
    (status === 'ok' ? this.checked : status === 'denied' ? this.denied : this.failed).add(label);
  }

  summary(input: { consulted: string[]; observedCount: number; pendingApprovals: number }): RunTransparency {
    return {
      checked: [...this.checked],
      // Ha ugyanaz a kategória egyszer sikerült, másszor hibázott, a hibát továbbra is jelezzük.
      failed: [...this.failed],
      denied: [...this.denied],
      consulted: [...new Set(input.consulted)],
      verifiedSources: input.observedCount,
      decisionNeeded: input.pendingApprovals > 0,
    };
  }
}

export type RunState = 'decision' | 'partial' | 'done' | 'general';
/** Egy válasz állapota a felhasználó szemszögéből. */
export function runState(t: RunTransparency): RunState {
  if (t.decisionNeeded) return 'decision';
  if (t.failed.length || t.denied.length) return 'partial';
  if (!t.checked.length && !t.consulted.length) return 'general';
  return 'done';
}
export const RUN_STATE_LABEL: Record<RunState, string> = {
  decision: 'Döntésedre vár',
  partial: 'Kész, de hiányos adatokkal',
  done: 'Kész',
  general: 'Kész — CRM-adatot nem nézett meg',
};

/** Felhasználóbarát hibaszöveg az AI-futás hibájából; mindig jelzi, hogy nem történt módosítás. */
export function friendlyAiError(raw: string): string {
  const m = raw.toLowerCase();
  if (/429|credit|quota|balance|rate.?limit/.test(m)) return 'Az AI-szolgáltatás most nem érhető el (elfogyott a keret vagy túl sok a kérés). Próbáld később; semmi nem módosult.';
  if (/access denied|nincs jogosult|not allowed|forbidden|permission|unauthori/.test(m)) return 'Ehhez a kéréshez nincs jogosultságod ennél az asszisztensnél. Semmi nem módosult.';
  if (/step limit|lépéses határ/.test(m)) return 'A kérdés túl összetett volt egy futáshoz. Bontsd kisebb kérdésekre; semmi nem módosult.';
  if (/timeout|timed out|fetch failed|network/.test(m)) return 'Megszakadt a kapcsolat az AI-szolgáltatással. Próbáld újra; semmi nem módosult.';
  return `Az AI most nem tudott válaszolni (${raw.slice(0, 160)}). Semmi nem módosult.`;
}
