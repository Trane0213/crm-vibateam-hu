/**
 * P7 — az összevont migrációs terv izolált próbája PGlite-ban (WASM Postgres), kitalált TESZT-sorokkal.
 * NEM éles adatbázis. A szükséges meglévő függvények (crm_role_of, is_owner_role, current_profile_id, can_access_quote,
 * quotes_lock_guard) az éles definíció másolatai; a táblák csak a próbához szükséges oszlopokat tartalmazzák.
 * Futtatás (a PGlite nem projektfüggőség):  mkdir -p /tmp/pgl && (cd /tmp/pgl && bun add @electric-sql/pglite)
 *   NODE_PATH=/tmp/pgl/node_modules bun scripts/qa/p7-migration-pglite.ts
 */
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const MIG = readFileSync("docs/system-map/p7-migracio/01_p7_osszevont_migracio.sql", "utf8");
const RB = readFileSync("docs/system-map/p7-migracio/99_rollback_p7.sql", "utf8");
const U = { owner: "00000000-0000-4000-8000-0000000000a1", sales: "00000000-0000-4000-8000-0000000000a2", sales2: "00000000-0000-4000-8000-0000000000a3", pm: "00000000-0000-4000-8000-0000000000a4", mkt: "00000000-0000-4000-8000-0000000000a5" };
const Q = { recv: "10000000-0000-4000-8000-000000000001", own: "10000000-0000-4000-8000-000000000002", locked: "10000000-0000-4000-8000-000000000003", other: "10000000-0000-4000-8000-000000000004" };
const D = { priced: "20000000-0000-4000-8000-000000000001", scope: "20000000-0000-4000-8000-000000000002", otherPriced: "20000000-0000-4000-8000-000000000003" };
const FP = "a".repeat(64), FP2 = "b".repeat(64), CALC = "0123abcd";

