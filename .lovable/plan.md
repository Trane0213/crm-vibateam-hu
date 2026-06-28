# AI OS migráció — egyetlen AI rendszer

## Cél
A projekt végére **egyetlen** AI rendszer marad: az **AI OS** (`src/lib/ai-os/`).
Egy provider réteg, egy tool registry, egy memória, egy runtime.
A régi AI kód (`src/lib/ai/`, `aiStep`, `aiComplete`, `research.functions.ts`, Lovable/Gemini fallback) megszűnik.

## Megtartjuk
- George, Scarlet, Timothy, Boss — nevek és szerepkörök változatlanok.
- Minden jogosultsági szabály, role access, agent access, tool access.
- Minden működő CRM tool, DB tábla, RPC.
- Sales és Marketing backend invariánsok (már lezárt sprintek).

## Vasszabályok (minden fázisra érvényes)
1. **Egyszerre csak EGY dolgot** módosítok (egy callsite / egy oldal).
2. Egy funkció teljes átkötése után **megállok és várom a jóváhagyást**.
3. Régi AI kódot **csak akkor törlök**, ha az új már bizonyítottan működik az adott funkción.
4. Nem indítok párhuzamosan több modult, oldalt vagy architekturális változtatást.
5. **Nem refaktorálok** működő, nem érintett kódot.
6. CRM működés > kódszerkezet. Ha egy backend logika jól működik, használom tovább, nem írom újra.
7. Új funkció a **meglévő** adatbázisra és táblákra épül — nincs új tábla, ha a régi elég.
8. Kis, visszafordítható lépések, hogy bármikor stabil állapotnál meg lehessen állni.
9. Nincs provider/modell váltás (OpenAI `gpt-4o-mini` marad alapértelmezett).

## Migrációs minta (callsite-onként, mindig ugyanaz)
1. Felmérés: melyik prompt + tool kell az adott funkcióhoz.
2. Hiányzó tool hozzáadása `src/lib/ai-os/tools/`-ba (registry + agent access).
3. UI átkötése `runAiAgent`-re (megfelelő agent: George/Scarlet/Timothy/Boss).
4. Manuális smoke teszt az adott oldalon → user jóváhagyás.
5. Régi callsite + már nem hivatkozott helper törlése.
6. **STOP** — várom a következő feladatot.

## Fázis sorrend (kockázat szerint, kicsitől nagyig)
- **F1.** Daily Briefing (`daily-briefing.tsx`) → Boss
- **F2.** AI Summary Dialog (`ai-summary-dialog.tsx`) → George
- **F3.** Sales Research (`/sales/research`) → Timothy
- **F4.** Marketing research / lead enrichment panelek → Scarlet
- **F5.** Maradék `aiStep` / `aiComplete` / `runTool` callsite-ok
- **Final.** `src/lib/ai/provider.server.ts`, `ai.functions.ts`, `research.functions.ts` törlés, csomag cleanup, grep ellenőrzés (`from "@/lib/ai/"`, `ai.gateway.lovable.dev` literál nem maradhat)

## Mit NEM csinálunk
- Nem váltunk modellt/providert.
- Nem nyúlunk a Sales/Marketing backend invariánsokhoz.
- Nem építünk új UI-t — minden oldal ugyanúgy néz ki, alatta az AI OS fut.
- Nem törlünk semmit, aminek a frontend párja még a régi rétegre hivatkozik.

## Első konkrét lépés a jóváhagyás után
**Phase 0 — leltár (csak olvasás, semmit nem módosítok):**
pontos lista az összes régi AI callsite-ról (fájl + sor + melyik agent szerepkörhöz tartozik).
Ezután indul **F1 (Daily Briefing → Boss)**, és csak az.