# Három jóváhagyott hibás aktivitás – törlés előtti ellenőrzés

A tulajdonos 2026-11-03-i feltöltött jóváhagyása alapján. Csak a followups három sora törölhető, az összes többi rekord változatlan.

| Azonosító | Ügy | Típus | Hibás teljesítési idő (UTC) |
|---|---|---|---|
| 0d733570-433b-4b24-b6c3-950366a8b8b0 | Sopron út 66. | meeting | 2026-11-04 12:00 |
| a910add0-f66d-4335-87eb-0b20d74770de | Sopron út 66. | meeting | 2026-11-04 12:00 |
| 346b65f3-6e19-4ad3-9d9b-d4e5eb21911a | VIV Zrt. | call | 2026-11-05 10:20 |

Mindhárom completed=true; kapcsolódó followup_events: 0. A followups összesen 10 sor. Mentés: `database/rollback_sales_activities_2026-11-03.sql`, minden oszloppal és eredeti időbélyeggel.

Hatás: a három hamis teljesítési előzmény eltűnik. Sopronnak ezután nincs rögzített teljesített aktivitása, ezért a meglévő Pipeline-feltételhez tényleges aktivitást kell rögzíteni. VIV meglévő Pipeline-tagsága nem változik.

A migráció a három sor teljes korábbi tartalmát ellenőrzi, a kapcsolt események hiányát ellenőrzi, majd a teljes leads és a többi followups rekord pillanatképével ellenőrzi a változatlanságot. Bármely eltérés megszakítja és visszagörgeti a tranzakciót. Nincs séma/RLS/üzleti trigger módosítás.

Aktuális eltérés a jóváhagyás megjegyzésétől: a négy Pipeline-ba lépett importált ügy igazolt, az ötödik a Sopron út 66.; VIV már follow_up státuszú Pipeline-ügy, nem az ötödik előkészítendő lead.