const SETUP = `
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
CREATE TABLE public.roles (id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE public.users_profile (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), auth_user_id uuid UNIQUE, role_id uuid REFERENCES public.roles(id));
CREATE TABLE public.leads (id uuid PRIMARY KEY, assigned_to uuid);
CREATE TABLE public.projects (id uuid PRIMARY KEY, lead_id uuid, project_manager_user_id uuid);
CREATE TABLE public.quotes (id uuid PRIMARY KEY, lead_id uuid, project_id uuid, created_by uuid, title text, quote_kind text, manual_net_amount numeric, locked_at timestamptz, status text, is_current boolean DEFAULT true, total_amount numeric, sent_at timestamptz);
CREATE TABLE public.quote_documents (id uuid PRIMARY KEY, quote_id uuid NOT NULL REFERENCES public.quotes(id), name text, document_type text NOT NULL, file_url text);
CREATE TABLE public.document_packages (id uuid PRIMARY KEY);
CREATE TABLE public.package_files (id uuid PRIMARY KEY, package_id uuid REFERENCES public.document_packages(id));
CREATE TABLE public.package_processing_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), file_id uuid NOT NULL REFERENCES public.package_files(id), package_id uuid NOT NULL REFERENCES public.document_packages(id),
  status text NOT NULL DEFAULT 'queued', attempt integer NOT NULL DEFAULT 0, token uuid NOT NULL DEFAULT gen_random_uuid(), requested_by uuid NOT NULL,
  dispatched_at timestamptz, heartbeat_at timestamptz, finished_at timestamptz, error_code text, error_detail text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE FUNCTION public.crm_role_of(_auth_user uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT lower(r.name) FROM public.users_profile up JOIN public.roles r ON r.id = up.role_id WHERE up.auth_user_id = _auth_user LIMIT 1 $$;
CREATE FUNCTION public.is_owner_role(_auth_user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.users_profile up JOIN public.roles r ON r.id = up.role_id WHERE up.auth_user_id = _auth_user AND lower(r.name) IN ('owner','tulajdonos','admin','superadmin')) $$;
CREATE FUNCTION public.current_profile_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$ SELECT id FROM public.users_profile WHERE auth_user_id = auth.uid() LIMIT 1 $$;
CREATE FUNCTION public.can_access_quote(_lead_id uuid, _project_id uuid, _created_by uuid) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r text; uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN false; END IF;
  IF is_owner_role(uid) THEN RETURN true; END IF;
  r := crm_role_of(uid);
  IF _lead_id IS NULL AND _project_id IS NULL THEN RETURN r IN ('sales','project_manager','pm') AND _created_by = current_profile_id(); END IF;
  IF r = 'sales' THEN
    RETURN EXISTS (SELECT 1 FROM leads l WHERE l.id = _lead_id AND l.assigned_to = uid) OR EXISTS (SELECT 1 FROM projects p JOIN leads l ON l.id = p.lead_id WHERE p.id = _project_id AND l.assigned_to = uid);
  ELSIF r IN ('project_manager','pm') THEN
    RETURN EXISTS (SELECT 1 FROM projects p WHERE p.id = _project_id AND p.project_manager_user_id = uid) OR EXISTS (SELECT 1 FROM projects p WHERE p.lead_id = _lead_id AND _lead_id IS NOT NULL AND p.project_manager_user_id = uid);
  END IF;
  RETURN false;
END $$;
CREATE FUNCTION public.quotes_lock_guard() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF OLD.locked_at IS NOT NULL THEN
    IF NEW.locked_at IS DISTINCT FROM OLD.locked_at OR (to_jsonb(NEW) - ARRAY['is_current','status','project_id','total_amount','sent_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['is_current','status','project_id','total_amount','sent_at']) THEN
      RAISE EXCEPTION 'Kiküldött ajánlat nem módosítható — készíts új verziót' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER quotes_lock_guard BEFORE UPDATE ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.quotes_lock_guard();
GRANT SELECT, INSERT, UPDATE ON public.quotes TO authenticated; GRANT ALL ON public.quotes, public.quote_documents, public.package_processing_jobs, public.users_profile, public.roles, public.leads, public.projects, public.document_packages, public.package_files TO service_role;
GRANT SELECT ON public.quote_documents, public.package_processing_jobs TO authenticated;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY quotes_access ON public.quotes FOR ALL TO authenticated USING (can_access_quote(lead_id, project_id, created_by)) WITH CHECK (can_access_quote(lead_id, project_id, created_by));
ALTER TABLE public.quote_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY quote_documents_select ON public.quote_documents FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM quotes q WHERE q.id = quote_id AND can_access_quote(q.lead_id, q.project_id, q.created_by)));
ALTER TABLE public.package_processing_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY package_processing_jobs_select ON public.package_processing_jobs FOR SELECT TO authenticated USING (true);
-- TESZT-sorok
INSERT INTO public.roles VALUES ('30000000-0000-4000-8000-000000000001','owner'),('30000000-0000-4000-8000-000000000002','sales'),('30000000-0000-4000-8000-000000000003','project_manager'),('30000000-0000-4000-8000-000000000004','marketing');
INSERT INTO public.users_profile (auth_user_id, role_id) VALUES ('${U.owner}','30000000-0000-4000-8000-000000000001'),('${U.sales}','30000000-0000-4000-8000-000000000002'),('${U.sales2}','30000000-0000-4000-8000-000000000002'),('${U.pm}','30000000-0000-4000-8000-000000000003'),('${U.mkt}','30000000-0000-4000-8000-000000000004');
INSERT INTO public.leads VALUES ('40000000-0000-4000-8000-000000000001','${U.sales}'),('40000000-0000-4000-8000-000000000002','${U.sales2}');
INSERT INTO public.projects VALUES ('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','${U.pm}');
INSERT INTO public.quotes (id, lead_id, title, quote_kind, manual_net_amount, locked_at, status) VALUES
 ('${Q.recv}','40000000-0000-4000-8000-000000000001','TESZT kapott','received_budget',1250000,NULL,'draft'),
 ('${Q.own}','40000000-0000-4000-8000-000000000001','TESZT saját','viba_offer',NULL,NULL,'draft'),
 ('${Q.locked}','40000000-0000-4000-8000-000000000001','TESZT zárolt','received_budget',900000,now(),'sent'),
 ('${Q.other}','40000000-0000-4000-8000-000000000002','TESZT más Sales','received_budget',500000,NULL,'draft');
INSERT INTO public.quote_documents VALUES ('${D.priced}','${Q.recv}','TESZT_arazott.xlsx','priced_budget','k1'),('${D.scope}','${Q.recv}','TESZT_lehatarolas.docx','technical_scope','k2'),('${D.otherPriced}','${Q.other}','TESZT_mas.xlsx','priced_budget','k3');
INSERT INTO public.document_packages VALUES ('60000000-0000-4000-8000-000000000001'); INSERT INTO public.package_files VALUES ('70000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001');
INSERT INTO public.package_processing_jobs (file_id, package_id, requested_by) VALUES ('70000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','${U.sales}');
`;

