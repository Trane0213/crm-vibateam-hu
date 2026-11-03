# Timothy V3.0 – P1/B levelezésértelmezés, 2026-11-03

## Elkészült, hatókör
- A meglévő AI OS-ben Timothy két olvasási eszközt kapott: `crm_email_mailboxes` és `crm_read_email_thread`. Mindkét meglévő chat ugyanazon bootstrap/runtime útvonalon éri el őket.
- Postafiók csak az aktuális felhasználó `crm_mailboxes` RPC-jének eredményéből választható. Több azonos címhez rendelt user esetén a kérés elutasított, nem választjuk ki az elsőt.
- Pontos company_id, thread_id, kiválasztott mailbox; leadkérésnél a lead RLS-es olvashatósága és cégkapcsolata is ellenőrzött. A szál mentett company_id/lead_id kapcsolata egyeznie kell; tárgy, név vagy domain nem hozzáférési alap.
- Száltagság meglévő `email_thread_access` vagy szinkron-tulajdonlás szerint. A tényleges levéltartalom mindig `emails.owner_user_id = kiválasztott fiók userId` szűréssel olvasott, akkor is, ha a közös szál RLS-e más leveleket engedne.
- Ellentmondó üzenetszintű cég/lead kapcsolat kizárt és jelölt. A mentett hozzárendelés nem függetlenül ellenőrzött kapcsolat: ezt a válasz külön jelzi, nem nevezi bizonyított ügyfélkapcsolatnak.
- Tárolt beérkezett/elküldött szöveg, forrásazonosító, időpont és fiók; üzenetlapozás és hosszú szöveg folytatása. Hiányzó/szenzitív/túl nagy/részleges tartalom egyértelmű állapotot kap.
- Feladóazonosítás csak a cég mentett contact-emailjeivel történik, domain/névhasonlóság nélkül. 100 feletti contacttal az azonosítás hiányosként jelölt, nem teljes. A customer_inbound feladóegyezés, nem szemantikai válasz bizonyítéka; automatizált/ismeretlen irány elkülönített.
- Szinkron: utolsó tárolt idő, fiók aktív/authError jelzése, ha olvasható, legutóbbi sync-run vége és hibájának jelenléte. Hiba részletei/checkpoint/titkok nem kerülnek a modellhez. Friss szinkron sem jelenti a teljes Gmail-előzmény meglétét; másik fiók nem látható sync-runja unavailable.
- Timothy utasítása a tényleges tartalomból összefoglalásra, nyitott kérdések/kért dokumentumok/visszajelzés értelmezésére és szöveges válaszjavaslatra irányul. Nem állít garantált megválaszolatlanságot vagy utolsó ügyfélválaszt részleges adatokból.
- A meglévő cégszál-lista lapozható, leadkérésnél hozzáférés-ellenőrzött; levéltárgy tartalma biztonsági szűrés után kerül vissza.

## Adat- és tartalomvédelem
- Nincs admin CRM-/levéltartalom-olvasás, Gmail-tokenolvasás, élő Gmail-hívás, szinkronindítás vagy levélküldés.
- HTML végrehajtható elemei eltávolítva; a levélszöveg untrusted_content jelölést kap. Ismert credential-formák esetén teljes tartalom visszatartva, a találat nem kerül naplóba/modellhez.
- A `crm_read_email_thread` tool auditjában csak rekord/szálazonosítók, lapozás és teljességi adatok szerepelnek, nem nyers levéltartalom, címzett vagy tárgy. A modell által készített végső válasz a meglévő AI-beszélgetés/futásnapló működését követi; ez nem általános napló- vagy DLP-újratervezés.
- **Korlát:** a credential-detektor konzervatív ismert mintákra épül, nem garantált tetszőleges titokfelismerés. Prompt-injection védelem: HTML tisztítás, adatjelölés, rendszerutasítás és meglévő P0 műveletvédelem; tényleges modellel adversarial teszt NEM TESZTELT.
- A sync által régebben hibásan mentett cégkapcsolatok nem javulnak automatikusan. Nincs levelek újrakötése vagy hozzáférésváltozás. Ramon/info és kikapcsolt fiókok érintetlenek.

## Aktuális olvasásos ellenőrzés
Az emails/email_threads/email_thread_access oszlopait, aktuális SELECT policy-ket, `crm_mailboxes` definícióját és `gmail_sync_runs` sémáját/policy-jét lekérdeztük. A levél-RLS száltagsághoz kötött, ezért az új AI-olvasás külön tulajdonosszűrése szükséges. `gmail_sync_runs` saját userre szűrt; hiánya nem alakítható sikeres szinkronbizonyítékká.

## PASS / FAIL / NEM TESZTELT
| Vizsgálat | Eredmény |
|---|---|
| Saját tárolt levél, forrás és hiányos szinkron | PASS, izolált adapter |
| Közös szál más fiók levele kizárt | PASS |
| Idegen/ambiguus postafiók elutasítása | PASS |
| Idegen lead / más cég szála, ellentmondó message-kapcsolat | PASS |
| Lekérdezési hiba nem üres siker | PASS |
| 35 levél lapozása, 7000 karakterből 6000+1000 folytatás | PASS |
| Hiányzó tartalom, HTML, ismert credential és auditkihagyás | PASS |
| Owner/Sales-only + Timothy-only registry | PASS, izolált |
| Aktív, de régi/hiányzó szinkron; friss szinkron nem teljes | PASS |
| Teljes regresszió | PASS: 185/185, 28 tesztfájl |
| AI acceptance | PASS: 5 agent, 14 forgatókönyv, 0 hiba |
| Automatikus fordítás | PASS: build OK, 2026-11-03 16:19:27 UTC |
| Hitelesített tényleges két-chat Gmail-értelmezés, valós szerepkörös olvasás | NEM TESZTELT: external_unmanaged Supabase, nincs átadható munkamenet |
| Modell által azonosított utolsó ügyfélválasz/nyitott kérdés pontossága és adversarial levél | NEM TESZTELT: izolált adapterteszt nem modellminőségi igazolás |
| Élő Gmail/PDF/melléklet/küldés | NEM TESZTELT, nem P1/B hatókör |

## Visszaállítás
Adat-/SQL-/RLS-rollback nem szükséges: nem történt ilyen módosítás. A kör előtti forrásból visszaállítandó: AI OS bootstrap, agents, runtime (csak email-audit ág), CRM-adapter email-lista blokk, acceptance fixture; új `gmail-tools.server.ts`, `gmail-context.ts`, `gmail-context.test.ts`, `email-audit.ts` eltávolítása csak importjaikkal együtt. AGENTS.md új email-szabálya a kóddal együtt visszavonható. P0 jóváhagyás és P1/A védelem megmarad; utána regresszió és AI acceptance kötelező.

## Használat és STOP
Például: „Foglaljad össze e cég levelezését a saját postafiókomból, és adj választervezetet.” Több fióknál a kiválasztott fiókot tisztázni kell. A választervezet itt csak szöveg, nem mentett Gmail-piszkozat és nem kiküldés.

P1/B olvasási eszközök és izolált tesztek kész; hitelesített/modellminőségi elfogadás nyitott. P1/C ajánlatértelmezés, P1/D dokumentum és P2–P5 nem indult. Publikálás nélkül STOP.