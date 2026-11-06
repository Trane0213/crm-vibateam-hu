# Közös adatfelvitel és visszajelzés

- Meglévő RecordDialog/useUpsert működés ellenőrizve: frissítés pontosan egy visszaadott rekordot követel, audit és sikerüzenet csak sikeres mutáció után. Ez változatlan.
- A visszautasított mentés korábban csak toastot és kezeletlen elutasítást eredményezett; most az ablakban megmaradó emberi hiba és javítható értékek. Nem jelzünk mentési sikert.
- Formák desktopon két oszlopban, hosszú szövegek teljes szélességben; mobilon egy oszlopban. Közös ablak telefonon is margóval és belső görgetéssel, magyar Bezárás, pontos új/módosítás következmény.
- Hozzáadás egyértelmű név és teljes menücímkék; kereső neve Keresés a CRM-ben. Mobil aktív AI-menü figyelembe veszi a választott agentet, keresőparaméter-váltás bezárja a menüt. Keresési/mentési/szerepkörös üzleti működés változatlan.
- Módosult: resource/resource-page.tsx, quick-add-menu.tsx, global-search.tsx, ui/dialog.tsx, mobile-bottom-nav.tsx, resource/AGENTS.md.
- 779/779 regresszió 78 fájl PASS, harness build OK. Eredeti útvonalfán elkülönített TESZT-válaszok: négy szerepkör menü 1440/390 PASS; Owner/Marketing/PM kontaktmentés 403-at kap, helyben hiba, értékmegőrzés, Mégse PASS. Külső írás blokkolva. Képernyőképek ellenőrizve, nincs pageerror/oldaltúlfutás.
- Hitelesített sikeres mentés és CRM/Gmail/R2 NEM TESZTELT (external_unmanaged). A próba nem éles bizonyíték; a TESZT-ben el nem érhető rekordválasztó forrása továbbra külön hibajelzés, nem üzleti javítás.
- Nincs DB/RLS/üzleti adat/AI/Sales változás, import, levélküldés vagy publikálás.