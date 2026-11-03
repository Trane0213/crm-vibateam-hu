# Diagnózis: VIV Zrt. – kézi dátum nem mentődik (csak olvasás, nincs módosítás)

## 1. A gyorsgombok kötelezők-e?
NEM. A „Ma 16:00 / Holnap 9:00 / +3 nap" gomb (`next-step-editor.tsx` `quick()`) csak beírja ugyanabba az Esedékesség mezőbe (`due` állapot) az értéket. Mentéskor mindkét út ugyanazt csinálja: `due ? new Date(due).toISOString() : null`. Tehát egy helyesen beírt kézi dátum ugyanúgy mentődne.

## 2. BIZONYÍTOTT hibák (a kódban látszik)
- **A. Félrevezető „mentve" üzenet:** `handleSave` nem ellenőrzi a dátumot. Ha a mező üres, `next_step_due_at: null` megy az adatbázisba, és a `use-lead-mutations.ts` mégis „Következő lépés mentve" üzenetet ad, mert csak a típust nézi (`patch.next_step_type`).
- **B. A Pipeline gomb túl korán aktív:** `sales-prep-panel.tsx` 152. sor: `hasNextStep = Boolean(l.next_step_type)` – csak a típust nézi, a határidőt nem. Az adatbázis viszont mindkettőt kéri, ezért jön a 400-as hiba.
- **C. A mentett állapot ezzel egyezik:** típus = phone, határidő = NULL. Tehát a mentéskor a mező értéke üres volt.

## 3. FELTÉTELEZETT ok (nem bizonyított, Ramon gépén nem láttam)
A `datetime-local` mező a böngészőben csak akkor ad értéket, ha **a dátum ÉS az óra:perc is teljesen ki van töltve**. Ha Ramon csak a dátumot írja be (vagy az idő részben marad „--:--"), a mező értéke üres szöveg marad, a képernyőn mégis látszik a beírt dátum. Ilyenkor üres határidő mentődik, „mentve" üzenettel.
Másodlagos, kevésbé valószínű lehetőség: a mező állapotát a frissülő adatok visszaírják (`useEffect`), de ez csak akkor történik, ha az adatbázisban a típus/határidő/jegyzet közben megváltozik – mentés előtt ez ritka.

## 4. Ellenőrzés fejlesztés nélkül (Ramonnak, 1 perc)
1. Nyissa meg a VIV Zrt. leadet, az Esedékességnél írja be a dátumot **és az időpontot is** (pl. 09:00), vagy válassza a naptárikonból.
2. Mentés után nézze meg a jobb oldali panel alját / a Pipeline-ablak összegzését: a „Következő lépés: phone · dátum" sorban meg kell jelennie a dátumnak.
3. Ha megjelenik → a feltételezett ok igazolva; ezután a „Pipeline-ba" működik. Ha idővel együtt sem jelenik meg → más ok, további vizsgálat kell (pl. képernyőfelvétel a mentésről).
Gyors kerülőút: a „Holnap 9:00" gomb mindig teljes értéket ad.

## 5. Javasolt javítás (csak jóváhagyás után, most NEM készül)
- Mentés csak akkor jelezzen sikert, ha a dátum is érvényes; üres/hiányos időnél írja ki: „Add meg a határidő időpontját is".
- A „Pipeline-ba" gomb feltétele legyen: típus ÉS határidő megvan, hiány esetén magyarázó felirattal.
Csak képernyő-kód, adatbázis-szabály és RLS változatlan.
