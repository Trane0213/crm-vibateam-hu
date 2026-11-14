# AI OS bővítési architektúra — műszaki összehasonlítás, kockázat- és költségelemzés (csak dokumentum)

## Cél
Döntés-előkészítő elemzés arról, hogyan lehet mind az öt asszisztens (George, Scarlet, Timothy, Boss, Michael) GPT-6 Astra-alapú, ChatGPT-szerű, eszközhasználó munkatárs: teljes fájlfeldolgozás, kódfuttatás, webkutatás, CRM- és e-mail-hozzáférés, több lépéses munka — szerepkörönként szabályozva, a mai jogosultságok, P0-jóváhagyások és RLS megtartásával. Kód, adatbázis, jogosultság nem változik.

## Mit vizsgálok
1. **Mai állapot (forrásból igazolva):** `src/lib/ai-os/` futtató, `providers.server.ts` (Responses API, multimodális OCR), eszközdomainek és `agent_role_access`, P0-jóváhagyási életciklus, memória, audit, dokumentumolvasás, chatfeltöltések, Gmail-küldési útvonal, Workers-futtatási korlátok (CPU-idő, nincs fájlrendszer/alfolyamat).
2. **Négy architektúra-változat összevetése:**
   - A) Meglévő AI OS + Responses API bővítése beépített eszközökkel (web search, file search, code interpreter, remote MCP a CRM-eszközökre).
   - B) OpenAI Agents SDK (külön Node/Python szolgáltatásban, mert Workers-en korlátozott) handoffokkal és guardrailekkel.
   - C) OpenAI hosztolt agent-futtatás (Agents API / Assistants-utód) — állapot az OpenAI-nál.
   - D) Codex / sandboxos kódfuttató környezet a nehéz fájl- és Excel-munkára (izolált konténer).
   Szempontok: jogosultság-megőrzés (RLS felhasználói tokennel), P0-jóváhagyás megtarthatósága, adatkivitel/adatvédelem (ügyféladat OpenAI-nál), auditálhatóság, Workers-kompatibilitás, hosszú futás, megbízhatóság, lock-in, karbantartás.
3. **Képességmátrix szerepkörönként:** ki használhat kódfuttatást, webkutatást, e-mailt (olvasás/küldés), fájlt — a mai mátrixból kiindulva (Michael Owner-only, e-mail-melléklet Owner/Sales).
4. **Referencia-felhasználás — a csatolt fájlok alapján:** az `Óradíjas Árkalkulátor 6500 Ft` Excel (Elektromos 326 sor, Beállítások, Árkalkulátor, Összesítő munkalapok, képletek) és az `Automatikus Árazó` HTML logikáját feltérképezem, és tesztesetként használom: melyik architektúra tud egy kapott árazatlan Excelt képletkímélően, eredeti szerkezetben árazni (Timothy árazó P0-specifikáció alapján), belső önköltség szivárgása nélkül. Nem importálom és nem építem be őket.
5. **Költségelemzés:** tokenár × becsült forgalom (felhasználók, napi kérés, OCR, kódfuttatási konténer-óra, web search hívásdíj, vektortár tárhely), havi sávok (alacsony/várható/magas), plusz üzemeltetési költség a B/D változat külön szolgáltatásához. Az árakat a hivatalos OpenAI árlistáról ellenőrzöm és dátummal jelölöm; ami nem igazolható, „becslés” jelölést kap.
6. **Kockázatelemzés:** prompt-injection fájlból/webből, jogosultság-eszkaláció kódfuttatóban, kettős végrehajtás, adatkiáramlás, költségelszabadulás, szolgáltatói változás, Workers-időkorlát; mindegyikhez mérséklés.
7. **Ajánlás és fázisolt bevezetési terv** (javasolt sorrend, kapuk, visszaállítás, átvételi tesztek), minden fázis külön tulajdonosi engedéllyel.

## Kimenet
- `docs/system-map/ai-os-architektura-osszehasonlitas-2026-11-14.md`
- PDF-változat: `/mnt/documents/viba-ai-os-architektura-elemzes-2026-11-14.pdf` (vizuálisan ellenőrizve)
- Semmilyen kód, séma, RLS, adat, integráció, küldés vagy publikálás nem változik. Fizetős próbahívás nincs. Utána STOP.

## Technikai megjegyzések
- Olvasás csak: forráskód, csatolt fájlok (openpyxl képletekkel), hivatalos OpenAI dokumentáció webkeresésen át.
- Előzetes irány (ellenőrzendő): az A) változat + izolált kódfuttató a legkisebb kockázatú, mert a jogosultsági és jóváhagyási réteg a mi szerverünkön marad; a C) állapotot és adatot kivisz, a P0-t nehezebb megtartani.
