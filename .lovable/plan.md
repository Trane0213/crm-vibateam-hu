# Michael — Google Ads Specialista (Technikai terv)

Michael egy új **specialista agent** a meglévő AI OS-en belül. **Nem** új AI rendszer, **nem** külön chat, **nem** külön memória. Ugyanaz a runtime, tool registry, `ai_memory`, `agent_runs` napló, ugyanaz az OpenAI provider (`gpt-4o-mini`), ugyanaz a chat UI. Csak: új `AgentDefinition` + új tool-domain (`ads.google`) + új adapter modul + Google OAuth secretek + Owner-only jogosultság.

---

## 1) AI OS integráció

**Hova kerül az agent struktúrában**
- Új sor a `AGENTS` regiszterben (`src/lib/ai-os/agents.ts`), id: `michael`.
- Nem orchestrator — specialista, mint Scarlet/Timothy/Boss.
- Kizárólag George-on keresztül hívható (handoff_to). Direkt is elérhető chatből, ha az Owner az `/ai-assistant?agent=michael` felületet nyitja.
- George system promptja bővül egy sorral: "Google Ads / kampányoptimalizálás → Michael".

**Újrahasznált (nem érintett) komponensek**
- `runtime.server.ts` (`runAgent`) — változatlan.
- `providers.server.ts` (OpenAI hívás) — változatlan.
- `tool-registry.ts` — változatlan; új domain (`ads.google`) csak regisztrációként jelenik meg.
- `memory.server.ts` + `ai_memory` tábla — változatlan; új `subject_type` értékek (`ads_account`, `ads_campaign`) minden migráció nélkül működnek (a séma szabad-szöveges).
- `audit.server.ts` (`agent_runs`, `agent_run_steps`) — változatlan.
- Chat UI: `/ai-assistant`, `AgentGate`, `AiSheet` — változatlan; csak az `AGENT_REGISTRY` (`visible-agents.ts`) kap új Michael kártyát.

**Új komponensek (minimalizálva)**
- `src/lib/ai-os/adapters/google-ads-tools.server.ts` — Google Ads toolok regisztrálása (read + write, minden write `needs_approval: true`).
- `src/lib/google-ads/oauth.server.ts` — OAuth2 authorize/callback + refresh token.
- `src/lib/google-ads/client.server.ts` — access token cache + `google-ads-api` (v17) SDK wrapper.
- Két új publikus route: `src/routes/api/google-ads/oauth.start.ts`, `.../oauth.callback.ts` — a meglévő `api/gmail/oauth.*` mintájára.
- Egy új Settings oldal: `src/routes/_authenticated/settings.google-ads.tsx` — connect / disconnect / kiválasztott customer_id.
- Egy új DB migráció: `database/2026-07-XX_google_ads_connection.sql` — `google_ads_connections` tábla (user_id, refresh_token titkosítva, login_customer_id, selected_customer_id), RLS owner-only + grants.

**Ami NEM készül**
- Új chat engine, új memória tábla, új agent runtime, új provider absztrakció, új UI keret — semmi.

---

## 2) Google Ads API

**Szükséges Google API-k**
- **Google Ads API v17** (REST + gRPC; a `google-ads-api` npm csomag REST-en megy → Workers-kompatibilis).
- **Google OAuth 2.0** (a Gmail integrációnál már használt endpoint).
- Fejlesztői előfeltétel: **Google Ads Developer Token** (Standard access ajánlott; test account is elég induláshoz).
- **Login Customer ID** (MCC, ha manager-fiók a belépési pont).

**OAuth folyamat**
1. `/api/google-ads/oauth/start` → 302 a Google authorize URL-re, `access_type=offline`, `prompt=consent`, PKCE state cookie.
2. Google callback → `/api/google-ads/oauth/callback` beváltja a code-ot refresh + access tokenre.
3. Refresh tokent titkosítva a `google_ads_connections` táblába mentjük (`user_id = auth.uid()`). Access token nem perzisztálódik.
4. Első connect után a felhasználó a Settings oldalon választ egy `customer_id`-t a `listAccessibleCustomers` eredményből.

**Scope-ok**
- `https://www.googleapis.com/auth/adwords` (Google Ads teljes API — nincs finomabb bontás).
- `openid email` — csak azonosításra.

**Hitelesítés request-időben**
- Minden Ads API hívás előtt: friss access token (in-memory cache, TTL 55 perc).
- HTTP fejlécek: `Authorization: Bearer <access>`, `developer-token: <env>`, `login-customer-id: <MCC opcionális>`.

