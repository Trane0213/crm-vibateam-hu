# Teljes AI audit (csak olvasás, nincs módosítás)

## Cél
Egy érthető, magyar nyelvű jelentés arról, hogy a CRM AI-ügynökei (George, Scarlet, Timothy, Boss, Michael) mit tudnak, mit csinálnak és hogyan működnek — és mi nem működik.

## Mit vizsgálok
1. **Ügynökök egyenként**: szerepkör, ki használhatja, milyen adatokat lát, milyen eszközöket (olvasás / javasolt művelet) hívhat.
2. **Működés**: hol érhető el (AI-panel, /ai-assistant, Ma oldal napi összefoglaló, hibaközpont), hogyan kér jóváhagyást egy művelet előtt, mi kerül naplóba, mit jegyez meg (memória).
3. **Biztonság**: jogosultsági korlátok (Sales csak saját lead, Marketing saját scope), jóváhagyási kapuk, dupla végrehajtás elleni védelem, e-mail-küldés szabályai.
4. **Modell és költség**: központi `gpt-6-astra`/high beállítás, a korábbi elfogyott OpenAI-egyenleg (429) jelenlegi hatása, hívásnaplók alapján tényleges használat.
5. **Tesztállapot**: meglévő automatikus tesztek és az AI acceptance futtatása; mi igazolt, mi NEM TESZTELT.
6. **Hiányok és kockázatok**: rangsorolt javítási lista (nem javítok, csak javaslok).

## Eredmény
- Jelentés: `docs/system-map/ai-teljes-audit-2026-11-13.md`
- Rövid összefoglaló a chatben: ügynökönként 2-3 sor + top hibák.

## Mit NEM teszek
Nincs kód-, adat-, jogosultság- vagy modellmódosítás, nincs e-mail-küldés, nincs publikálás. Jelszót nem használok.

## Technikai részletek
- Források: `src/lib/ai-os/` (agents.ts, roles.ts, constitution.ts, runtime, approval, *-action), `src/components/ai/`, korábbi jelentések (ai-asszisztens-audit-2026-11-03, ai-os-p0-*).
- Adatbázis: csak SELECT (agent_runs, agent_run_steps, ai_memory, issue_reports darabszámok, hibaarány).
- Tesztek: `bunx vitest run src/lib/ai-os`, `bun run ai:acceptance`.
