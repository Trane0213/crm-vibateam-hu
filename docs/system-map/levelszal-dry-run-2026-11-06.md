# Levélszálak – friss, csak olvasási áttekintés

2026-11-06 16:45–16:50 UTC. Kizárólag SELECT; nincs átkötés, leválasztás, törlés, szerepkör-/Gmail-hozzáférés-változás vagy publikálás.

## Friss állapot
- Összes szál: 7490; Viba-Teamhez kötött: **4543** (régi 4267 helyett).
- Tárolt üzenet: 11427; hozzáférési sor: 7496.
- Viba-szálhoz mentett kontakt: 3910; lead és projekt: 0. A kontaktkapcsolatot egy későbbi company_id változásnál nem lehet figyelmen kívül hagyni.
- Három céges postafiók, kizárólag email_thread_access + saját owner_user_id szerinti üzenetek: info 4102 hozzáférhető Viba-szál / 6027 saját üzenet; Pretor 226 / 308; Ramon 118 / 145. A számsorok megosztott hozzáférés miatt nem feltétlen diszjunktak. Nem résztvevőből következtetett postafiók.
- Import review továbbra 14 cég, 39 vitatott szál, 21 hibás cím, mind open; a 39 szálreview továbbra nem tartalmaz thread_id/email_thread_id kulcsot.

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