**Token frissítés**
- `client.server.ts` a Google `/token` endpointon refresh tokennel új access tokent kér, ha a cache lejárt.
- Refresh hiba (invalid_grant) → connection státusz `revoked`, UI-n újracsatlakozást kérünk.

**Secretek (Lovable Cloud secretek, add_secret-tel bekérve)**
- `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET` (a Gmail-től eltérő OAuth kliens is lehet, de közös is — külön ajánlott).
- `GOOGLE_ADS_DEVELOPER_TOKEN`.
- `GOOGLE_ADS_LOGIN_CUSTOMER_ID` (opcionális, MCC esetén; user szinten is felülírható).
- `GOOGLE_ADS_TOKEN_ENC_KEY` (a refresh token AES-GCM titkosításához; `generate_secret`).

---

## 3) Tool architektúra

Michael tool-domain: **`ads.google`**. Egyetlen adapter fájl regisztrálja az összes toolt a meglévő `registerTool()` API-n; a runtime a `tool_domains: ["core.memory", "ads.google"]` alapján adja át.

Minden **write** tool `needs_approval: true` és `allowed_roles: ["owner"]`. Minden **read** tool `allowed_roles: ["owner"]` (v1).

```text
[ads.google] read
  ads_list_accounts            — listAccessibleCustomers
  ads_account_overview         — spend/CTR/CPA/Conv utolsó 7/30/90 nap
  ads_list_campaigns           — státusz, budget, bid strategy, KPI
  ads_campaign_performance     — kampány idősor + segment (device/network)
  ads_list_ad_groups           — ad_group szint KPI
  ads_list_keywords            — kulcsszó szint (impr/CTR/QS/CPC/conv)
  ads_search_terms             — search_term_view (negatív jelöltek)
  ads_list_ads                 — ad_group_ad + asset_group
  ads_budget_status            — budget vs. spend, IS lost budget
  ads_recommendations_list     — Google saját recommendation feed
  ads_audit_report             — összegző audit (bid strat, negatívok, konverzió, tracking)

[ads.google] write (mind needs_approval)
  ads_pause_campaign / ads_enable_campaign
  ads_update_campaign_budget
  ads_add_negative_keyword
  ads_pause_keyword / ads_pause_ad
  ads_apply_recommendation
  ads_create_experiment        — (későbbi sprint; váz most készül)

[core.memory]      (közös)
  memory_upsert / memory_search  — ads_account / ads_campaign subject_type-okkal
```

**Miért így**: az AI OS registry már domain-alapú, tehát Michael tool-készlete egyetlen új domain — a többi agent semmit nem lát belőle, mert a `tool_domains`-ük nem tartalmazza az `ads.google`-t.

---

## 4) Chat működés

- Belépés: **George-on át handoffal** vagy közvetlenül a Michael kártyáról az AI Asszisztensek gallery-ből (`/ai-assistant?agent=michael`).
- Ugyanaz a thread modell (`ai_threads` + `ai_messages`), thread `agent_id = "michael"`.
- System prompt szigorú: csak Google Ads / kampányoptimalizálás; minden más kérdést George-nak ad vissza.
- Példa promptok, amelyeket a system prompt-ban is felsorolunk mintaként:
  - "Michael, nézd át a Google Ads fiókomat." → `ads_list_accounts` → `ads_account_overview` → `ads_audit_report`.
  - "Michael, miért romlott ez a kampány?" → `ads_campaign_performance` (7 vs. előző 7 nap) → diagnózis.
  - "Michael, mit javasolsz?" → `ads_recommendations_list` + `ads_search_terms` → javaslatlista.
  - "Michael, készíts optimalizálási tervet." → strukturált terv (mit, miért, várható hatás, kockázat) + write toolok javaslatként (jóváhagyásra vár).
- Approval flow: a write tool `needs_approval: true` → a chat UI a meglévő tool-approval megjelenítést kapja (ugyanaz, mint a Sales write toolnál).

---

## 5) Sprintek bontása (roadmap)

**Sprint M0 — Előkészítés (jelen terv jóváhagyása)**
- Google Cloud projekt + OAuth kliens létrehozása.
- Developer token igénylése (Basic elég indulásra).
- Secretek berögzítése.

