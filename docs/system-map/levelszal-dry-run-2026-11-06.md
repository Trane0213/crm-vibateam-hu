# Levélszálak – friss, csak olvasási áttekintés

2026-11-06 16:45–16:50 UTC. Kizárólag SELECT; nincs átkötés, leválasztás, törlés, szerepkör-/Gmail-hozzáférés-változás vagy publikálás.

## Friss állapot
- Összes szál: 7490; Viba-Teamhez kötött: **4543** (régi 4267 helyett).
- Tárolt üzenet: 11427; hozzáférési sor: 7496.
- Viba-szálhoz mentett kontakt: 3910; lead és projekt: 0. A kontaktkapcsolatot egy későbbi company_id változásnál nem lehet figyelmen kívül hagyni.
- Három céges postafiók, kizárólag email_thread_access + saját owner_user_id szerinti üzenetek: info 4102 hozzáférhető Viba-szál / 6027 saját üzenet; Pretor 226 / 308; Ramon 118 / 145. A számsorok megosztott hozzáférés miatt nem feltétlen diszjunktak. Nem résztvevőből következtetett postafiók.
- Import review továbbra 14 cég, 39 vitatott szál, 21 hibás cím, mind open; a 39 szálreview továbbra nem tartalmaz thread_id/email_thread_id kulcsot.
  **Utólagos helyesbítés:** a details kulcshiány nem jelent azonosítóhiányt: a title mező mind a 39 tételnél egyedi, létező szál-UUID (2026-11-06 16:55 UTC SELECT).

## Konzervatív SQL előszűrés – 4543 diszjunkt szál
| Előszűrés | Db | Döntés |
|---|---:|---|
| Nincs saját tárolt üzenet a három céges fiókban | 97 | Hiányos bizonyíték, nem belső szál |
| Saját üzenet-metaadatban csak belső/TESZT-cím | 191 | Nem érintjük |
| Promóció/közösségi/fórum címke vagy legalább 8 címzett, külső résztvevővel | 168 | Csak kézi ellenőrzési lista, nem leválasztási engedély |
| Több másik cég pontos email-egyezése | 1 | Kézi döntés |
| Pontos egyezés, de további szereplő/gyűjtőcím/mentett kapcsolat/megosztott céges fiók/hibás kontakt | 126 | Kizárva az egyszerű jelöltekből |
| Egy külső cím, egy másik cég, nincs kontakt/lead/projekt a szálon és nincs fenti jelzés | 8 | Tételes kézi vizsgálatra, nem automatikus javítás |
| Nincs pontos másik-cég egyezés | 3952 | Domain/név nem bizonyíték, változatlan |

Összeg: 97+191+168+1+126+8+3952 = 4543. Ez szigorú SQL előszűrés, nem a TypeScript analyzer teljes reprodukciója. A három fiók saját üzeneteiből gyűjtött külső szereplők uniója szigorúbb, mint az egyfiókos analyzer. A legacy to_email mező feldolgozása nem teljes; a hiányzó Gmail-történet nincs igazolva. Nincs levéltartalom exportálva; a TESZT-jelzés vizsgálatából csak boolean eredmény érkezett.

## Miért nem leválasztási lista a korábbi 1625?
A régi audit az UPDATES-címkét és noreply-feladót is bizonyosságnak tekintette. **Ez a korábbi „BIZTOSAN JAVÍTHATÓ” minősítés nem használható végrehajtási alapként.** Ügyfél értesítése/számlája is lehet UPDATES vagy gyűjtőcím. Most 1467 szálnál van UPDATES-jelzés a fenti halmazban, ebből 1395-nél nincs pontos másik-cég egyezés; ettől még nem törölhető a kapcsolat. A 168 promóció/körlevélgyanús szál tételes ID-listája mellékelve a repóban, mind manual_review_only.

## Nyolc előszűrt jelölt
`levelszal-dry-run-2026-11-06/exact-manual-review.csv`: 8 szál, 3 célcég. Mindegyiknél 1 saját tárolt üzenet / 1 hozzáférési sor; nincs TESZT-jelzés a tárgyban vagy törzsben. A célkontaktok ellenőrzöttsége/provenienciája üres. **Mind a nyolc üzenet company_id-ja is Viba-Team**, tehát a thread-only átkötés inkonzisztenciát teremthetne. Nem bizonyított, hogy azonos időben érkezett, külön fiókokban tárolt szálak azonos üzleti ügyet jelentenek; összevonás nincs.

## Ellenőrzés, nyitott kapu
- Meglévő relink-analysis és validate-crm-link: 24 teszt PASS. Ez szabályteszt, nem hosted tulajdonosi végigpróba.
- Kód, séma és éles adat nem módosult. Az export CLI user-managed backendnél nem elérhető; SELECT eszköz eredményéből csak a célzott 168 ID és 8 jelölt metaadata került auditfájlba.
- Nincs teljes 4543-szálas snapshot vagy végrehajtási rollback: ebben a körben nem írunk, és az előszűrés nem jóváhagyott javítás. Írás előtt külön friss snapshot kell szál+üzenet+kontakt és minden érintett kapcsolat régi/új értékeiről, változásvédett rollback és pontos darabszám; owner tételes jóváhagyással. Sem a 168-as, sem a 8-as lista nem engedély íróműveletre.
- Hosted tulajdonosi, saját postafiókos kézi előzményvizsgálat NEM TESZTELT: external_unmanaged, nincs átadható session. STOP.

