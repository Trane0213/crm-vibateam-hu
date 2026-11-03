# Timothy V3.0 — P3/A jóváhagyott aktivitásrögzítés

## A következő önálló szakasz
Timothy a már megtörtént **Hívás / E-mail** eredményét előkészíti a konkrét saját előkészítésben lévő ügyhöz, majd a meglévő P0 jóváhagyás után rögzíti. A rögzítés időpontját a szerver adja; nem visszadátumozható. Ez az első P3 művelet, nem az egész P3 lezárása.

A következő lépés, utánkövetés, kapcsolattartó, felelős, státusz és Gmail-küldés nem része ennek a körnek. Ezek P3/B–D külön lépésekben következnek; egy összetett kérésnél Timothy világosan jelzi, mi rögzül és mi nem. Nincs hamis „hívás + következő lépés” együttes siker.

## Megőrzött működés
- Meglévő AI OS, P0 tartós egyszeri jóváhagyás és a két közös chat. Nincs új asszisztens vagy chat.
- A meglévő Sales előkészítő aktivitás ugyanabba a `followups` táblába kerül, ugyanazokkal a Hívás/E-mail mezőkkel és szerveridővel. Az előkészítő szakasz határa változatlan: Pipeline-ban, elveszett vagy megnyert ügyön nem használható.
- Sales csak saját felelősű leaden; Owner a meglévő jogosultsága szerint. A kapcsolattartó és felelős a lead mentett adataiból jelenik meg; Timothy nem adhat át másnak.
- Sem éles üzleti tesztírás, sem emailküldés, sem szerepkör/RLS változtatás, sem publikálás.

## Ellenőrzött kiindulás
A `recordPrepActivity` jelenlegi szerverfüggvény read-then-insert módon rögzít, külön idempotenciakulcs nélkül. A `followups` egyedi elsődleges azonosítója már rendelkezésre áll. A P0 egyszer foglal jóváhagyást, de a művelet igazolt visszaolvasását és tranzakciós naplózását külön hozzá kell kötni. A Gmail meglévő `/api/gmail/send` útja külön P3/D integrációt igényel; azt nem másoljuk le.

## Megvalósítás
1. Egy szűk `sales_record_prep_activity` eszköz a meglévő CRM-adapterben, csak Timothy, Owner/Sales. Paraméterek: pontos lead UUID, Hívás vagy E-mail, eredményszöveg; nincs kliensdátum, felelős vagy tetszőleges leadpatch. Meglévő `prepActivityInput` validálás újrahasználata.
2. Előkészítéskor saját RLS-lead olvasás, jogosultság/előké­szítő állapot és titokszűrés. A lead neve, mentett cég/kapcsolattartó/felelős, eseménytípus és teljes eredmény áttekinthető a közös jóváhagyási kártyában. **„Rögzítés időpontja: jóváhagyáskor”**; következő lépés nincs ebben a műveletben.
3. P0 eredeti változatlan argumentum, atomikus claim, szerepkör/agent/tool újraellenőrzés marad. Az eredeti jóváhagyás ID-jét a szerver adja a tool végrehajtási kontextusának, nem a modell. A szerver visszaellenőrzi a mentett aktivitás ID-jét, leadjét, típusát, completed értékét, eredményét és szerveridejét, mielőtt sikert jelez.
4. A két chat közös `useAiApprovals` a siker után ugyanazokat a leads/pipeline/followups/activity napi adatok cache-ét érvényteleníti; nincs per-page külön AI-mutatórendszer.

## Előzetes adatbázis-hatás és visszaállítás
**Egy új, szűk tranzakciós RPC szükséges; új tábla/oszlop/RLS policy nem szükséges.**

Javaslat: `sales_record_approved_prep_activity(p_action_id uuid)` — security invoker, authenticated számára futtatható. A bemenete kizárólag a saját RLS-sel olvasható meglévő P0 jóváhagyás ID-je. Az RPC:
- lezárásig sorzárral olvassa a saját futáshoz tartozó, `executing` állapotú `sales_record_prep_activity` jóváhagyást és annak eredeti, szigorúan validált paramétereit;
- a hívó saját RLS-kliensével zárolja a leadet, és explicit ellenőrzi az Owner vagy saját assigned Sales jogot, a terminális/Pipeline tiltást; meglévő triggereket és RLS-t nem kerül meg;
- a `followups.id = jóváhagyás.id` stabil UUID-t használja idempotenciára a már meglévő elsődleges kulccsal. Ugyanazon jóváhagyás egyidejű hívásából egy aktivitás készül. Létező ID-nél csak pontosan azonos lead/típus/eredmény/own-scope esetén ad vissza igazolt eredményt;
- az aktivitás és az `activities` meglévő auditbejegyzése egy tranzakcióban készül, a szerver rögzítési időpontjával. Audit vagy aktivitás hibánál az egész visszagördül;
- nem módosít következő lépést, státuszt, felelőst vagy kapcsolattartót. A P0 lifecycle lezárása továbbra is a meglévő service-only approval finish;
- nem hajtható végre pending, elutasított, lejárt, sikeres vagy másik userhez tartozó jóváhagyással. Ismeretlen végrehajtás nem ismételhető automatikusan.

Végrehajtás előtt pontos SQL, hatáselemzés és rollback kerül a meglévő dokumentációba. Éles üzleti adat átírása nincs. Rollback: először tool/hívók eltávolítása, majd kizárólag az új RPC törlése; minden meglévő és P3 aktivitás/audit megmarad. RLS és P0 függvények nem változnak.

## Tesztek és lezárás
- Unit: Hívás/E-mail strict validálás, backdate/extra mező tiltás, exact target és mentett eredmény bizonyíték; 0 sor vagy részleges audit nem siker.
- Izolált SQL/P0: saját/idegen lead, Owner/Sales/tiltott role, Pipeline és terminal tiltás, pending/rejected/expired/idegen action, párhuzamos kérésből egy aktivitás, auditrollback, szerveridő, régi action nem újrajátszható; rollback adatmegőrzés.
- Teljes regresszió és AI acceptance; izolált két-chat közös kártya megjelenítés, nincs éles modell/üzleti tesztírás.
- Hitelesített két-chat és valódi RLS végigpróba **NEM TESZTELT**, ha az external_unmanaged munkamenetkorlát továbbra is fennáll. A korábbi P0/P1/P2 nyitott próbákat nem tekintjük teljesítettnek.
- Pontos PASS/FAIL/NEM TESZTELT jelentés és kézikönyv, majd **STOP**. P3/B–D és P4–P5 nem indul automatikusan.