# Marketinges felület egyszerűsítése – 19:15 UTC

- Nem csak Ma: Hívások, Kapcsolattartók, Ügyfelek, Érdeklődők, Kampányok és közös marketinges keret.
- A marketingesről elrejtettük a nem marketinges ajánlatpulzust. Ritka oldalak a közös Továbbiak menüből is elérhetők, ugyanazzal a meglévő szerepkörszűréssel.
- Marketinges listaműveletek egy hárompontos menüben; szerkesztés és korábban engedélyezett törlés ugyanazt a mentési/törlési utat használja. Törlés továbbra megerősítést kér.
- Hívások irány/típus/eredmény magyar megjelenítése; Hívás rögzítése elsődleges gomb.
- Marketinges érdeklődő-listaváltó menüben, ügyfélaktivitás négy gomb helyett egy választóban; cégek/magánszemélyek megkülönböztetése megmarad.
- Kampánycég-kijelölés és elutasítás menüben; Gmail-piszkozatimport, TESZT-küldés és aktívlistafeltételek összecsukva. Mentett aláírás látható marad. A hatástalan Kiküldés (tiltott) gomb eltűnt, tiltásjelzés és összes valódi védelem megmaradt.

## Fájlok
`src/components/pulse-bar.tsx`, `src/components/work-navigation.tsx`, `src/components/resource/resource-page.tsx`, `src/components/marketing/campaign-draft-precheck.tsx`, `src/routes/_authenticated/calls.tsx`, `leads.index.tsx`, `customers.index.tsx`, `campaign-list.tsx`; resource/AGENTS szabály.

## Ellenőrzés
- 779/779 Vitest, 78 fájl PASS; harness build OK.
- Hat signed-out útvonal `/auth`-ra irányít, nincs pageerror.
- Eredeti route tree elkülönített TESZT-válaszokkal, minden külső írás blokkolva: marketinges emails/calls/contacts/customers/campaign-list/leads és Sales emails; 1440/390 desktop/mobil PASS, nincs pageerror vagy oldalszintű vízszintes túlfutás.
- Mappaváltás/keresés, sor-menüből szerkesztő/Mégse, nem jogosult törlés hiánya, magyar hívásértékek, kampánykijelölési menü/Gmail-rész nyitás, aktivitásszűrő, Továbbiak és érdeklődő-listanézet PASS. Képernyőképek ellenőrizve. Első híváspróba a bezáródási animáció alatt vizsgált láthatóságot; várakozás után PASS.
- Valódi hitelesített CRM/Gmail/R2 és mentés/readback **NEM TESZTELT** (`external_unmanaged`). Nem teljes marketinges lezárás: részletes cégadatlap/webes igény UI további célzott kör és korábbi funkcionális hiányok megmaradnak.
- Nem változott DB/RLS/Sales/AI vagy üzleti adat; nincs import, küldés, publikálás. STOP.