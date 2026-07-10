# Michael — Google Ads Specialista (Technikai terv, v3)

## 0) Alapelv — Michael elsődleges célja

**Michael elsődleges célja NEM a Google Ads mutatóinak javítása, hanem a VIBA-TEAM üzleti céljainak támogatása.**

- Ha egy Google Ads ajánlás (vagy bármilyen metrika-javító lépés) ellentmond a VIBA Ads Constitutionnek vagy a tulajdonos által meghatározott stratégiának, akkor Michael **nem hajthatja végre**, és **köteles ezt egyértelműen jelezni** — akkor is, ha az adott lépés a CTR-t, CPC-t, CPA-t vagy ROAS-t javítaná.
- A metrikák eszközök, nem célok.
- Hard szabály, minden run elején a system prompt tetején. A javaslati sablonba (9. pont) beépül egy `ÜZLETI CÉL-ILLESZKEDÉS` sor.

---

Michael önálló **specialista agent** a meglévő AI OS-en belül. Nem új rendszer, nem külön chat, nem külön memória. Ugyanaz a runtime, tool registry, `ai_memory`, `agent_runs` napló, ugyanaz az OpenAI provider (`gpt-4o-mini`), ugyanaz a chat UI. Új elemek: `AgentDefinition` (michael), `ads.google` tool-domain + adapter, Google OAuth, Owner-only jogosultság, **háromszintű approval + Dry Run**, **VIBA Ads Constitution**, **számított baseline**, **change history**.

---

## 1) AI OS integráció

- Új `AGENTS.michael` (`src/lib/ai-os/agents.ts`), önálló specialista. Közvetlenül elérhető `/ai-assistant?agent=michael`; George opcionálisan delegálhat, de nem kötelező.
- Érintetlen: `runtime.server.ts`, `providers.server.ts`, `tool-registry.ts`, `memory.server.ts`, `audit.server.ts`, `ai_threads`/`ai_messages`, `AgentGate`, chat route-ok.
- Új komponensek:
  - `src/lib/ai-os/adapters/google-ads-tools.server.ts`
  - `src/lib/google-ads/oauth.server.ts` + `client.server.ts`
  - `src/routes/api/google-ads/oauth.start.ts`, `.../oauth.callback.ts`
  - `src/routes/_authenticated/settings.google-ads.tsx` (connect + Constitution)
  - Migráció: `google_ads_connections`, `google_ads_constitution`, `google_ads_snapshots`, `google_ads_change_log` (RLS owner-only + grants).

---

## 2) Google Ads API

- Google Ads API v17 (REST, Workers-kompatibilis).
- OAuth 2.0: `access_type=offline`, `prompt=consent`, PKCE state cookie.
- Scope: `.../auth/adwords` + `openid email`.
- Access token in-memory cache 55 perc TTL; refresh token AES-GCM titkosítva DB-ben. `invalid_grant` → `revoked`.
- Fejélcek: `Authorization: Bearer`, `developer-token`, `login-customer-id` (opcionális MCC).
- Secretek: `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_TOKEN_ENC_KEY` (`generate_secret`).

---

## 3) Tool architektúra — üzleti nevekkel, adatszolgáltató szereppel

Domain: **`ads.google`**. A toolok üzleti fogalmakat képviselnek, nem API végpontokat. **Egyik sem hoz ítéletet** — az ítéletet, auditot, javaslatot Michael maga állítja össze a system prompt kötelező sablonjai szerint.

```text
[ads.google] — READ (SAFE, ítélet nélkül)
  list_ads_accounts
  get_account_snapshot            — spend/CTR/CPA/ROAS idősoron (nyers Ads API)
  list_campaigns
  get_campaign_performance
  list_ad_groups
  list_keywords
  list_search_terms
  list_ads
  get_budget_status
  get_conversion_setup
  get_google_recommendations      — CSAK BEMENET, háttér-jelzés
  get_baseline_comparison         — számított nézet (lásd 6. pont)
  get_change_history

[ads.google] — WRITE (üzleti nevek)
  pause_campaign                  — CONFIRM
  enable_campaign                 — CONFIRM
  change_campaign_budget          — CONFIRM
  add_negative_keyword            — CONFIRM
  pause_keyword                   — CONFIRM
  pause_ad                        — CONFIRM
  apply_google_recommendation     — CONFIRM (csak saját indoklással)
  delete_campaign                 — DANGEROUS
  change_conversion_action        — DANGEROUS
  change_conversion_tracking      — DANGEROUS
  change_bid_strategy_type        — DANGEROUS
```

