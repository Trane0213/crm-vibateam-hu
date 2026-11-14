# AI OS bővítési architektúra – 2. változat, a Timothy ajánlatkészítő specifikációval kiegészítve (csak dokumentum)

## Cél
A már elkészült elemzést (3 oldal, első változat) átdolgozom egy új, 2. változatba. Mostantól az új, teljes Timothy-ajánlatkészítő specifikáció lesz az irányadó követelmény. Az első változat érintetlen marad. Kód, adatbázis, jogosultság, integráció nem változik, fizetős próbahívás nincs.

## Mi kerül bele újonnan
1. **Követelmények beépítése a specifikációból:** két munkamód és öt árazási mód; szerkezettartó Excel-motor (eredeti sértetlen, csak engedélyezett árcellák, valódi újraszámolás, makró soha); elosztószekrény-anyagjegyzék rajzról; terv–Excel–levelezés eltéréslista; belső és ügyfélkimenet szétválasztása; 10 javasolt Timothy-eszköz; javasolt új táblák; P0–P7 ütemek.
2. **Eszközönkénti architektúra-hozzárendelés:** mind a 10 javasolt Timothy-eszközre megadom, hogy hol futna (AI OS szerver, elzárt számolókörnyezet vagy modell), mit olvashat, kell-e jóváhagyás, és melyik ütemhez tartozik.
3. **A négy változat újraértékelése** a specifikáció legnehezebb feltételei szerint: képletkímélő Excel-visszaírás, nagy (50 MB-os) rajzcsomagok, többoldalas rajzolvasás, determinisztikus árazómotor, hosszú futás, jóváhagyott export.
4. **Az öt asszisztens képességmátrixa** (George, Scarlet, Timothy, Boss, Michael), immár az árazási eszközökkel együtt. Mindegyiknél jelölöm, hogy a mai szabályokból mi marad változatlan.
5. **Pontosított költségelemzés:** egy tipikus ajánlatcsomag (fájlszám, oldalszám, OCR, számolási idő) becsült költsége esetenként és havonta. Megpróbálom ellenőrizni a hivatalos OpenAI-árakat. Ha ez nem sikerül, „becslés” jelöléssel paraméteres marad.
6. **Kiegészített kockázatok:** szivárgás az ügyfél-Excel rejtett lapjain vagy metaadataiban, makrós vagy sérült fájl, csendes oszlop-félreértelmezés, beépített utasítás a rajzokban és levelekben, „bizonyítottnak” feltüntetett normaóra.
7. **Ellentmondások jelzése:** ahol a specifikáció és a mai rendszer eltér (például dokumentumtár-jogosultság, 5 MB-os és 50 MB-os korlát), azt döntési pontként írom le.
8. **Bevezetési sorrend** a specifikáció P0–P7 ütemeihez igazítva, ütemenként külön tulajdonosi kapuval.

## Kimenet
- `docs/system-map/ai-os-architektura-osszehasonlitas-v2-2026-11-14.md`
- PDF: `/mnt/documents/viba-ai-os-architektura-elemzes-v2-2026-11-14.pdf`, minden oldala képként ellenőrizve
- Utána STOP, a döntési pontok listájával.

## Technikai megjegyzések
- Csak olvasást végzek: a specifikációt, a csatolt Excelt és HTML-t, a releváns forrásfájlokat (`quotes/workflow.ts`, `quotes.$id.tsx`, dokumentumolvasó, eszközregiszter) és a hivatalos OpenAI-dokumentációt.
- Az előzetes irány (A + D) változatlan, de a specifikáció alapján újra ellenőrzöm.
