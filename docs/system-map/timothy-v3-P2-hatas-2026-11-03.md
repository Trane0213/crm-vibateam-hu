# Timothy P2 — előzetes hatás és visszaállítás

A tulajdonos a P2 tervét jóváhagyta. A pontos SQL: `database/ai_os_daily_sales_P2_2026-11-03.sql`.

Élő olvasásos ellenőrzés: nincs briefing tárolótábla; ai_memory egyedi (subject_type, subject_id, scope, key, created_by), négy meglévő RLS policy. Ezek változatlanok.

Hatás: kizárólag a fenntartott `system:daily-sales:` memóriakulcs-névtér szerveroldali írásvédelme és három service_role-only RPC; nincs új tábla, nincs üzleti adatfrissítés. A napot az adatbázis Europe/Budapest szerint adja. User-szintű tranzakciós lock, tartós automatikus kvóta és futási token. Lejárt futás nem nyitja újra a napi automatikus kvótát; kézi frissítés külön kérés. A kliens a rendszerkulcsot nem hozhatja létre, nem nevezheti át, nem módosíthatja/törölheti. A többi memória változatlan.

Privát napi eredmény: korlátozott javaslat, hash, idő és futási azonosító; sem e-mail-/dokumentumtartalom, sem titok. Felhasználói RLS-es adatokon alapul; gyorsítótárolás nem hosszútávú AI-memóriaírás, a rendszerkulcsok általános memóriaolvasásból kizárandók. A változott napi adatlenyomat a régi szöveget elavultként jelzi; hozzáférésvesztéskor nem mutatja.

Rollback: `database/rollback_ai_os_daily_sales_P2_2026-11-03.sql`, először P2 hívók visszaállítása. Csak P2 függvények/trigger törlése, sorok/üzleti adatok megőrzése. Sem RLS-, sem szerepkör-visszaírás szükséges. A régi automatikus újragenerálást ne állítsuk vissza kontroll nélkül.

Ellenőrzés: izolált SQL foglalás, kvóta, token, jogosultság és rollback; célzott napi számítás/frissesség tesztek; teljes regresszió és AI acceptance. Éles üzleti írás és publikálás nélkül.