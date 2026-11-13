# Teljes AI audit — 2026-11-13 (read-only)

Semmilyen kód, adat, jogosultság vagy modell nem módosult. Hitelesített UI-próba: NEM TESZTELT.

## 1. Architektúra
- Egyetlen rendszer: AI OS (`src/lib/ai-os/`), közös runtime; ügynökönként csak prompt, eszközkör, szerepkör különbözik.
- Modell: mind az 5 ügynök `openai / gpt-6-astra`, reasoning high (`model-config.ts`).
- Felületek: jobb oldali AI-panel és /ai-assistant (közös chat), Sales Ma napi összefoglaló + Timothy-figyelő, AI-összefoglaló dialógus, /help hibaközpont George-vizsgálattal.
- Specialisták nem hívják egymást: átadás csak George `handoff_to` eszközén.
- Minden írás P0 jóváhagyáshoz kötött: megváltoztathatatlan jóváhagyási sor, atomikus foglalás, idempotencia, visszaolvasással igazolt siker, bizonytalan végrehajtás nem ismételhető.

## 2. Ügynökök
| Ügynök | Feladat | Lát / olvas | Írni tud (csak jóváhagyással) |
|---|---|---|---|
| George | Koordinátor, CRM-navigátor, hibaközpont-vizsgáló | cégek, kontaktok, projektek, leadek, e-mailek, tudásbázis, weboldal | nincs üzleti írás; ajánlatot Timothynak ad át |
| Scarlet | Marketing: lead-minősítés, levelezés, megkeresés előkészítése | saját Marketing scope, saját postafiók tárolt levelei | nincs; levéltervezet csak chatjavaslat |
| Timothy | Sales: napi teendők, ajánlatok, utánkövetés, ügyelemzés | csak saját felelős leadek (RLS), ajánlatok, levelek, dokumentumok | tevékenység rögzítése, következő lépés, utánkövetés, kontakt, pipeline-státusz, felelősátadás (csak Owner), e-mail-küldés |
| Boss | Projektvezetés: határidők, kockázatok, feladatok | projektek, feladatok, találkozók, utánkövetések | nincs |
| Michael | Google Ads elemző, csak Owner | Ads adatok, leadek/cégek olvasása | nincs |
Háttér-ügynökök: Sales Daily Briefing, PM Daily Briefing, CRM Summary, Sales Research (eszköz nélküli, determinisztikus adatból fogalmaznak).

## 3. Tényleges használat (agent_runs, utolsó 30 nap)
- sales_briefing: 419 ok, 4 hiba, **19 „running” ma (2026-11-13) — beragadt futás gyanú**.
- timothy: 128 ok (utolsó 11-03), 10 hiba (utolsó 11-09).
- george: 2 ok (11-03), 1 hiba (11-12); scarlet: 2 ok (11-06); crm_summary: 3 hiba (11-12).
- Boss és Michael: 0 futás → működésük NEM TESZTELT.
- ai_memory: 15 sor; issue_reports: 1; agent_run_steps 30 nap: 908.
- A 11-09 utáni hibák egybeesnek a korábban mért OpenAI 429 „credit_balance_exhausted” hibával; az egyenleg jelenlegi állapota nem ellenőrzött.

## 4. Tesztek
- `vitest src/lib/ai-os`: 24 fájl, 453 teszt PASS.
- `ai:acceptance`: 5 ügynök, 21 forgatókönyv, 0 hiba.
- Ezek kódszintű tesztek, nem igazolják az élő modellválaszt.

## 5. Kockázatok / javaslatok (prioritás)
1. **OpenAI-egyenleg**: ha elfogyott, minden ügynök és a hibaközpont-vizsgálat áll. Teendő: feltöltés, majd egy TESZT-kérdés.
2. **19 beragadt sales_briefing futás ma**: okát vizsgálni (lock/időtúllépés), utána régieket lezárni — csak jóváhagyással.
3. **Nincs fallback modell** (tulajdonosi döntés): kiesésnél nincs AI. Csak döntési pont, nem hiba.
4. Boss, Michael, Scarlet szinte használatlan: valódi szerepkörös próba kell.
5. Timothy e-mail-küldés és P0 írások éles hitelesített próbája NEM TESZTELT.
6. Költség: high reasoning + 400+ napi briefing futás/hó — költségfigyelés javasolt.