## Tételes második ellenőrzés – 2026-11-06 16:52–16:54 UTC

A nyolc jelölt újraolvasva, három csoport. A címzett-, tárgy- és törzsmezők adatbázison belüli hash-egyezése azonos csoporton belül azonos tárolt tartalmat mutat; nem exportáltunk tárgyat vagy törzset. Ez tárolt másolatok egyezése, nem Gmail-szálazonosság és nem összevonási engedély. Mind a nyolcnál a saját owner és hozzáférési mailbox megfelel a jelenlegi profil Gmail-címének, a legacy to_email megfelel az első to_emails értéknek.

| Célcég / egyező tárolt levélcsoport | Szálak | Saját fiók szerinti bizonyíték | Döntési állapot |
|---|---|---|---|
| Szabó-Galambos Fővállalkozó Kft. | 3 | Ramon 1 SENT; info és Pretor azonos tartalmú, belső feladótól érkezett CC-példány | Cégkapcsolat kézi jóváhagyására vár |
| Petrov és Társa Zrt. | 3 | Ramon 1 SENT; info és Pretor azonos tartalmú, belső feladótól érkezett CC-példány | Cégkapcsolat kézi jóváhagyására vár |
| KÉSZ Group / KÉSZ Építő | 2 | info és Pretor belső feladótól érkezett CC-példány; e két szálon nincs SENT-bizonyíték | Hiányos küldési bizonyíték; nem állítjuk, hogy nem küldték el |

**Fontos pontosítás:** a hat `is_outbound=false` üzenet nem külső ügyfélválasz: a feladó belső, a külső kontakt címzett/CC. Ezeket nem lehet hat érdeklődésnek vagy válasznak számítani. A nyolc szál nem nyolc független megkeresés bizonyítéka.

Megnyitható jelöltek (a felhasználó saját CRM-jogosultságával):
- Szabó-Galambos: [Ramon SENT](https://crm-vibateam-hu.lovable.app/emails/3c23909b-2993-484f-89f3-a84b02862db8), [info példány](https://crm-vibateam-hu.lovable.app/emails/9ed07633-eb57-471e-bf02-1c530a493f58), [Pretor példány](https://crm-vibateam-hu.lovable.app/emails/14ebffd0-2093-435d-98c6-705e9d281064).
- Petrov: [Ramon SENT](https://crm-vibateam-hu.lovable.app/emails/cba273d7-42ee-437f-89d3-215abdcba016), [info példány](https://crm-vibateam-hu.lovable.app/emails/5253bfb8-7587-40c3-9bf2-c405e4a0b9d7), [Pretor példány](https://crm-vibateam-hu.lovable.app/emails/98f4bcfa-4652-438f-a2ce-9ff3a1ed2338).
- KÉSZ: [info példány](https://crm-vibateam-hu.lovable.app/emails/a0ba96cf-1adc-41f3-9c4a-dfbd58cd263d), [Pretor példány](https://crm-vibateam-hu.lovable.app/emails/b5967b74-d809-473a-9758-8df8d63e0ec7).

A 168-as listából az első öt ID szerinti minta: négy promóciós címke és egy legalább nyolccímzettes szál. Háromnak mentett kontaktja van; mind az öt üzenetnek is van company_id-ja. Egyik sem kapott automatikus leválasztási minősítést. Ez öt mintatétel, nem a teljes 168 cégkapcsolatának tételes tartalmi elfogadása.

Ebben a második körben továbbra csak SELECT történt. Nincs új kód/séma/RLS, nincs küldés, átírás vagy publikálás. Következő kapu: a fenti három célcég kapcsolatának tulajdonosi ellenőrzése; utána lehet külön pontos, szál+üzenet konzisztenciát megőrző módosítási javaslatot és friss snapshot/rollbacket készíteni. KÉSZ-küldést és teljes történetet nem igazoltunk, reklámszálak leválasztását nem engedélyeztük.

## A 39 vitatott importtétel azonosítói – 16:55 UTC
Friss SELECT: 39/39 title UUID, 39/39 létező és különböző thread. 11 Viba-Teamhez kapcsolt, 25 más céghez kapcsolt, 3 cég nélküli; 6 mentett kontakt. A postafiókhozzáférésből 29 info, 1 Pretor, 0 Ramon, 9 egyik három céges fiókhoz sem tartozik jelenleg. Ez utóbbi nem törölhető/újracsatlakoztatható indok és nem jelenti, hogy mindenki számára elérhetetlen.

Tételes, tartalommentes lista: `levelszal-dry-run-2026-11-06/import-thread-review.csv`, review_id + thread_id + jelenlegi company/contact + saját jogot megkövetelő szállink. Nincs cégnévből automatikus megfeleltetés, review lezárás vagy cégkapcsolat-írás. A korábbi jelentés téves azonosítóhiány-állítását helyesbítettük; a tulajdonos nyolc jelölttel kapcsolatos „Még kézzel ellenőrzöm” döntése változatlanul érvényes. Hosted tartalmi/jogosultsági ellenőrzés nem történt.