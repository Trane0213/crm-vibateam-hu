# P5 — Ajánlatcsomag-előkészítés (kapott költségvetés) — jelentés, 2026-11-15

Alap: P4 `dc052f4`. Specifikáció: VIBA_Timothy_AI_Ajanlatkeszito_Teljes_Fejlesztesi_Terv_2026-11-14 (8., 11., 13., 14. fejezet, P5).
Nem történt: adatbázis-/RLS-migráció, éles adatírás, ügyfélküldés, publikálás, Cloudflare-aktiválás, fizetős AI-hívás.

## Mi készült el (kód)
| Elem | Hely | Megjegyzés |
|---|---|---|
| Csomagmodell (tiszta) | `src/lib/quote-package/package-model.ts` | lehatárolás 4 fejezete, 13 tartalmi kapu, belső hiányjegyzék, kísérőlevél, 3 összekötési kapu, jóváhagyás-előkészítés, átadási szabály, munkameneti és verziók közötti diff |
| Lehatárolás Word | `scope-docx.ts` | determinisztikus DOCX (fflate, rögzített ZIP-dátum), TERVEZET jelöléssel; LibreOffice-szal megnyitva/PDF-re konvertálva ellenőrizve |
| Szerveroldali összeállítás | `package.server.ts`, `package.functions.ts`, `package-dto.ts` | egy hívásban P3 `priceQuoteBudget` + P4 `reviewQuotePlans`, közös letöltési gyorsítótár (a költségvetés egyszer töltődik), SHA-256 ujjlenyomat; mentett Árazott Excel/Lehatárolás tartalmi visszaellenőrzése (XLSX ZIP-részenként, DOCX SHA-256) |
| Közös feltöltés | `src/lib/quotes/quote-document-upload.ts` | a dokumentumkezelő meglévő kódja kiemelve, változatlan viselkedéssel; a csomag is ezt használja |
| Ajánlat panel | `src/components/quote-package/quote-package-panel.tsx`, ajánlat 3. lépés | csak Tulajdonos/Sales, csak kapott költségvetésnél; út: Összeállítás → Fájlok mentése → Nettó mentése → Belső jóváhagyás → Kiküldés (meglévő) → Elfogadás → szerződés-előkészítés |
| Kiküldés | `quote-send-panel.tsx` `draft` | a csomag kitölti a MEGLÉVŐ küldési párbeszédet (címzett, tárgy, levél, a két mentett fájl); a Küldés továbbra is kézi megerősítéshez kötött, `/api/gmail/send` változatlan |
| Timothy | `crm_quote_package_preview` (`quote-package-tools.server.ts`) | csak olvas; kapuk, lehatárolás, kérdések, hiányjegyzék, levéltervezet, ujjlenyomat, „mentve és azonos” jelzés; nem ment, nem hagy jóvá, nem küld |

### Tartalmi kapuk (13. fejezet)
Kötelező: nem zárolt verzió; árazatlan költségvetés; P3 lefutott; árazott Excel visszaellenőrizve; minden sor árazott/0/kizárt; minden kitöltött árnak forrása vagy jelölt becslése van; pozitív nettó; ügyfélszövegben nincs belső kifejezés (önköltség, fedezet, tartalék, normaóra, árforrás, ársablon…).
Nem kötelező, de nyugtázandó: részlegesen olvasott terv; nyitott magas súlyú eltérés. Tájékoztató: P4 lefutott, előre kitöltött megrendelői ár, kérdésszám.
Összekötés (kiküldés előtt kötelező): Árazott Excel „Árazott Excel-költségvetés” dokumentumként mentve és tartalmilag azonos; Lehatárolás „Műszaki lehatárolás” dokumentumként mentve; CRM nettó = csomag nettó. Átadás csak érvényes, UGYANARRA az ujjlenyomatra szóló jóváhagyás-előkészítés után.

### Valós minták (csak olvasva)
A CRM-ben 4 „ajánlat” tárgyú kimenő levél, 3 `quote_sends` sor, 2 `priced_budget` és 0 `technical_scope` dokumentum van. A valós VIBA-kísérőlevelek (ügyvezetői Gmail-szálak) „előzetes árazás a jelenlegi terv- és kiíráscsomag alapján”, „kérjük az alábbi pontok írásos pontosítását”, „tervellentmondásnál a tervezővel egyeztetve” felépítésűek, témánként csoportosított kérdésekkel (terv- és kiírási eltérés; műszaki tartalom és felelősségi határok) és kifejezett „az árazásunk nem számol …” lehatárolással. A kísérőlevél-tervezet ehhez igazodik; a levél szövege a CRM-be nem került át, ügyféladat nem változott.

