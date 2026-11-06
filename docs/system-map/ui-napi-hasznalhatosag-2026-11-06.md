# Marketing és Sales — többoldalas használhatósági kör

- Közös `WorkNavigation` a bejelentkezett keretben: minden Marketing/Sales oldalon ugyanazok a meglévő, szerepkörszűrt fő munkautak, aktív jelöléssel. Owner/PM kerete változatlan. Nincs új jogosultság vagy külön navigációs adatmodell.
- Sales munkafelület neve Előkészítés; az érdeklődőképernyő fejlécén saját Sales-előkészítés / érdeklődők feldolgozása szerepel. A munkafelület, státuszok és adminlista-védelem változatlan.
- `/emails`: asztali bal mappasáv, jobb kereső és levéllista; mobil görgethető mappák és tördelődő feladó/dátum. Saját aktív Gmail és minden küldési/scope-feltétel változatlan.

Érintett fájlok: `src/components/work-navigation.tsx`, `src/routes/_authenticated/route.tsx`, `src/lib/nav-config.ts`, `src/routes/_authenticated/leads.index.tsx`, `src/routes/_authenticated/emails.index.tsx`.

779/779 regresszió PASS, build OK. Eredeti útvonalak elkülönített TESZT-válaszokkal: Marketing és Sales postafiók, mappaváltás, keresés, közös sávból Ma megnyitása PASS; 1440×1100 és 390×844, 0 pageerror/oldaltúlfutás; képek vizuálisan ellenőrizve `/tmp/browser/ui4/` alatt. Nem üres levélfixture, nem valós levelezési bizonyíték.

Valódi hitelesített CRM/Gmail mentés és visszaolvasás **NEM TESZTELT** (`external_unmanaged`). Korábbi UI/adatminőségi/AI/kampány funkcionális és hitelesítési hiányok megmaradnak. Nem történt DB/RLS/adat/import/Sales üzleti változás, levélküldés vagy publikálás. A közös sáv több oldalon megjelenik; ez a kör nem jelenti minden részletes munkafelület teljes átalakítását.

Root AGENTS méretkorlát miatt új szabály mentése kihagyva; meglévő szabályok nem rövidítve. STOP.