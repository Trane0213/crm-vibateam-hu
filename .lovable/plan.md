# Timothy V3.1 — közös végrehajtás
- Kérésre Gmail–CRM egyeztetés és dokumentált nyert/vesztett okok: meglévő pontos quote/lead/sends/followups és Gmail/history olvasók; tény/feltételezés/javaslat külön.
- Történeti nettó egységárkeresés: user-RLS quote_items + VIBA-ajánlat, lapozott név/paraméter/egység keresés; dátum/projekt/verzió/alternatíva/ismert eredmény. Anyag/munkadíj bontás nincs, nem találjuk ki.
- Célzott TESZT, végén egy regresszió és AI acceptance; nincs új UI, agent, háttérmunka, írás vagy publikálás.

## Műszaki és biztonsági keret
Meglévő user-RLS kliens, saját crm_mailboxes-hozzárendelés, pontos thread/lead/company és mentett contact-feladó; nincs admin olvasás, új tábla, migráció vagy Gmail-szinkron. Korlátozott metaadatolvasás, hiányosságjelzés és stabil forrásazonosítós deduplikáció. A levelek tartalmi besorolását csak a meglévő chat kezdeményezett olvasása végezheti, nem háttér-AI. Realtime a közös csatornán, meglévő 60 másodperces frissítés mint tartalék. Visszaállítás: figyelési bekötések és új olvasó eltávolítása; üzleti adat és P0 megmarad. Nem publikálunk.