## Ellenőrzés
| Próba | Eredmény | Jelleg |
|---|---|---|
| Új tesztek | 40/40 (modell 22, DOCX 3, szerver 11, Timothy 4) | izolált |
| Teljes CRM | lásd commit (1279 → 1319) | izolált |
| AI acceptance | 21/21 | izolált |
| Típusellenőrzés, build | rendben | — |
| Jogosultsági negatívok | Marketing/PM/szerepkör nélkül elutasítva fájlletöltés előtt; nem látható ajánlat; saját VIBA-ajánlat; más ajánlat költségvetése; kilépő tárolási kulcs nem töltődik; jóváhagyás-előkészítést Marketing/PM nem végezhet; ismeretlen Timothy-paraméter elutasítva | izolált |
| Mentett fájl ellenőrzés | újracsomagolt azonos XLSX = egyezik; módosított munkalap = eltér; régi fájl nem teljesíti a kaput | izolált |
| LibreOffice | lehatárolás DOCX megnyitva + PDF-re konvertálva; árazott TESZT Excel 33 képletcella, eltérés 0 | izolált, TESZT |
| Felület (Playwright) | Sales és Tulajdonos asztali, Sales mobil: csomag → mentés → nettó → nyugtázás nélkül tiltva → jóváhagyás-előkészítés → kiküldési párbeszéd kitöltve, 2 melléklet bejelölve, Küldés megerősítés nélkül tiltva; Gmail-küldési hívás 0; PM nem látja a panelt | SZIMULÁLT szerver és SZIMULÁLT írás memóriában |

**Nem tesztelt:** bejelentkezett éles végigpróba (a projekt Supabase-e `external_unmanaged`), valódi R2-feltöltés, éles küldés, valós (nem TESZT) projekt teljes csomagja, nagy munkafüzet futásideje egy szerverhívásban (P3+P4 együtt).

## Korlátok
- A belső jóváhagyás csak előkészítés: nincs tartós napló, és a szerveroldali küldés nem követeli meg (a meglévő küldési út változatlan). Ehhez az alábbi tábla kell.
- A csomag nem ment semmit magától; a mentés a felhasználó gombnyomása a meglévő feltöltési úton.
- A szekrény-részösszeg (P4) csak belső kereszt-ellenőrzés; ügyfélárat a költségvetés tételei adják.
- Saját VIBA-ajánlatnál a csomag nem fut (P6), ott a meglévő PDF/sablon út marad.

## Javasolt adatmodell (NEM migrálva, tulajdonosi döntésre)
```sql
create table public.quote_package_approvals (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete restrict,
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  offer_net_huf numeric(14,0) not null,
  priced_document_id uuid not null references public.quote_documents(id),
  scope_document_id uuid not null references public.quote_documents(id),
  acks text[] not null,
  approved_by uuid not null default auth.uid(),
  approved_role text not null,
  created_at timestamptz not null default now(),
  unique (quote_id, fingerprint)
);
grant select, insert on public.quote_package_approvals to authenticated;
grant all on public.quote_package_approvals to service_role;
alter table public.quote_package_approvals enable row level security;
create policy qpa_select on public.quote_package_approvals for select to authenticated using (public.can_access_quote(quote_id));
create policy qpa_insert on public.quote_package_approvals for insert to authenticated with check (
  approved_by = auth.uid() and public.can_access_quote(quote_id) and public.crm_role_of(auth.uid()) in ('owner','sales')
  and exists (select 1 from public.quotes q where q.id = quote_id and q.locked_at is null));
-- Nincs update/delete policy: a jóváhagyás változtathatatlan. Visszaállítás: drop table (új tábla, meglévő adat nem érintett).
```
Opcionális második lépés (külön döntés): `/api/gmail/send` csomagos ajánlatnál csak érvényes jóváhagyással küldjön.

## Következő: P6 — saját VIBA-ajánlat kalkulációs profiljai
1. A meglévő `viba_offer` munkaterületen (QuoteTemplatePanel + QuoteItemsPanel) családi ház m²-csomag, rezsióradíj és egyedi/VBF feladatbontó profil; tételek a meglévő `quote_items`-be, a meglévő PDF/verzió/Gmail úttal — nincs új ajánlatszám-rendszer.
2. Profilonkénti tiszta kalkulátor a P3 pénzmodelljével (fillér, külön tartalék/fedezet), tesztekkel; a 6 500 Ft-os minta csak referencia.
3. Timothy javasolt tételek (P0 jóváhagyással, a meglévő tételírási úton), VBF-jegyzőkönyv hibapont-kinyerés bizonyítékkal.
4. A P5 csomag kísérőlevél/lehatárolás logikájának újrahasznosítása a saját ajánlathoz (PDF mellé lehatárolás).
