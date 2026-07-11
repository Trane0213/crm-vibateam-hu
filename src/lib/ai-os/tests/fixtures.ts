/**
 * AI OS — Acceptance fixtures (AI-1.8).
 *
 * Egyetlen forrás minden agent elvárt konfigurációjához + üzleti
 * forgatókönyvekhez. Új agent vagy tool bevezetésekor itt kell frissíteni.
 *
 * A `business_scenarios` mock kontextusokat ír le. A runner csak strukturális
 * ellenőrzést végez (kell-e az adott tool az agentnek); a `user_prompt` /
 * `expected_behavior` egyelőre dokumentáció, jövőbeli LLM-alapú acceptance
 * tesztek inputja.
 */

import type { AgentAcceptance } from "./types";

export const FIXTURES: AgentAcceptance[] = [
  // ---------------------------------------------------------------------------
  // George — Orchestrator
  // ---------------------------------------------------------------------------
  {
    agent: "george",
    role_summary: "Orchestrator: koordináció, egyszerű CRM keresés, handoff.",
    required_domains: [
      "core.handoff",
      "core.memory",
      "crm.search",
      "crm.companies",
      "crm.contacts",
      "crm.projects",
      "crm.leads",
      "crm.emails",
      "kg",
      "website.knowledge",
    ],
    forbidden_domains: [
      // AI-1.4a: ajánlat-írás Timothy hatásköre.
      "crm.quotes",
      // Ads csak Michael.
      "ads.google",
      // Sales lezárás Timothy.
      "sales.workflow",
    ],
    required_tools: [
      "handoff_to",
      "memory_read",
      "memory_write",
      "crm_search",
      "crm_list_companies",
      "kg_get_node",
      "website_search_pages",
    ],
    forbidden_tools: [
      "crm_list_quotes",
      "sales_mark_won_with_project",
      "pause_campaign",
      "update_campaign_budget",
    ],
    required_prompt_phrases: [
      "Orchestrator",
      "handoff_to",
      "CRM ADAT-LEKÉRDEZÉS",
    ],
    expected_handoff_targets: ["scarlet", "timothy", "boss", "michael"],
    business_scenarios: [
      {
        id: "george.route.marketing",
        title: "Marketing kérdés továbbítása Scarletnek",
        user_prompt: "Melyik csatornából jött a legtöbb lead a múlt héten?",
        expected_tools: ["handoff_to"],
        expected_behavior:
          "George felismeri, hogy marketing kérdés, és handoff_to(agent='scarlet') hívást tesz.",
      },
      {
        id: "george.route.ads",
        title: "Google Ads kérdés továbbítása Michaelnek",
        user_prompt: "Melyik kampányunk hozza a legjobb ROAS-t?",
        expected_tools: ["handoff_to"],
        expected_behavior:
          "George handoff_to(agent='michael'). Nincs saját ads.google hozzáférése.",
      },
      {
        id: "george.direct.list",
        title: "Egyszerű céglistázás sajátmagában",
        user_prompt: "Listázd az utolsó 10 aktív céget.",
        expected_tools: ["crm_list_companies"],
        expected_behavior:
          "Ez egyszerű CRM lookup — George maga megoldja, nem ad át.",
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // Scarlet — Marketing
  // ---------------------------------------------------------------------------
  {
    agent: "scarlet",
    role_summary: "Marketing: lead-minősítés, csatornaelemzés, email aktivitás.",
    required_domains: [
      "core.memory",
      "crm.search",
      "crm.leads",
      "crm.emails",
      "kg",
      "website.knowledge",
    ],
    forbidden_domains: [
      "core.handoff",
      "crm.quotes",
      "sales.workflow",
      "ads.google",
      // AI-1.4a: üres domain, ne kerüljön vissza spontán refaktorral.
      "marketing.workflow",
    ],
    required_tools: [
      "memory_read",
      "crm_list_leads",
      "website_search_pages",
      "kg_get_node",
    ],
    forbidden_tools: [
      "handoff_to",
      "memory_write",
      "crm_list_quotes",
      "sales_mark_won_with_project",
      "pause_campaign",
    ],
    required_prompt_phrases: ["Marketing", "sales lezárásra"],
    business_scenarios: [
      {
        id: "scarlet.lead.qualify",
        title: "Lead minősítése website-tudás alapján",
        user_prompt:
          "A lead X érdeklődik az Y szolgáltatásunk iránt — mi releváns tartalmunk van?",
        expected_tools: ["website_search_pages", "crm_list_leads"],
        required_data_sources: ["website_knowledge", "crm"],
        expected_behavior:
          "Először website_search_pages a szolgáltatásra, majd releváns lead-listázás. Ha nincs indexelt oldal, ne találjon ki.",
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // Timothy — Sales
  // ---------------------------------------------------------------------------
  {
    agent: "timothy",
    role_summary: "Sales: pipeline, ajánlat, utókövetés, megnyerés.",
    required_domains: [
      "core.memory",
      "crm.search",
      "crm.leads",
      "crm.quotes",
      "crm.followups",
      "sales.workflow",
      "kg",
      "website.knowledge",
    ],
    forbidden_domains: ["core.handoff", "ads.google", "marketing.workflow"],
    required_tools: [
      "memory_read",
      "crm_list_leads",
      "crm_list_quotes",
      "crm_list_followups",
      "sales_mark_won_with_project",
      "website_search_pages",
    ],
    forbidden_tools: [
      "handoff_to",
      "memory_write",
      "pause_campaign",
      "update_campaign_budget",
    ],
    required_prompt_phrases: ["Sales", "sales_mark_won_with_project"],
    business_scenarios: [
      {
        id: "timothy.won",
        title: "Ajánlat megnyerésének regisztrálása",
        user_prompt: "A(z) ACME ajánlat megnyerve, hozz létre projektet.",
        expected_tools: ["sales_mark_won_with_project"],
        expected_behavior:
          "sales_mark_won_with_project tool, dry_run → user confirm → execute (approval-szint: confirm).",
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // Boss — Project Manager
  // ---------------------------------------------------------------------------
  {
    agent: "boss",
    role_summary: "Projektvezető: aktív projektek, határidők, briefing.",
    required_domains: [
      "core.memory",
      "crm.search",
      "crm.projects",
      "crm.tasks",
      "crm.followups",
      "crm.meetings",
      "kg",
      "website.knowledge",
    ],
    forbidden_domains: [
      "core.handoff",
      "crm.quotes",
      "sales.workflow",
      "ads.google",
      // AI-1.4a: üres domain, ne kerüljön vissza spontán refaktorral.
      "pm.workflow",
    ],
    required_tools: [
      "memory_read",
      "memory_write",
      "crm_list_projects",
      "crm_list_tasks",
      "crm_list_meetings",
    ],
    forbidden_tools: [
      "handoff_to",
      "crm_list_quotes",
      "sales_mark_won_with_project",
      "pause_campaign",
    ],
    required_prompt_phrases: ["Projektvezető", "határidők"],
    business_scenarios: [
      {
        id: "boss.brief.today",
        title: "Napi briefing aktív projektekről",
        user_prompt: "Mi a mai legfontosabb 3 projekt?",
        expected_tools: ["crm_list_projects", "crm_list_tasks"],
        expected_behavior:
          "Aktív projektek + hozzájuk tartozó nyitott feladatok, dátum-alapú rangsor.",
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // Michael — Google Ads
  // A fő üzleti cél. Bő business_scenarios lista, hogy a jövőbeli Ads
  // munka szerkezete már most rögzített legyen (mock adatokkal is).
  // ---------------------------------------------------------------------------
  {
    agent: "michael",
    role_summary: "Google Ads specialista: kampányelemzés, landing quality, költségoptimalizálás.",
    required_domains: ["ads.google", "kg", "website.knowledge", "core.memory"],
    forbidden_domains: [
      "core.handoff",
      "crm.quotes",
      "sales.workflow",
      "marketing.workflow",
      "pm.workflow",
    ],
    required_tools: [
      "memory_read",
      "memory_write",
      // Ads read
      "list_ads_accounts",
      "list_campaigns",
      "get_campaign_performance",
      "list_ad_groups",
      "list_keywords",
      "list_search_terms",
      "get_budget_status",
      "get_conversion_setup",
      "get_google_recommendations",
      "get_baseline_comparison",
      // Ads write (approval-gated)
      "pause_campaign",
      "enable_campaign",
      "update_campaign_budget",
      "add_campaign_negative_keyword",
      // Landing / knowledge
      "website_search_pages",
      "website_get_page",
      "kg_get_node",
      "kg_find_related",
    ],
    forbidden_tools: [
      "handoff_to",
      "sales_mark_won_with_project",
      "crm_list_quotes",
    ],
    required_prompt_phrases: [
      "Google Ads",
      "VIBA-TEAM",
      "WEBSITE KNOWLEDGE",
      "landing",
    ],
    business_scenarios: [
      {
        id: "michael.campaign.analysis",
        title: "Kampány teljesítmény elemzés (mock)",
        user_prompt:
          "Nézd meg a `Vibateam Brand Search` kampányt az elmúlt 30 napra.",
        expected_tools: [
          "list_campaigns",
          "get_campaign_performance",
          "get_baseline_comparison",
        ],
        required_data_sources: ["google_ads", "kg"],
        expected_behavior:
          "list_campaigns → azonosítja a kampányt, get_campaign_performance 30d, majd baseline összevetés. Ha csökkent a konverzió, ok-oksági keresés kg/website felé.",
      },
      {
        id: "michael.landing.quality",
        title: "Landing page ellenőrzés (WK-6 invariáns)",
        user_prompt:
          "A `Weboldal-készítés` kampány landingje illeszkedik-e az üzenetünkhöz?",
        expected_tools: [
          "list_campaigns",
          "website_search_pages",
          "website_get_page",
          "kg_get_node",
        ],
        required_data_sources: ["website_knowledge", "kg", "google_ads"],
        expected_behavior:
          "Kampány → landing URL → website_get_page → tartalom-illeszkedés összegzés. Ha nincs indexelt oldal: 'Nincs erről indexelt oldalunk a Vibateam Knowledge Basében.' — SOHA ne találja ki.",
        notes: "WK-6 invariáns. Landing tartalom nem az LLM tudásából jön.",
      },
      {
        id: "michael.cost.optimization",
        title: "Költségoptimalizálás — magas CPC, alacsony konverzió (mock)",
        user_prompt:
          "Van olyan kampány, ami sokat költ, de kevés konverziót hoz?",
        expected_tools: [
          "list_campaigns",
          "get_campaign_performance",
          "get_budget_status",
          "get_conversion_setup",
        ],
        required_data_sources: ["google_ads"],
        expected_behavior:
          "Konverzió-tracking épp működik-e (get_conversion_setup) → budget vs perf összevetés → javaslat pause/budget-csökkentésre (execute csak jóváhagyás után, dry_run alapból).",
      },
      {
        id: "michael.negative.keywords",
        title: "Negatív kulcsszó javaslat search termsből (mock)",
        user_prompt:
          "Milyen search termekre költünk feleslegesen? Adj negatív kulcsszó javaslatot.",
        expected_tools: [
          "list_search_terms",
          "add_campaign_negative_keyword",
        ],
        required_data_sources: ["google_ads"],
        expected_behavior:
          "list_search_terms → alacsony konverziós ráta / irreleváns találatok → add_campaign_negative_keyword DRY_RUN-ban javaslat, csak execute után él (approval: confirm).",
      },
      {
        id: "michael.recommendations.filter",
        title: "Google Ajánlások szűrése VIBA célok alapján",
        user_prompt: "Mit ajánl a Google, és mit fogadhatunk el?",
        expected_tools: ["get_google_recommendations"],
        required_data_sources: ["google_ads"],
        expected_behavior:
          "get_google_recommendations lista → minden ajánlás mellé indoklás a VIBA Ads Constitution alapján. Metrika-javítás önmagában nem elég indok.",
        notes:
          "Constitution HARD SZABÁLY: nem a CTR/CPC/CPA/ROAS a cél, hanem a VIBA üzleti cél támogatása.",
      },
      {
        id: "michael.change.audit",
        title: "Változás-történet audit egy kampányon",
        user_prompt: "Ki és mit változtatott a Brand kampányon az elmúlt hétben?",
        expected_tools: ["get_change_history"],
        required_data_sources: ["google_ads"],
        expected_behavior:
          "get_change_history → változások időrendben, konkrét user + mező szintjén.",
        notes:
          "AI-1.7: eredményt Michael memóriába írhatja (memory_write engedélyezett neki).",
      },
    ],
  },
];
