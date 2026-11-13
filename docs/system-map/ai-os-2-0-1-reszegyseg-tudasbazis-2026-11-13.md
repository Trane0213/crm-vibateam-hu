# AI OS 2.0 — 1. részegység: közös tudásbázis (2026-11-13)

## Megvalósítva
- Migráció (élesben lefutott): `knowledge_documents` forrás/kapcsolat/hash/verzió/feldolgozási státusz/korlát/elavulás mezők; `knowledge_chunks` egység (oldal/munkalap), claim_kind (source_fact / ai_inference / unverified), teljes szöveges index.
- Duplikációvédelem: egyedi (forrás, rekord, hash) és egy aktuális verzió/dokumentum.
- Jogosultság: olvasás csak ha a hívó az eredeti dokumentumsort a meglévő RLS-sel látja (`knowledge_source_visible`, security invoker); kliens írás visszavonva, csak szerver ír. Korábbi „Owner mindent” policy megszűnt (a táblák üresek voltak).
- `knowledge_search` RPC: csak aktuális, nem elavult verzió; lapozott; forrás, oldal, hash.
- `knowledge_search` AI-eszköz George, Scarlet, Timothy és Boss számára (Michael nem); tény / következtetés / nem ellenőrzött szétválasztva; részleges feldolgozás soha nem „tény”.
- Jóváhagyott naplótakarítás: 51 beragadt `agent_runs` (50 sales_briefing 2026-06-28 – 11-13, 1 michael) `error` állapotra zárva, ok rögzítve.

## Fájlok
`src/lib/ai-os/adapters/knowledge-search.ts`, `knowledge-tools.server.ts`, `bootstrap.server.ts`, `knowledge-search.test.ts`, `AGENTS.md`.

## Tesztek
| Teszt | Eredmény |
|---|---|
| AI OS unit (25 fájl, 458 teszt, ebből 5 új) | PASS |
| ai:acceptance (5 agent, 21 forgatókönyv) | PASS |
| knowledge_search futás élő DB-n (üres index → üres lista) | PASS |
| Négy agent ugyanazt a tényt találja | NEM TESZTELT (index üres, 2. részegység tölti; OpenAI-kredit sem igazolt) |
| Nem jogosult szerepkör nem látja | NEM TESZTELT élő adattal (logika az eredeti RLS-re épül) |
| Elavult verzió nem jelenik meg | NEM TESZTELT élő adattal (szűrés kódban/SQL-ben kész) |

## Nem működik még
- Nincs adat a tudásbázisban → a dokumentumfeldolgozás (2.) nélkül a kereső üres.
- Szemantikus (vektoros) keresés nincs; pgvector telepítése külön döntés.
- Beragadt futások oka (sales_briefing nem zárja le a futást hibánál) nincs javítva — 2. részegység előtt célzott javítás javasolt.

## Rollback
Migrációs fájl fejlécében: új függvények/policy-k eldobása, új oszlopok eldobása, owner_all policy visszaállítása.