Nincs `audit_report` tool. Google recommendations = bemenet, nem kimenet.

---

## 4) Approval — háromszintű + kötelező Dry Run

Új `ToolSpec` mező: `approval: "safe" | "confirm" | "dangerous"`.

| Szint | Viselkedés |
|-------|------------|
| **SAFE** | Nincs kérdés. Minden READ. |
| **CONFIRM** | Dry Run + egy jóváhagyó dialógus. |
| **DANGEROUS** | Dry Run + két lépcsős megerősítés (második lépés szöveges: "ERŐSÍTS MEG"). |

**Dry Run — minden CONFIRM és DANGEROUS write előtt kötelező.**

- Michael **nem** hívja közvetlenül a write toolt. Először a `dry_run` fázist futtatja: az AI OS runtime a tool-call-t `mode=dry_run` paraméterrel indítja el, a tool implementáció ilyenkor **nem küld módosítást a Google API felé**, hanem összegyűjti és visszaadja pontosan azt, amit végrehajtana.
- Dry Run kimenet — kötelező struktúra, ez jelenik meg a jóváhagyó dialógusban:
  ```text
  DRY RUN — <tool_name>
  API HÍVÁSOK (sorrendben):
    1. GoogleAds.<Service>.<Method>(...)     — 1 mutate
    2. ...
  MI VÁLTOZIK:
    - <entity>#<id>: <field>  "<előtte>" → "<utána>"
    - ...
  ÉRINTETT KAPCSOLÓDÓ ELEMEK: <pl. érintett ad_group-ok, aktív hirdetések száma>
  VISSZAVONHATÓ?              <igen / részben / nem>
  ALKOTMÁNY-ELLENŐRZÉS:       <mely szabályokkal konzisztens>
  BASELINE HATÁS BECSLÉS:     <várható eltérés a baseline-hoz képest, tartomány>
  ```
- Csak a Dry Run **felhasználói jóváhagyása** után megy be egy második tool-call `mode=execute`-tal, ami a valódi API-hívás.
- Runtime státuszok az `agent_run_steps`-ben: `dry_run_ready` → `awaiting_approval` → `executed` / `denied`.
- DANGEROUS toolnál a második lépcső Dry Run + második megerősítés együtt.
- Minden `execute` fázis után kötelező bejegyzés a `google_ads_change_log`-ba (mi, ki, mikor, indoklás, előtte-utána, Dry Run referencia).

**Miért így:** a Dry Run pontosan mutatja, milyen API-hívás megy ki és mi változik meg, mielőtt a végleges "OK" gomb megnyomódna. Nincs "elküldés utáni meglepetés".

---

## 5) VIBA Ads Constitution — kötelező szabályrendszer

Nem memória, hanem alkotmány. Minden run elején a system prompt része.

**Tábla:** `google_ads_constitution` (`rule_key`, `rule_text` magyarul, `severity: hard|soft`, owner-only RLS). Szerkeszthető a Settings → Google Ads oldalon.

Példa induló szabályok (a userrel véglegesítjük):
- Lakossági szolgáltatás → mindig külön Search kampány, PMAX-be nem kerülhet.
- PMAX csak akkor javasolt, ha havi költés > X Ft és van saját asset-készlet.
- Brand kampányhoz Michael nem nyúlhat (pause / budget / bid tiltott).
- Társasház ajánlatokhoz külön landing kötelező.

A `buildSystemPrompt` betölti a `hard` szabályokat kötelező szekcióba. Ha egy tool-call ütközik egy `hard` szabállyal, Michael köteles elutasítani és megnevezni a szabályt.

---

## 6) Baseline — **számított nézet, nem kézzel karbantartott tábla**

**Nincs kézzel írt/karbantartott baseline adatmodell.** A baseline mindig a meglévő snapshot-adatokból, futásidőben áll elő.

**Alap forrás:** `google_ads_snapshots` — a `get_account_snapshot` és `get_campaign_performance` eredményét naponta egyszer (M7+ cron), addig kérésre eltárolja: `snapshotted_at`, `scope` (`account`/`campaign`/`ad_group`), `entity_id`, `metrics_json` (spend/CTR/CPC/CPA/ROAS/conv/IS). Read-only tábla — Michael és a user nem szerkeszti.

