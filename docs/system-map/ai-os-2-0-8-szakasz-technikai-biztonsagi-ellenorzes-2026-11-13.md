# AI OS 2.0 – 8. szakasz: technikai és biztonsági elvárások (2026-11-13)

## Ellenőrző lista (PASS / FAIL / RÉSZBEN / NEM TESZTELT)
| Elvárás | Eredmény | Bizonyíték |
|---|---|---|
| Meglévő AI OS runtime és szerepkörök megtartva | PASS | 5 agent, 21/21 acceptance; nincs új AI-réteg |
| Jelenlegi Supabase + R2 infrastruktúra | PASS | nincs új szolgáltatás; R2 csak a meglévő aláíróval |
| Tudásbázis/memória bővítve, nem duplikálva | PASS | egy `knowledge_documents/chunks`, egy `ai_memory` |
| Tudáslekérésnél forrásjogosultság | PASS | `knowledge_search` SECURITY INVOKER; chunks → dokumentum → `knowledge_source_visible` (szülő-rekord RLS); 2. szakasz rollbackes szerepkörpróbája (Owner 821 / PM 74 / Sales 51 / szerepkör nélkül 0) |
| Dokumentumtartalom nem megbízható bemenet | PASS (javítva) | eddig csak Timothy promptja mondta ki; most a közös alapszabály 8. pontja minden agentre (George, Scarlet, Timothy, Boss, Michael); eszközkimenetek `untrusted_content` jelöléssel |
| Titok nem kerül tudásbázisba / naplóba | PASS (javítva) | tudásbázis: `sensitive_withheld` (már volt). Napló: a titokszűrő eddig nem ismerte a magyar „jelszó:”, `sk-`, `sb_secret_`, JWT, privát kulcs formátumot — bővítve. Chat-előzményből a titok a modellhez küldés előtt kicserélődik. `memory_write` titkot tartalmazó értéket elutasít. Közös alapszabály 9. pont. |
| Elavult/törölt forrás érvénytelenítése | RÉSZBEN | törléskor trigger `superseded_at`-ot állít, keresés és láthatóság kizárja (élő adat: 0 árva aktív dokumentum). A törölt dokumentum szövegrészletei viszont az adatbázisban maradnak (senki nem látja) → jóváhagyási pont A |
| Automatikus műveletek naplója | RÉSZBEN | óránkénti gyűjtés: `ai_review_runs`; AI-futások: `agent_runs/steps`; értesítések: `crm_notifications`; dokumentumfeldolgozás: soronként állapot/kísérlet/parser, de nincs külön „ki indította a köteget” napló → jóváhagyási pont C |
| Új migráció / külső szolgáltatás csak jóváhagyással | PASS | e szakaszban nem volt migráció |
| Nincs automatikus küldés, kódmódosítás, adatátírás, publikálás | PASS | ütemezett feladatok: `ai-review-hourly` (AI nélküli gyűjtés, konfiguráció kikapcsolva), `gmail-incremental-sync` (csak beolvasás) |
| OpenAI-modell/szolgáltató változatlan | PASS | `model-config.ts`: openai / gpt-6-astra / high |

## Módosított fájlok
`src/lib/ai-os/constitution.ts`, `approval.ts` (titokminták, `redactSecrets`), `runtime.functions.ts` (chat-előzmény szűrése), `core-tools.server.ts` (memória titokvédelem), új teszt `security-stage8.test.ts`.

## Tesztek
863 unit (88 fájl) PASS, ebből 5 új; 21/21 AI acceptance PASS; típusellenőrzés PASS.
NEM TESZTELT: élő modellel prompt-injekciós próba (rosszindulatú dokumentum), bejelentkezett szerepkörös UI.

## Jóváhagyásra váró pontok (nem hajtottam végre)
- **A — Törölt dokumentum szövegének törlése a tudásbázisból.** A törlési trigger a szövegrészleteket is törölné. Migráció; visszaállítás: a trigger előző változata. Hatás: csak már törölt forrás indexe.
- **B — Közös AI-memória olvasása csak CRM-szerepkörrel.** Jelenleg a „shared” memóriát bármely bejelentkezett (szerepkör nélküli) fiók is olvashatná; most 0 ilyen sor van, de a szabály tág. RLS-módosítás; visszaállítás: előző policy.
- **C — Dokumentumfeldolgozási kötegnapló** (ki, mikor, hány fájlt dolgozott fel). Új tábla vagy meglévő auditba írás; migráció.
