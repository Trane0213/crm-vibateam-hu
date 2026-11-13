# AI OS 2.0 — 0. szakasz: felmérés + jóváhagyási javaslat (2026-11-13)

Read-only kör. Kód, séma, adat, jogosultság nem változott.

## 0. Mi van már és mi használható változtatás nélkül
| Elem | Állapot (élő DB, 2026-11-13) | Felhasználható? |
|---|---|---|
| AI OS runtime, 5 agent, `handoff_to`, P0 jóváhagyás | működik, 453 teszt + 21 acceptance PASS | igen, változatlanul |
| `ai_memory` | 15 sor, shared/own RLS | igen (megerősített döntésekhez) |
| `kg_nodes/edges/publishers` | 176 / 197 / 230 sor, CRM-szerepkörös olvasás | igen; főleg weboldal-tudás, CRM-dokumentumot NEM indexel |
| `knowledge_documents/chunks` | **0 / 0 sor**, csak Owner, hiányzik forrás/verzió/hash/státusz/hozzáférés | bővítendő (üres → adatkockázat nincs) |
| `crm_read_document` | igény szerinti olvasás, PDF/DOCX/XLSX, sha256, 5 MB / 300 oldal korlát, nincs OCR, nem ment kivonatot | igen, ez lesz a kinyerő motor |
| `crm_list_documents` | csak Timothy + Owner/Sales | bővítendő Boss/Scarlet jogosult forrásaira |
| Dokumentumok | company 11, project 25, quote 5, e-mail-melléklet 1219 | feldolgozandó forrás |
| `issue_reports` | 1 jegy; AI-vizsgálat mezők (specialista, elemzés, bizonyíték, max 3 futás) | igen, ez marad az egyetlen ügytároló |
| `CrmNotificationsMenu` | 6 számláló (lejárt utánkövetés, átadható lead, adatminőség) — nincs eseménytár, olvasott/elhalasztott állapot, AI-jelzés | bővítendő |
| Ütemező | pg_cron + pg_net elérhető; **saját kezelésű Supabase** → HTTP-visszahívásos cron itt nem támogatott | döntés kell (lásd lent) |
| Szemantikus keresés | **pgvector nincs telepítve** | első körben teljes szöveges (tsvector) keresés |

### Felmérés közben talált hibák
- **51 `agent_runs` sor ragadt „running” állapotban** (ma 19 új, napi Sales összefoglaló). Nincs elavult futást lezáró mechanizmus.
- A november 9. utáni AI-hibák egybeesnek az OpenAI-kredithiánnyal (429); jelenlegi egyenleg nem ellenőrzött → minden 2.0 AI-teszt blokkolt, amíg nincs kredit.

## Javasolt végrehajtási sorrend (mindegyik után STOP)
1. Közös tudásbázis séma + jogosultság (1. részegység)
2. Dokumentumfeldolgozó sor (2.)
3. Strukturált AI-jelentés az `issue_reports`-ban + George összevonás (3.)
4. Értesítési eseménytár a meglévő menü mögé (4.)
5. Óránkénti determinisztikus ellenőrzés, alapból KIKAPCSOLVA (5.) + tulajdonosi jelentés (6.)

## 1. részegység — pontos migrációs javaslat (NEM futtatva)
- `knowledge_documents` bővítés: source_table, source_id, company_id, project_id, quote_id, lead_id, email_id, content_sha256, source_created_at, source_updated_at, processed_at, processing_status (processed / partial / needs_review / unsupported / error), error_code, superseded_at; egyedi kulcs (source_table, source_id, content_sha256) → duplikációvédelem.
- `knowledge_chunks` bővítés: unit_label (oldal/munkalap/szakasz), unit_index, claim_kind (source_fact / ai_inference / unverified), search tsvector + GIN index.
- Jogosultság: a mostani „csak Owner” helyett olvasás csak akkor, ha a hívó az **eredeti** dokumentumsort a meglévő RLS szerint látja (security invoker függvény); írás kizárólag szerveroldali szolgáltatáskulccsal. Marketing/Sales/PM így nem lát többet, mint ma.
- Elavult verzió: új hash esetén a régi `superseded_at` kap értéket, keresés csak aktuálisat ad.
- **Hatás:** a két tábla üres, meglévő funkció nem használja → üzleti adat és működés nem érintett.
- **Visszaállítás:** az új oszlopok/index/függvény eldobása, az eredeti owner_all policy visszaállítása (SQL mellékelve lesz a migrációban).

## Döntést igénylő pontok
1. Mehet-e az 1. részegység migrációja a fenti formában?
2. Háttérfeldolgozás és óránkénti futás ütemezése (saját kezelésű Supabase miatt): (a) SQL-only pg_cron csak sorba állít, a feldolgozást Owner gomb vagy AI-hívás indítja; (b) külső ütemező hívja a védett végpontot (külső szolgáltatás → külön jóváhagyás).
3. OCR / 5 MB feletti fájlok: első körben „Nem támogatott / Ellenőrzést igényel” jelölés, külső OCR nélkül — elfogadható?
4. OpenAI-kredit feltöltése: enélkül George/specialista-vizsgálat és a 3., 5., 6. részegység AI-tesztjei NEM TESZTELT-ek maradnak.
5. A 51 beragadt futás lezárása (`running` → `error`, ok: stale) — éles adatírás, külön jóváhagyás.