**Baseline = számított nézet a snapshotok fölött.** Egy Postgres view + egy `get_baseline_comparison(entity_type, entity_id?, window_days=30, compare_last_days=7)` tool. A tool:
- kiválasztja a `window_days`-en belüli snapshot sorokat,
- kiszámolja a rolling median-t (robusztus outlier ellen) metrikánként,
- lekéri a `compare_last_days` aktuális értékeit ugyanabból a snapshot táblából (vagy élő Ads API-ból, ha kimarad),
- visszaadja: `baseline`, `current`, `delta_abs`, `delta_pct`, `sample_size`, `stale?` (ha kevés a snapshot, jelezi).

**Miért így jobb:**
- Nincs duplikált igazságforrás, nincs kézzel szerkeszthető szám.
- A baseline definíció megváltoztatásához nem kell adatot migrálni, csak a view/számítás módosul.
- Ha a snapshot job szünetel, a baseline `stale=true`-t jelez, Michael nem következtet romlott adatból.
- Fiók-agnosztikus: később ugyanez a séma működik Meta/TikTok snapshotokra.

**Cache:** a számítás eredményét a `get_baseline_comparison` tool `ai_memory`-ba írhatja rövid TTL-lel (subject: `ads_baseline_cache`), csak gyorsításra — nem igazságforrás.

---

## 7) Change history — ok-okozat követés

**Tábla:** `google_ads_change_log` (`changed_at`, `entity`, `entity_id`, `field`, `old_value`, `new_value`, `changed_by: michael|user|google_auto`, `reason`, `dry_run_ref`).
- Minden Michael-`execute` után kötelezően ide íródik.
- Napi job szinkronizálja a Google Ads `change_event` streamet is (kézi módosítások is bekerülnek).
- `get_change_history` tool: Michael így köti össze "Jul 12 budget nőtt → Jul 15 CPA romlott".

---

## 8) Michael személyisége

Precíz, tömör, marketinges duma nélkül. Minden állítás mögé szám és forrás (tool, időszak, baseline eltérés %). Ha nincs elég adat, kimondja. Nem motivál, nem lelkesít. Magyarul, üzleti szaknyelven. Portré/kártya az `AGENT_REGISTRY`-ben.

---

## 9) Vaskötelező javaslati sablon

```text
MIT TALÁLTAM:           <metrika, időszak, forrás tool>
MIÉRT PROBLÉMA:         <baseline vagy alkotmány szemszöge>
ÜZLETI CÉL-ILLESZKEDÉS: <milyen VIBA-TEAM üzleti célt szolgál — kötelező>
MIT JAVASLOK:           <konkrét write tool + paraméterek>
MIÉRT EZT:              <ok-okozati indoklás, change history hivatkozás>
VÁRHATÓ HATÁS:          <mérhető KPI, +/- tartomány>
BIZONYTALANSÁG:         <alacsony / közepes / magas + indok>
ALKOTMÁNY-ELLENŐRZÉS:   <konzisztens; ütközés esetén ELVETVE>
```

Bármelyik "nem tudom" → nincs javaslat. `ÜZLETI CÉL-ILLESZKEDÉS` = csak metrika → automatikusan **ELVETVE**.

Végrehajtás előtt kötelező a **Dry Run** (4. pont).

---

## 10) Chat működés

- Belépés: közvetlen kártyáról, vagy George handoffal.
- Példák (system promptban is):
  - "Michael, nézd át a Google Ads fiókomat." → snapshot + baseline (számított) + change log + alkotmány → audit.
  - "Michael, miért romlott ez a kampány?" → performance + change history + baseline → diagnózis.
  - "Michael, mit javasolsz?" → javaslatlista sablonban, Dry Run-nal.
  - "Michael, készíts optimalizálási tervet." → strukturált terv, write-ok CONFIRM/DANGEROUS + Dry Run-ra várva.

---

## 11) Sprintek

Minden sprint végén STOP + user jóváhagyás.

