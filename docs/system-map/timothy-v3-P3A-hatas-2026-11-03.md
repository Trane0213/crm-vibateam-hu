# P3/A előzetes hatáselemzés

Jóváhagyott terv: egy aktivitásművelet, következő lépés/Gmail/státusz nélkül. SQL `database/timothy_P3A_2026-11-03.sql`, rollback `database/rollback_timothy_P3A_2026-11-03.sql`.

Új tábla/oszlop/RLS nincs. Egy security-invoker authenticated RPC; saját P0 executing jóváhagyásból vesz változatlan paramétereket. Action advisory lock (agent_run_steps nem kap UPDATE jogosultságot), majd saját RLS lead FOR UPDATE; aktivitás és audit egy tranzakció. A már meglévő followups UUID elsődleges kulcs a jóváhagyás UUID-jét használja. Pontos azonosság szükséges visszaolvasáskor; újrapróbálás nem generál új sort. P0 service-only claim/finish változatlan. Backdate nincs, időt szerver ad.

Éles ellenőrzés: followups meglévő primary key, RLS és owner-assignment trigger, activities hat oszlop. Üzleti adat tesztelés céljából nem változik. Rollback csak az új RPC törlését tartalmazza, minden sor megmarad.