**Sprint M1 — Kapcsolat és jogosultság (backend csak)**
- Migráció: `google_ads_connections` tábla + RLS owner-only.
- `oauth.start` / `oauth.callback` route.
- Settings → Google Ads oldal (connect/disconnect, customer választó).
- `client.server.ts` token cache + refresh.
- `AGENT_REGISTRY` bővítés (Michael kártya, Owner-only láthatóság). Chat még nem funkcionális toolok nélkül — de connect már mérhető.

**Sprint M2 — Read toolok + Michael agent élesítése**
- `ads_list_accounts`, `ads_list_campaigns`, `ads_account_overview`, `ads_campaign_performance`, `ads_list_keywords`, `ads_search_terms`.
- `AGENTS.michael` bekerül. George handoff útvonal.
- Manuális smoke: "nézd át a fiókom" végigmegy read toolokon.

**Sprint M3 — Audit + javaslat (még csak olvasás)**
- `ads_recommendations_list`, `ads_audit_report`.
- Strukturált optimalizálási terv generálás (write nélkül).
- Memóriába íródik a fiók-szintű baseline (`subject_type = ads_account`).

**Sprint M4 — Write toolok jóváhagyással**
- `ads_pause_campaign/enable`, `ads_update_campaign_budget`, `ads_add_negative_keyword`, `ads_apply_recommendation`.
- Approval UI (a meglévő pattern-nel), audit-log a `agent_run_steps`-ben.

**Sprint M5 — Bővítés hook-pontok (később)**
- `ads_create_experiment`, automatikus napi audit cron (`/api/public/google-ads/cron-audit`), riasztás romló kampányoknál.

Minden sprint végén STOP + user jóváhagyás — a projekt vasszabálya szerint.

---

## 6) UI terv

**Nincs új felület.** A meglévő komponensek használódnak:
- `/ai-assistant` — Michael ugyanolyan chat, mint George/Timothy. `?agent=michael` query paraméter.
- `AI Asszisztensek` gallery (`/ai-assistants`) — új Michael kártya, portré, leírás. Owner-only a `useVisibleAgents` szűrés miatt.
- `AiSheet` (Lead Workspace embed) — nem kap Michael-t v1-ben (nincs sales use-case).
- **Új**: Settings → Google Ads oldal (`/settings/google-ads`) a connect/disconnect vezérlésére, a `settings.gmail.tsx` mintájára — csak Owner szerepkör látja (route permission).
- Nincs saját dashboard, nincs saját kampány-lista oldal — v1-ben minden a chatben történik. (Ez tudatos scope-vágás; a M5+ sprintekben lehet natív riport-oldal.)

**Jogosultság a UI-ban**
- `agent_role_access` táblába egy sor: `(role_id = owner, agent_id = "michael", can_view = true)`. Más szerepkör nem kap sort → nem látja a kártyát, nem éri el a route-ot (`AgentGate` védi).

---

## 7) Bővíthetőség (későbbi csatlakozók)

A tervezett struktúra pontosan az AI OS mintáját követi, így új adatforrások **új tool-domainként** csatlakoznak, Michael prompt-jának minimális bővítésével:

- **Google Analytics 4** → `analytics.ga4` domain, új adapter fájl, ugyanez az OAuth kliens (extra scope `analytics.readonly`).
- **Search Console** → `search.gsc` domain.
- **Landing page audit** → `web.audit` domain (fetch + PageSpeed API).
- **Google Tag Manager** → `tagmanager.gtm` domain (write toolok approval-lal).
- **CRM keresztkontextus** → Michael megkaphatja a `crm.leads` / `crm.companies` domaint, ha lead-hez akarunk kampány-ROI-t rendelni.
- **Üzleti KPI** → új `subject_type = campaign_kpi` az `ai_memory`-ban, semmi séma-változtatás.
- **Automatikus optimalizálás** → cron endpoint `/api/public/google-ads/cron-*` a Gmail cron mintájára, ugyanez a `runAgent` fut headless módban.

Ezekből most **semmi** nem készül el — de egyik sem igényel architektúra-változtatást, csak új adaptert.

---

## Vasszabályok betartva

- Nincs új AI architektúra, nincs duplikáció.
- Egy új agent + egy új tool-domain + egy új OAuth integráció + egy új settings oldal — semmi több.
- Owner-only jogosultság a meglévő `agent_role_access` + `AgentGate` rendszeren keresztül.
- Minden write jóváhagyáshoz kötött.
- Sprintek kicsik, egymástól függetlenül szállíthatók, mindegyik után STOP.

**Fejlesztés csak a terv jóváhagyása után indul. Az első kód-lépés Sprint M0 secretek + Sprint M1 migráció lesz.**