- **M0 — Előkészítés (user).** Google Cloud projekt + OAuth kliens, developer token, secretek, Constitution első szabályai.
- **M1 — Kapcsolat + jogosultság.** Migrációk (connections, constitution, snapshots, change_log), OAuth route-ok, Settings oldal, token cache + refresh, Michael kártya (Owner-only), agent regisztráció tool nélkül.
- **M2 — Read API csak működjön.** ✅ Kész. Az összes SAFE READ tool. Snapshot-írás minden `get_account_snapshot`/`get_campaign_performance` hívásnál (a nyers Ads API válaszból tárol). Michael képes adatot lekérni.
- **M3 — Elemzés (nincs javaslat, nincs write).** ✅ Kész (2026-07-10). `get_baseline_comparison` (rolling median a `google_ads_snapshots` fölött, stale jelzéssel), `get_change_history` (`google_ads_change_log` olvasás). Runtime `augmentSystemPrompt` mechanizmus: Michael system promptja minden futásnál betölti az enabled HARD/SOFT VIBA Ads Constitution szabályokat. Kötelező elemzési protokoll: snapshot → baseline → change history → alkotmány-check. Minden állítás mögé forrás (tool, időszak, baseline Δ%).
- **M4 — Javaslat (nincs write).** ✅ Kész (2026-07-10). Michael system promptjába beépült a 8-mezős VASKÖTELEZŐ javaslati sablon (MIT TALÁLTAM / MIÉRT PROBLÉMA / ÜZLETI CÉL-ILLESZKEDÉS / MIT JAVASLOK / MIÉRT EZT / VÁRHATÓ HATÁS / BIZONYTALANSÁG / ALKOTMÁNY-ELLENŐRZÉS). Szabályok: hiányzó mező → "Javaslat visszatartva"; csak metrika-cél → ELVETVE; HARD alkotmány-ütközés → ELVETVE rule_key-vel; SOFT ütközés → engedélyezett de bizonytalanság min. közepes. A "MIT JAVASLOK" a jövőbeli write tool nevét+paramétereit szövegben adja, hívás nélkül. Egyszerű adatkérés nem trigger. Write toolok és Dry Run az M5–M6-ban.
- **M5 — Approval + Dry Run infrastruktúra.** `ToolSpec.approval` mező, runtime `dry_run_ready` → `awaiting_approval` → `executed`, `mode: dry_run | execute` a tool paramétereiben. Chat UI: Dry Run panel + CONFIRM jóváhagyás + DANGEROUS második megerősítés. Egy demo `pause_campaign` dry-run módban végig.
- **M6 — Write toolok élesben.** CONFIRM: pause/enable/budget/negatívok/keyword/ad, `apply_google_recommendation`. DANGEROUS: delete_campaign, conversion, tracking, bid strategy. Minden `execute` után `change_log` bejegyzés, `dry_run_ref`-fel.
- **M7+ — Automatizmus.** Napi snapshot cron, Google `change_event` szinkron, riasztás alkotmány-sértésre vagy erős baseline-eltérésre. Későbbi domainek: `analytics.ga4`, `search.gsc`, `web.audit`, `tagmanager.gtm`.

---

## 12) UI terv

- `/ai-assistant?agent=michael` — chat + Dry Run panel + jóváhagyás UI.
- `/ai-assistants` gallery — Michael kártya (Owner-only).
- **Új** `/settings/google-ads` — connect/disconnect + customer választó + Constitution szerkesztő + snapshot állapot (utolsó frissítés, `stale?` jelzés). Owner-only.

---

## 13) Bővíthetőség

Új adatforrások új tool-domainként: `analytics.ga4`, `search.gsc`, `web.audit`, `tagmanager.gtm`, `crm.leads`. A snapshot + számított baseline + change_log séma csatorna-agnosztikus (Meta/TikTok is beköthető).

---

## Vasszabályok betartva

- **Michael elsődleges célja a VIBA-TEAM üzleti céljainak támogatása, nem a metrikák javítása.**
- **Baseline = számított nézet snapshotokból, nem kézzel karbantartott adat.**
- **Minden write előtt kötelező Dry Run** — pontos API-hívások és változások jóváhagyás előtt.
- Egy önálló specialista + `ads.google` domain + üzleti nevű toolok + háromszintű approval + alkotmány + számított baseline + change history — a meglévő AI OS-en belül.
- Owner-only jogosultság.
- Sprintek kicsik (M1..M7), egymástól függetlenül szállíthatók.
- Michael soha nem optimalizál pusztán Google-ajánlás alapján, és soha nem optimalizál, ha az ellentmond az alkotmánynak vagy a tulajdonosi stratégiának.

**Fejlesztés csak a v3 terv jóváhagyása után indul. Első kód-lépés az M1 migráció + OAuth + Settings + Michael-kártya — még tool nélkül.**