const db = new PGlite();
let pass = 0, fail = 0;
const results: string[] = [];
function check(name: string, ok: boolean, detail = "") { ok ? pass++ : fail++; results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`); }
async function as<T = Record<string, unknown>>(who: keyof typeof U | "service" | null, sql: string, params: unknown[] = []): Promise<{ rows: T[]; affected: number; error: string | null }> {
  await db.exec("RESET ROLE");
  await db.query("SELECT set_config('test.uid', $1, false)", [who && who !== "service" ? U[who] : ""]);
  if (who === "service") await db.exec("SET ROLE service_role"); else if (who) await db.exec("SET ROLE authenticated");
  try { const r = await db.query<T>(sql, params); return { rows: r.rows, affected: r.affectedRows ?? 0, error: null }; }
  catch (e) { return { rows: [], affected: 0, error: (e as Error).message }; }
  finally { await db.exec("RESET ROLE"); }
}
const calcIns = (quote: string, kind: string, calc = CALC) => `INSERT INTO public.quote_calculations (quote_id, kind, calc_id, engine_version, input, result_summary, net_huf, complete, created_by) VALUES ('${quote}','${kind}','${calc}','P6-calc-1','{}','{}',1250000,true,'${U.sales}') RETURNING id`;
const apprIns = (o: { quote?: string; fp?: string; net?: number; priced?: string; scope?: string; by?: string; role?: string; acks?: string } = {}) =>
  `INSERT INTO public.quote_package_approvals (quote_id, fingerprint, offer_net_huf, priced_document_id, scope_document_id, acks, approved_by, approved_role) VALUES ('${o.quote ?? Q.recv}','${o.fp ?? FP}',${o.net ?? 1250000},'${o.priced ?? D.priced}','${o.scope ?? D.scope}','${o.acks ?? "{excel_reviewed,scope_reviewed}"}','${o.by ?? U.sales}','${o.role ?? "sales"}') RETURNING id`;

await db.exec(SETUP);
const before = (await db.query<{ n: number }>("SELECT count(*)::int n FROM public.quotes")).rows[0]!.n;
try { await db.exec(MIG); check("Migráció lefut egy tranzakcióban", true); } catch (e) { check("Migráció lefut egy tranzakcióban", false, (e as Error).message); }
check("Meglévő ajánlatsorok változatlanok (darabszám, pricing_mode NULL)", (await db.query<{ n: number; m: number }>("SELECT count(*)::int n, count(pricing_mode)::int m FROM public.quotes")).rows[0]!.n === before && (await db.query<{ m: number }>("SELECT count(pricing_mode)::int m FROM public.quotes")).rows[0]!.m === 0);

// A) pricing_mode
check("A: Sales a saját (nem zárolt) ajánlatán beállíthatja az árazási módot", (await as("sales", `UPDATE public.quotes SET pricing_mode='subcontractor_labor' WHERE id='${Q.recv}'`)).affected === 1);
check("A: érvénytelen árazási mód elutasítva", /pricing_mode_check/.test((await as("sales", `UPDATE public.quotes SET pricing_mode='ismeretlen' WHERE id='${Q.recv}'`)).error ?? ""));
check("A: kiküldött (zárolt) ajánlaton nem állítható (meglévő quotes_lock_guard)", /nem módosítható/.test((await as("owner", `UPDATE public.quotes SET pricing_mode='custom' WHERE id='${Q.locked}'`)).error ?? ""));
check("A: más Sales ajánlatát nem éri el (0 sor)", (await as("sales", `UPDATE public.quotes SET pricing_mode='custom' WHERE id='${Q.other}'`)).affected === 0);

// B) quote_calculations
for (const who of ["sales", "owner"] as const) check(`B: kliens (${who}) nem írhat számítást közvetlenül`, /permission denied/.test((await as(who, calcIns(Q.recv, "received_budget_pricing"))).error ?? ""));
const calc = await as<{ id: string }>("service", calcIns(Q.recv, "received_budget_pricing"));
check("B: szerverfüggvény (szolgáltatásszerepkör) rögzíthet számítást", !calc.error && calc.rows.length === 1, calc.error ?? "");
check("B: VIBA-kalkuláció kapott költségvetésen elutasítva", /csak saját VIBA/.test((await as("service", calcIns(Q.recv, "viba_offer_calc", "11112222"))).error ?? ""));
check("B: árazás saját VIBA-ajánlaton elutasítva", /csak kapott/.test((await as("service", calcIns(Q.own, "received_budget_pricing", "33334444"))).error ?? ""));
check("B: zárolt ajánlathoz nem rögzíthető", /zárolt/.test((await as("service", calcIns(Q.locked, "received_budget_pricing", "55556666"))).error ?? ""));
check("B: ugyanaz a számítás kétszer nem rögzíthető", /duplicate key|unique/.test((await as("service", calcIns(Q.recv, "received_budget_pricing"))).error ?? ""));
check("B: rögzített számítás nem módosítható", /nem módosítható/.test((await as("service", `UPDATE public.quote_calculations SET complete=false`)).error ?? ""));
check("B: rögzített számítás nem törölhető", /nem módosítható/.test((await as("service", `DELETE FROM public.quote_calculations`)).error ?? ""));
const seeCalc = async (who: keyof typeof U) => (await as(who, "SELECT id FROM public.quote_calculations")).rows.length;
check("B: olvasás — Owner 1, saját Sales 1, más Sales 0, PM 0, Marketing 0", (await seeCalc("owner")) === 1 && (await seeCalc("sales")) === 1 && (await seeCalc("sales2")) === 0 && (await seeCalc("pm")) === 0 && (await seeCalc("mkt")) === 0);
check("B: névtelen (anon) nem olvas", !!(await (async () => { await db.exec("SET ROLE anon"); try { await db.query("SELECT 1 FROM public.quote_calculations"); return null; } catch (e) { return (e as Error).message; } finally { await db.exec("RESET ROLE"); } })()));

// C) quote_package_approvals
check("C: kliens (Sales) nem írhat jóváhagyást közvetlenül", /permission denied/.test((await as("sales", apprIns())).error ?? ""));
const okAppr = await as("service", apprIns());
check("C: érvényes jóváhagyás rögzíthető (szerverfüggvény)", !okAppr.error, okAppr.error ?? "");
check("C: ugyanarra az ujjlenyomatra másodszor nem", /duplicate key|unique/.test((await as("service", apprIns())).error ?? ""));
check("C: eltérő mentett nettó elutasítva", /nettó nem egyezik/.test((await as("service", apprIns({ fp: FP2, net: 1249999 }))).error ?? ""));
check("C: más ajánlat dokumentuma elutasítva", /nem ehhez az ajánlathoz/.test((await as("service", apprIns({ fp: FP2, priced: D.otherPriced }))).error ?? ""));
check("C: felcserélt dokumentumtípus elutasítva", /nem ehhez az ajánlathoz/.test((await as("service", apprIns({ fp: FP2, priced: D.scope, scope: D.priced }))).error ?? ""));
check("C: Sales „owner” szerepkörrel nem hagyhat jóvá", /szerepkör nem egyezik/.test((await as("service", apprIns({ fp: FP2, role: "owner" }))).error ?? ""));
check("C: Marketing/PM jóváhagyó elutasítva", /nem Tulajdonos\/Sales/.test((await as("service", apprIns({ fp: FP2, by: U.mkt }))).error ?? "") && /nem Tulajdonos\/Sales/.test((await as("service", apprIns({ fp: FP2, by: U.pm }))).error ?? ""));
check("C: zárolt ajánlat nem hagyható jóvá", /zárolt/.test((await as("service", apprIns({ quote: Q.locked, net: 900000 }))).error ?? ""));
check("C: hiányzó kötelező nyugtázás elutasítva", /check/.test((await as("service", apprIns({ fp: FP2, acks: "{excel_reviewed}" }))).error ?? ""));
check("C: ismeretlen nyugtázás elutasítva", /check/.test((await as("service", apprIns({ fp: FP2, acks: "{excel_reviewed,scope_reviewed,mindent_elfogadok}" }))).error ?? ""));
check("C: hamis ujjlenyomat elutasítva", /check/.test((await as("service", apprIns({ fp: "nem-hash" }))).error ?? ""));
check("C: jóváhagyás nem módosítható / nem törölhető", /nem módosítható/.test((await as("service", `UPDATE public.quote_package_approvals SET offer_net_huf = 1`)).error ?? "") && /nem módosítható/.test((await as("service", `DELETE FROM public.quote_package_approvals`)).error ?? ""));
check("C: dokumentum jóváhagyás alatt nem törölhető (FK RESTRICT)", /foreign key|violates/.test((await as("service", `DELETE FROM public.quote_documents WHERE id='${D.priced}'`)).error ?? ""));
const seeAppr = async (who: keyof typeof U) => (await as(who, "SELECT id FROM public.quote_package_approvals")).rows.length;
check("C: olvasás — Owner 1, saját Sales 1, más Sales 0, PM 0, Marketing 0", (await seeAppr("owner")) === 1 && (await seeAppr("sales")) === 1 && (await seeAppr("sales2")) === 0 && (await seeAppr("pm")) === 0 && (await seeAppr("mkt")) === 0);

// D) díjtörzs
const card = await as<{ id: string }>("sales", `INSERT INTO public.pricing_rate_cards (label, version) VALUES ('TESZT díjtörzs', 1) RETURNING id`);
check("D: Sales tervezet díjtörzset hozhat létre", !card.error && card.rows.length === 1, card.error ?? "");
const cid = card.rows[0]?.id;
check("D: Marketing nem hozhat létre díjtörzset", /row-level security/.test((await as("mkt", `INSERT INTO public.pricing_rate_cards (label, version) VALUES ('TESZT M', 1)`)).error ?? ""));
check("D: PM nem látja a díjtörzset", (await as("pm", "SELECT id FROM public.pricing_rate_cards")).rows.length === 0);
check("D: új díjtörzs nem indulhat jóváhagyottként", !!(await as("owner", `INSERT INTO public.pricing_rate_cards (label, version, status) VALUES ('TESZT X', 1, 'approved')`)).error);
check("D: Owner üres díjtörzset nem hagyhat jóvá", /üres/.test((await as("owner", `UPDATE public.pricing_rate_cards SET status='approved' WHERE id='${cid}'`)).error ?? ""));
check("D: Sales tételt vehet fel a tervezetbe (forrásmegjegyzéssel)", !(await as("sales", `INSERT INTO public.pricing_rate_card_items (card_id, kind, code, label, unit, basis, huf, source_note) VALUES ('${cid}','hourly_role','villanyszerelo','TESZT villanyszerelő óradíj','óra','sell',1000,'TESZT, nem VIBA-tarifa')`)).error);
check("D: forrásmegjegyzés nélküli / kettős értékű / alap nélküli tétel elutasítva",
  !!(await as("sales", `INSERT INTO public.pricing_rate_card_items (card_id, kind, code, label, unit, basis, huf, source_note) VALUES ('${cid}','fee','a','TESZT','alkalom','sell',1000,' ')`)).error
  && !!(await as("sales", `INSERT INTO public.pricing_rate_card_items (card_id, kind, code, label, unit, basis, huf, pct, source_note) VALUES ('${cid}','surcharge','b','TESZT','%','sell',1000,10,'TESZT')`)).error
  && !!(await as("sales", `INSERT INTO public.pricing_rate_card_items (card_id, kind, code, label, unit, huf, source_note) VALUES ('${cid}','fee','c','TESZT','alkalom',1000,'TESZT')`)).error);
check("D: Sales nem hagyhat jóvá", /csak Tulajdonos/.test((await as("sales", `UPDATE public.pricing_rate_cards SET status='approved' WHERE id='${cid}'`)).error ?? ""));
check("D: Sales nem írhatja be magát jóváhagyónak", !!(await as("sales", `UPDATE public.pricing_rate_cards SET approved_by='${U.sales}', approved_at=now() WHERE id='${cid}'`)).error);
const appr = await as<{ approved_by: string }>("owner", `UPDATE public.pricing_rate_cards SET status='approved' WHERE id='${cid}' RETURNING approved_by`);
check("D: Owner jóváhagy; jóváhagyó = a hívó Owner", !appr.error && appr.rows[0]?.approved_by === U.owner, appr.error ?? "");
check("D: jóváhagyott díjtörzs tétele nem módosítható (Sales: 0 sor, szolgáltatásszerepkör: elutasítva)",
  (await as("sales", `UPDATE public.pricing_rate_card_items SET huf=2000 WHERE card_id='${cid}'`)).affected === 0
  && /csak tervezet/.test((await as("service", `UPDATE public.pricing_rate_card_items SET huf=2000 WHERE card_id='${cid}'`)).error ?? ""));
check("D: jóváhagyott díjtörzshöz nem vehető fel új tétel", !!(await as("service", `INSERT INTO public.pricing_rate_card_items (card_id, kind, code, label, unit, basis, huf, source_note) VALUES ('${cid}','fee','d','TESZT','alkalom','sell',1000,'TESZT')`)).error);
check("D: jóváhagyott díjtörzs címke/verzió nem módosítható", !!(await as("owner", `UPDATE public.pricing_rate_cards SET label='Átírt' WHERE id='${cid}'`)).error);
check("D: jóváhagyott díjtörzs nem törölhető", !!(await as("service", `DELETE FROM public.pricing_rate_cards WHERE id='${cid}'`)).error);
check("D: Owner visszavonhatja; visszavont nem állítható vissza tervezetté",
  !(await as("owner", `UPDATE public.pricing_rate_cards SET status='retired' WHERE id='${cid}'`)).error
  && !!(await as("owner", `UPDATE public.pricing_rate_cards SET status='draft', approved_by=NULL, approved_at=NULL WHERE id='${cid}'`)).error);

// E) token
check("E: bejelentkezett felhasználó nem olvassa a feladat-tokent", /permission denied/.test((await as("sales", "SELECT token FROM public.package_processing_jobs")).error ?? ""));
check("E: a csomagjelentés oszlopai továbbra is olvashatók", (await as("sales", "SELECT file_id,status,error_code,heartbeat_at,dispatched_at,created_at FROM public.package_processing_jobs")).rows.length === 1);
check("E: select(*) a kliensről ettől kezdve hibát ad (a kódban nincs ilyen hívás)", /permission denied/.test((await as("sales", "SELECT * FROM public.package_processing_jobs")).error ?? ""));
check("E: a szolgáltatásszerepkör a tokent olvassa", (await as("service", "SELECT token FROM public.package_processing_jobs")).rows.length === 1);

// Visszaállítás és újrafuttatás
try { await db.exec(RB); check("Visszaállítás lefut", true); } catch (e) { check("Visszaállítás lefut", false, (e as Error).message); }
const left = (await db.query<{ n: number }>(`SELECT count(*)::int n FROM pg_class WHERE relname IN ('quote_calculations','quote_package_approvals','pricing_rate_cards','pricing_rate_card_items')`)).rows[0]!.n;
const col = (await db.query<{ n: number }>(`SELECT count(*)::int n FROM information_schema.columns WHERE table_name='quotes' AND column_name='pricing_mode'`)).rows[0]!.n;
const fns = (await db.query<{ n: number }>(`SELECT count(*)::int n FROM pg_proc WHERE proname LIKE 'p7_%' OR proname IN ('quote_calculations_guard','quote_package_approvals_guard','pricing_rate_cards_guard','pricing_rate_card_items_guard')`)).rows[0]!.n;
check("Visszaállítás után nincs P7-objektum (tábla, oszlop, függvény)", left === 0 && col === 0 && fns === 0, `táblák ${left}, oszlop ${col}, függvények ${fns}`);
check("Visszaállítás után a token ismét a P2 szerint olvasható", (await as("sales", "SELECT token FROM public.package_processing_jobs")).rows.length === 1);
check("Visszaállítás után a meglévő ajánlatok megvannak", (await db.query<{ n: number }>("SELECT count(*)::int n FROM public.quotes")).rows[0]!.n === before);
try { await db.exec(MIG); check("Visszaállítás után a migráció újra lefut", true); } catch (e) { check("Visszaállítás után a migráció újra lefut", false, (e as Error).message); }

console.log(results.join("\n"));
console.log(`\nÖsszesen: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
