# Közös vizuális egyszerűsítés — minden szerepkör

- Meglévő nav-config/permissions és resource-page mutációk ellenőrizve; nincs új jogosultság, üzleti funkció, adatforrás vagy szerverút.
- Tulajdonos/Sales/Marketing/PM ugyanazt a szerepkörszűrt munkasávot és Továbbiak menüt kapta. Az oldalsáv Továbbiak nyitása után a csoportok külön kattintás nélkül láthatók; összecsukott oldalsávban is elérhető az overflow. Aktív ritka oldalra navigálás nyitja az oldalsáv listáját.
- Mobil Továbbiak: apró, levágott csempék helyett olvasható, csoportosított sorok; az aktív oldal jelölt. Meglévő célok és AI-szűrés változatlan.
- Közös rekordlistákban minden szerepkörnél hárompontos műveletmenü. Meglévő szerkesztés/törlés és megerősítés; nem jogosult törlés továbbra hiányzik. Olvasási hiba nem üres lista, Újrapróbálás elérhető. Fejlécműveletek és fülek közös vizuális kezelés.
- Fájlok: work-navigation.tsx, app-sidebar.tsx, mobile-bottom-nav.tsx, resource/resource-page.tsx, page-header.tsx, styles.css és resource/AGENTS.md.
- 779/779 regresszió 78 fájl PASS; harness build OK. Eredeti route tree elkülönített TESZT-válaszokkal: négy szerepkör /today és Továbbiak 1440/390; Owner/Marketing/PM /contacts szerkesztő/Mégse, tulajdonosi törlés megerősítés/Mégse, nem-owner törlés hiánya PASS. 0 pageerror/oldaltúlfutás. Képernyőképek vizuálisan ellenőrizve.
- Hitelesített mentés/CRM/Gmail/R2 NEM TESZTELT (external_unmanaged). Elszigetelt próba nem bizonyít éles működést és nem teljes oldalankénti CRM-teszt. Korábbi hiányok megmaradnak.
- Nincs üzleti/DB/RLS/AI/Sales változtatás, import, Gmail-küldés vagy publikálás.