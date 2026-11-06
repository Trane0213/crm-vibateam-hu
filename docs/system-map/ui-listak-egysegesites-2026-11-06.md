# Listafelületek kidolgozása

- Meglévő források: useQuoteList/filterQuoteRows, customers.index cégek/KPI/surface/levélszálak, projektek useList. Lekérések, szűrési feltételek, mutációk, szerepkörök változatlanok.
- Ajánlatlista: közös teljes szélességű fejléc, hangsúlyos kereső, állapotválasztó, ritkább verziókapcsoló összecsukva. Szűrés törlése és értelmes üres állapot; olvasási hiba újrapróbálható, találatszám csak sikeres olvasáskor. Nettó/kiküldési/utánkövetési számítás változatlan.
- Ügyfelek: mindenkinek egy aktivitásválasztó négy gomb helyett; cégek és magánszemélyek külön választása és szűrése megmarad. Üres szűrésből visszaállítás, listaolvasási újrapróba.
- Projektek: saját projekt kapcsolás checkboxként, változatlan csak-saját feltétellel.
- Fájlok: quotes.index.tsx, customers.index.tsx, projects.index.tsx.
- 779/779 Vitest 78 fájl PASS; build OK. Eredeti útvonalfán elkülönített TESZT-válaszok: Sales/Owner ajánlatverziók/keresés/reset, Marketing/Sales cég/magánszemély/aktivitás/reset, PM saját projekt 1440/390 PASS, 0 pageerror/oldaltúlfutás. Képek vizuálisan ellenőrizve.
- Hitelesített CRM/Gmail/R2 és mentés NEM TESZTELT (external_unmanaged); TESZT nem éles bizonyíték. Korábbi ügyféllista kiegészítő adatforrásainak hibát elnyelő számításai nem változtak; teljes adatforrás-stabilizálás külön munka. A táblák mobilon helyben görgethetők.
- Nincs DB/RLS/AI/Sales üzleti módosítás, éles adatírás/import/küldés/publikálás.