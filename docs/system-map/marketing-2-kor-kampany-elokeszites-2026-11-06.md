# Marketing 2. kör – kampány-előkészítés (DRY-RUN), 2026-11-06

## Kész
- Kampánylista tetején „Kampány-tervezet ellenőrzése” panel (`src/components/marketing/campaign-draft-precheck.tsx`): név/célcsoport (nem mentődik), a szűrt CRM-cégek (max. 2000) kontaktjainak ellenőrzése, öt csoport, 50-es lapozás, kiküldés gomb kikapcsolva. **NEM éles kampánymentés.**
- Szabály: `src/lib/marketing/campaign-eligibility.ts` — bizonytalan előzmény sosem „kész”.
- Szerver: `src/lib/marketing/campaign-precheck.functions.ts` — Owner/Marketing; kontaktok user-RLS-sel; előzmény az összes céges postafiók tárolt leveleiből (tesztfiók kizárva, gazdátlan levél is számít), 1000-es lapozással, levéltartalom nélkül; más postafiók neve csak Ownernek. Időkorlátnál minden nem talált cím bizonytalan.
- Nem alkalmazott terv: `database/plan_email_campaigns_rls_2026-11-06.sql` (full-access policy szűkítése, `created_by`, státuszok, címzett-tábla egyedi címmel, szerveroldali írás, rollback).

## Valós adat, csak olvasás (aktív kampánylista, 44 cég / 44 kontakt, 5984 előzmény-találat)
Kész 2 · Már megkeresett 10 · Válasz érkezett 6 · Bizonytalan 18 · Hibás/tiltott 8.

## Tesztek
- Vitest marketing+gmail 55/55 PASS (új: másik postafiók kimenője, válasz, hiányos vizsgálat/céghez nem kötött/cégszintű szál → bizonytalan, több kontaktos cég, gyűjtőcím, invalid/hiányzó/belső/teszt, kampányon belüli duplikáció). TypeScript PASS.
- 1000+ lapozás: kódszinten minden lekérdezés 1000-es lapokkal; külön automata teszt nincs.
- Bejelentkezett E2E (Owner/Marketing): **NEM TESZTELT** (nincs érvényes munkamenet).

## Ami blokkolja az éles mentést/küldést
1. `email_campaigns` full-access RLS — a tervfájl jóváhagyása és alkalmazása.
2. Nincs leiratkozás/tiltólista mező az adatmodellben.
3. Gmail–CRM történeti hibás cégkapcsolatok (1. kör) rendezése; Pretor 09-08–10-25 hiány visszatöltése — addig a hiányzó időszak címei sem tekinthetők érintetlennek.
4. Szerveroldali küldő út kampányhoz (meglévő `/api/gmail/send`, újraellenőrzés + idempotencia).
