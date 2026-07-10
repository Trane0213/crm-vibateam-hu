/**
 * AI OS — Google Ads (`ads.google`) tool adapterek. SERVER-ONLY.
 *
 * M2: kizárólag SAFE READ toolok. Semmi mutation. Egyik tool sem hoz ítéletet
 * — a nyers adatot adják vissza, az elemzést Michael a system prompt szerint
 * saját maga állítja össze (majd M3-tól).
 *
 * A `get_account_snapshot` és `get_campaign_performance` az eredményt a
 * `google_ads_snapshots` táblába is beírja (schema_version=1), hogy M3-ban a
 * baseline nézet számítható legyen. A snapshot írás nem-kritikus, hiba esetén
 * a tool eredmény érvényes marad.
 */

import { registerTool } from "../tool-registry";
import {
  fromMicros,
  gaqlSearch,
  listAccessibleCustomers,
  loadConnection,
  periodRange,
  resolveCustomerId,
  safeNum,
  writeSnapshot,
} from "@/lib/google-ads/client.server";

function ok<T>(data: T) { return { ok: true, data }; }
function fail(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { ok: false, error: message };
}

const DOMAIN = "ads.google";
const MICHAEL_ONLY: string[] = ["michael"];

/** Aggregate `metrics.*` rows egyetlen összesített objektummá. */
function aggregateMetricRows(rows: Array<Record<string, any>>) {
  let impressions = 0, clicks = 0, costMicros = 0, conversions = 0, convValue = 0;
  for (const r of rows) {
    const m = r.metrics ?? {};
    impressions += safeNum(m.impressions);
    clicks += safeNum(m.clicks);
    costMicros += safeNum(m.costMicros);
    conversions += safeNum(m.conversions);
    convValue += safeNum(m.conversionsValue);
  }
  const spend = costMicros / 1_000_000;
  const ctr = impressions > 0 ? clicks / impressions : 0;
  const avg_cpc = clicks > 0 ? spend / clicks : 0;
  const cpa = conversions > 0 ? spend / conversions : 0;
  const roas = spend > 0 ? convValue / spend : 0;
  return { spend, impressions, clicks, ctr, avg_cpc, conversions, conv_value: convValue, cpa, roas };
}

export function registerGoogleAdsTools() {
  // ------------------------------------------------------------------
  // list_ads_accounts — a userhez tartozó összes elérhető Customer ID
  // ------------------------------------------------------------------
  registerTool(
    {
      name: "list_ads_accounts",
      description: "A csatlakoztatott Google fiókhoz tartozó összes elérhető Google Ads Customer ID felsorolása.",
      domain: DOMAIN,
      allowed_agents: MICHAEL_ONLY,
      parameters: { type: "object", properties: {} },
    },
    async (_args, ctx) => {
      try {
        const conn = await loadConnection(ctx.supabaseUser);
        const ids = await listAccessibleCustomers(conn);
        return ok({ active_customer_id: conn.active_customer_id, accounts: ids });
      } catch (e) { return fail(e); }
    },
  );

  // ------------------------------------------------------------------
  // get_account_snapshot — spend/CTR/CPA/ROAS a fiók egészére
  // ------------------------------------------------------------------
  registerTool(
    {
      name: "get_account_snapshot",
      description:
        "Fiók-szintű teljesítmény pillanatkép a megadott időszakra: költés, kattintás, megjelenés, CTR, átl. CPC, konverzió, CPA, ROAS. Az eredmény a snapshot táblába is beíródik.",
      domain: DOMAIN,
      allowed_agents: MICHAEL_ONLY,
      parameters: {
        type: "object",
        properties: {
          customer_id: { type: "string", description: "Opcionális; ha üres, a kapcsolat aktív Customer ID-ja." },
          days_back: { type: "integer", default: 30, minimum: 1, maximum: 365, description: "Hány napra visszamenőleg." },
        },
      },
    },
    async (args, ctx) => {
      try {
        const conn = await loadConnection(ctx.supabaseUser);
        const cid = resolveCustomerId(conn, args.customer_id as string | undefined);
        const days = Math.min(365, Math.max(1, Number(args.days_back ?? 30)));
        const { from, to } = periodRange(days);
        const query = `SELECT customer.id, customer.currency_code, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM customer WHERE segments.date BETWEEN '${from}' AND '${to}'`;
        const rows = await gaqlSearch(conn, cid, query, { pageSize: 100 });
        const agg = aggregateMetricRows(rows);
        const currency = (rows[0] as any)?.customer?.currencyCode ?? null;
        const metrics = { ...agg, currency, period: { from, to, grain: "day" as const } };
        await writeSnapshot(ctx.supabaseUser, {
          user_id: ctx.userId, customer_id: cid, scope: "account", entity_id: cid, metrics,
        });
        return ok({ customer_id: cid, ...metrics });
      } catch (e) { return fail(e); }
    },
  );

  // ------------------------------------------------------------------
  // list_campaigns
  // ------------------------------------------------------------------
  registerTool(
    {
      name: "list_campaigns",
      description: "Kampányok listája: név, típus, státusz, napi keret, offer/serving státusz.",
      domain: DOMAIN,
      allowed_agents: MICHAEL_ONLY,
      parameters: {
        type: "object",
        properties: {
          customer_id: { type: "string" },
          only_active: { type: "boolean", default: false, description: "Ha true, csak ENABLED kampányok." },
          limit: { type: "integer", default: 100, minimum: 1, maximum: 500 },
        },
      },
    },
    async (args, ctx) => {
      try {
        const conn = await loadConnection(ctx.supabaseUser);
        const cid = resolveCustomerId(conn, args.customer_id as string | undefined);
        const where = args.only_active ? " WHERE campaign.status = 'ENABLED'" : "";
        const limit = Math.min(500, Number(args.limit ?? 100));
        const query = `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.bidding_strategy_type, campaign.start_date, campaign.end_date, campaign_budget.amount_micros, campaign_budget.period FROM campaign${where} ORDER BY campaign.name LIMIT ${limit}`;
        const rows = await gaqlSearch(conn, cid, query);
        const items = rows.map((r: any) => ({
          id: r.campaign?.id,
          name: r.campaign?.name,
          status: r.campaign?.status,
          channel_type: r.campaign?.advertisingChannelType,
          bidding_strategy_type: r.campaign?.biddingStrategyType,
          start_date: r.campaign?.startDate,
          end_date: r.campaign?.endDate,
          budget_daily: fromMicros(r.campaignBudget?.amountMicros),
          budget_period: r.campaignBudget?.period,
        }));
        return ok({ customer_id: cid, count: items.length, items });
      } catch (e) { return fail(e); }
    },
  );

  // ------------------------------------------------------------------
  // get_campaign_performance — metrikák kampányonként + snapshot per kampány
  // ------------------------------------------------------------------
  registerTool(
    {
      name: "get_campaign_performance",
      description:
        "Kampányonkénti teljesítmény a megadott időszakra: költés, CTR, CPA, ROAS, konverzió. Snapshot íródik minden kampányhoz.",
      domain: DOMAIN,
      allowed_agents: MICHAEL_ONLY,
      parameters: {
        type: "object",
        properties: {
          customer_id: { type: "string" },
          days_back: { type: "integer", default: 30, minimum: 1, maximum: 365 },
          only_active: { type: "boolean", default: true },
        },
      },
    },
    async (args, ctx) => {
      try {
        const conn = await loadConnection(ctx.supabaseUser);
        const cid = resolveCustomerId(conn, args.customer_id as string | undefined);
        const days = Math.min(365, Math.max(1, Number(args.days_back ?? 30)));
        const { from, to } = periodRange(days);
        const statusWhere = args.only_active === false ? "" : " AND campaign.status = 'ENABLED'";
        const query = `SELECT campaign.id, campaign.name, campaign.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date BETWEEN '${from}' AND '${to}'${statusWhere}`;
        const rows = await gaqlSearch(conn, cid, query);
        // Csoportosítás kampányonként (a Google visszaadhat napi bontásban is).
        const byCampaign = new Map<string, { name: string; status: string; rows: any[] }>();
        for (const r of rows as any[]) {
          const id = String(r.campaign?.id ?? "");
          if (!id) continue;
          if (!byCampaign.has(id)) byCampaign.set(id, { name: r.campaign?.name ?? "", status: r.campaign?.status ?? "", rows: [] });
          byCampaign.get(id)!.rows.push(r);
        }
        const items: any[] = [];
        for (const [id, entry] of byCampaign) {
          const agg = aggregateMetricRows(entry.rows);
          const metrics = { ...agg, period: { from, to, grain: "day" as const } };
          items.push({ campaign_id: id, name: entry.name, status: entry.status, ...metrics });
          await writeSnapshot(ctx.supabaseUser, {
            user_id: ctx.userId, customer_id: cid, scope: "campaign", entity_id: id, metrics,
          });
        }
        items.sort((a, b) => b.spend - a.spend);
        return ok({ customer_id: cid, period: { from, to }, count: items.length, items });
      } catch (e) { return fail(e); }
    },
  );

  // ------------------------------------------------------------------
  // list_ad_groups
  // ------------------------------------------------------------------
  registerTool(
    {
      name: "list_ad_groups",
      description: "Hirdetéscsoportok listája (opcionálisan egy adott kampányra szűkítve).",
      domain: DOMAIN,
      allowed_agents: MICHAEL_ONLY,
      parameters: {
        type: "object",
        properties: {
          customer_id: { type: "string" },
          campaign_id: { type: "string" },
          only_active: { type: "boolean", default: false },
          limit: { type: "integer", default: 200, minimum: 1, maximum: 1000 },
        },
      },
    },
    async (args, ctx) => {
      try {
        const conn = await loadConnection(ctx.supabaseUser);
        const cid = resolveCustomerId(conn, args.customer_id as string | undefined);
        const conds: string[] = [];
        if (args.campaign_id) conds.push(`campaign.id = ${Number(args.campaign_id)}`);
        if (args.only_active) conds.push(`ad_group.status = 'ENABLED'`);
        const where = conds.length ? ` WHERE ${conds.join(" AND ")}` : "";
        const limit = Math.min(1000, Number(args.limit ?? 200));
        const query = `SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.type, campaign.id, campaign.name FROM ad_group${where} ORDER BY ad_group.name LIMIT ${limit}`;
        const rows = await gaqlSearch(conn, cid, query);
        const items = (rows as any[]).map((r) => ({
          id: r.adGroup?.id,
          name: r.adGroup?.name,
          status: r.adGroup?.status,
          type: r.adGroup?.type,
          campaign_id: r.campaign?.id,
          campaign_name: r.campaign?.name,
        }));
        return ok({ customer_id: cid, count: items.length, items });
      } catch (e) { return fail(e); }
    },
  );

  // ------------------------------------------------------------------
  // list_keywords
  // ------------------------------------------------------------------
  registerTool(
    {
      name: "list_keywords",
      description: "Kulcsszavak listája (opcionálisan hirdetéscsoportra/kampányra szűkítve), teljesítménnyel.",
      domain: DOMAIN,
      allowed_agents: MICHAEL_ONLY,
      parameters: {
        type: "object",
        properties: {
          customer_id: { type: "string" },
          campaign_id: { type: "string" },
          ad_group_id: { type: "string" },
          days_back: { type: "integer", default: 30, minimum: 1, maximum: 365 },
          only_active: { type: "boolean", default: true },
          limit: { type: "integer", default: 200, minimum: 1, maximum: 1000 },
        },
      },
    },
    async (args, ctx) => {
      try {
        const conn = await loadConnection(ctx.supabaseUser);
        const cid = resolveCustomerId(conn, args.customer_id as string | undefined);
        const days = Math.min(365, Math.max(1, Number(args.days_back ?? 30)));
        const { from, to } = periodRange(days);
        const conds: string[] = [`segments.date BETWEEN '${from}' AND '${to}'`];
        if (args.campaign_id) conds.push(`campaign.id = ${Number(args.campaign_id)}`);
        if (args.ad_group_id) conds.push(`ad_group.id = ${Number(args.ad_group_id)}`);
        if (args.only_active !== false) conds.push(`ad_group_criterion.status = 'ENABLED'`);
        const limit = Math.min(1000, Number(args.limit ?? 200));
        const query = `SELECT ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status, ad_group.id, ad_group.name, campaign.id, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM keyword_view WHERE ${conds.join(" AND ")} ORDER BY metrics.cost_micros DESC LIMIT ${limit}`;
        const rows = await gaqlSearch(conn, cid, query);
        const items = (rows as any[]).map((r) => ({
          criterion_id: r.adGroupCriterion?.criterionId,
          text: r.adGroupCriterion?.keyword?.text,
          match_type: r.adGroupCriterion?.keyword?.matchType,
          status: r.adGroupCriterion?.status,
          ad_group_id: r.adGroup?.id,
          ad_group_name: r.adGroup?.name,
          campaign_id: r.campaign?.id,
          campaign_name: r.campaign?.name,
          impressions: safeNum(r.metrics?.impressions),
          clicks: safeNum(r.metrics?.clicks),
          spend: fromMicros(r.metrics?.costMicros),
          conversions: safeNum(r.metrics?.conversions),
        }));
        return ok({ customer_id: cid, period: { from, to }, count: items.length, items });
      } catch (e) { return fail(e); }
    },
  );

  // ------------------------------------------------------------------
  // list_search_terms
  // ------------------------------------------------------------------
  registerTool(
    {
      name: "list_search_terms",
      description: "Keresési kifejezések (search terms) az időszakra, teljesítménnyel.",
      domain: DOMAIN,
      allowed_agents: MICHAEL_ONLY,
      parameters: {
        type: "object",
        properties: {
          customer_id: { type: "string" },
          campaign_id: { type: "string" },
          ad_group_id: { type: "string" },
          days_back: { type: "integer", default: 30, minimum: 1, maximum: 90 },
          limit: { type: "integer", default: 200, minimum: 1, maximum: 1000 },
        },
      },
    },
    async (args, ctx) => {
      try {
        const conn = await loadConnection(ctx.supabaseUser);
        const cid = resolveCustomerId(conn, args.customer_id as string | undefined);
        const days = Math.min(90, Math.max(1, Number(args.days_back ?? 30)));
        const { from, to } = periodRange(days);
        const conds: string[] = [`segments.date BETWEEN '${from}' AND '${to}'`];
        if (args.campaign_id) conds.push(`campaign.id = ${Number(args.campaign_id)}`);
        if (args.ad_group_id) conds.push(`ad_group.id = ${Number(args.ad_group_id)}`);
        const limit = Math.min(1000, Number(args.limit ?? 200));
        const query = `SELECT search_term_view.search_term, search_term_view.status, campaign.id, campaign.name, ad_group.id, ad_group.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM search_term_view WHERE ${conds.join(" AND ")} ORDER BY metrics.cost_micros DESC LIMIT ${limit}`;
        const rows = await gaqlSearch(conn, cid, query);
        const items = (rows as any[]).map((r) => ({
          search_term: r.searchTermView?.searchTerm,
          status: r.searchTermView?.status,
          campaign_id: r.campaign?.id,
          campaign_name: r.campaign?.name,
          ad_group_id: r.adGroup?.id,
          ad_group_name: r.adGroup?.name,
          impressions: safeNum(r.metrics?.impressions),
          clicks: safeNum(r.metrics?.clicks),
          spend: fromMicros(r.metrics?.costMicros),
          conversions: safeNum(r.metrics?.conversions),
        }));
        return ok({ customer_id: cid, period: { from, to }, count: items.length, items });
      } catch (e) { return fail(e); }
    },
  );

  // ------------------------------------------------------------------
  // list_ads
  // ------------------------------------------------------------------
  registerTool(
    {
      name: "list_ads",
      description: "Hirdetések (ad_group_ad) listája alap adatokkal és teljesítménnyel.",
      domain: DOMAIN,
      allowed_agents: MICHAEL_ONLY,
      parameters: {
        type: "object",
        properties: {
          customer_id: { type: "string" },
          campaign_id: { type: "string" },
          ad_group_id: { type: "string" },
          days_back: { type: "integer", default: 30, minimum: 1, maximum: 90 },
          limit: { type: "integer", default: 100, minimum: 1, maximum: 500 },
        },
      },
    },
    async (args, ctx) => {
      try {
        const conn = await loadConnection(ctx.supabaseUser);
        const cid = resolveCustomerId(conn, args.customer_id as string | undefined);
        const days = Math.min(90, Math.max(1, Number(args.days_back ?? 30)));
        const { from, to } = periodRange(days);
        const conds: string[] = [`segments.date BETWEEN '${from}' AND '${to}'`];
        if (args.campaign_id) conds.push(`campaign.id = ${Number(args.campaign_id)}`);
        if (args.ad_group_id) conds.push(`ad_group.id = ${Number(args.ad_group_id)}`);
        const limit = Math.min(500, Number(args.limit ?? 100));
        const query = `SELECT ad_group_ad.ad.id, ad_group_ad.ad.type, ad_group_ad.status, ad_group_ad.ad.final_urls, ad_group.id, ad_group.name, campaign.id, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM ad_group_ad WHERE ${conds.join(" AND ")} ORDER BY metrics.impressions DESC LIMIT ${limit}`;
        const rows = await gaqlSearch(conn, cid, query);
        const items = (rows as any[]).map((r) => ({
          ad_id: r.adGroupAd?.ad?.id,
          ad_type: r.adGroupAd?.ad?.type,
          status: r.adGroupAd?.status,
          final_urls: r.adGroupAd?.ad?.finalUrls ?? [],
          ad_group_id: r.adGroup?.id,
          ad_group_name: r.adGroup?.name,
          campaign_id: r.campaign?.id,
          campaign_name: r.campaign?.name,
          impressions: safeNum(r.metrics?.impressions),
          clicks: safeNum(r.metrics?.clicks),
          spend: fromMicros(r.metrics?.costMicros),
          conversions: safeNum(r.metrics?.conversions),
        }));
        return ok({ customer_id: cid, period: { from, to }, count: items.length, items });
      } catch (e) { return fail(e); }
    },
  );

  // ------------------------------------------------------------------
  // get_budget_status — kampányonkénti napi keret + tényleges költés arány
  // ------------------------------------------------------------------
  registerTool(
    {
      name: "get_budget_status",
      description:
        "Kampány büdzsé állapot: napi keret, elmúlt N nap átlagos napi költése, keret-kihasználás %.",
      domain: DOMAIN,
      allowed_agents: MICHAEL_ONLY,
      parameters: {
        type: "object",
        properties: {
          customer_id: { type: "string" },
          days_back: { type: "integer", default: 7, minimum: 1, maximum: 30 },
          only_active: { type: "boolean", default: true },
        },
      },
    },
    async (args, ctx) => {
      try {
        const conn = await loadConnection(ctx.supabaseUser);
        const cid = resolveCustomerId(conn, args.customer_id as string | undefined);
        const days = Math.min(30, Math.max(1, Number(args.days_back ?? 7)));
        const { from, to } = periodRange(days);
        const statusWhere = args.only_active === false ? "" : " AND campaign.status = 'ENABLED'";
        const query = `SELECT campaign.id, campaign.name, campaign.status, campaign_budget.amount_micros, campaign_budget.period, metrics.cost_micros FROM campaign WHERE segments.date BETWEEN '${from}' AND '${to}'${statusWhere}`;
        const rows = await gaqlSearch(conn, cid, query);
        const byC = new Map<string, { name: string; status: string; budgetMicros: number; period: string; costMicros: number }>();
        for (const r of rows as any[]) {
          const id = String(r.campaign?.id ?? "");
          if (!id) continue;
          const entry = byC.get(id) ?? {
            name: r.campaign?.name ?? "",
            status: r.campaign?.status ?? "",
            budgetMicros: safeNum(r.campaignBudget?.amountMicros),
            period: r.campaignBudget?.period ?? "DAILY",
            costMicros: 0,
          };
          entry.costMicros += safeNum(r.metrics?.costMicros);
          byC.set(id, entry);
        }
        const items = Array.from(byC.entries()).map(([id, v]) => {
          const daily_budget = v.budgetMicros / 1_000_000;
          const avg_daily_spend = v.costMicros / 1_000_000 / days;
          const utilization_pct = daily_budget > 0 ? (avg_daily_spend / daily_budget) * 100 : 0;
          return {
            campaign_id: id, name: v.name, status: v.status,
            daily_budget, budget_period: v.period,
            avg_daily_spend, utilization_pct,
          };
        }).sort((a, b) => b.utilization_pct - a.utilization_pct);
        return ok({ customer_id: cid, period: { from, to }, count: items.length, items });
      } catch (e) { return fail(e); }
    },
  );

  // ------------------------------------------------------------------
  // get_conversion_setup — konverziós akciók
  // ------------------------------------------------------------------
  registerTool(
    {
      name: "get_conversion_setup",
      description: "Konverziós akciók (conversion_action) listája: név, kategória, státusz, számláló, érték típus.",
      domain: DOMAIN,
      allowed_agents: MICHAEL_ONLY,
      parameters: {
        type: "object",
        properties: {
          customer_id: { type: "string" },
          only_active: { type: "boolean", default: false },
        },
      },
    },
    async (args, ctx) => {
      try {
        const conn = await loadConnection(ctx.supabaseUser);
        const cid = resolveCustomerId(conn, args.customer_id as string | undefined);
        const where = args.only_active ? " WHERE conversion_action.status = 'ENABLED'" : "";
        const query = `SELECT conversion_action.id, conversion_action.name, conversion_action.status, conversion_action.type, conversion_action.category, conversion_action.counting_type, conversion_action.include_in_conversions_metric, conversion_action.primary_for_goal FROM conversion_action${where} ORDER BY conversion_action.name`;
        const rows = await gaqlSearch(conn, cid, query);
        const items = (rows as any[]).map((r) => ({
          id: r.conversionAction?.id,
          name: r.conversionAction?.name,
          status: r.conversionAction?.status,
          type: r.conversionAction?.type,
          category: r.conversionAction?.category,
          counting_type: r.conversionAction?.countingType,
          included_in_conversions: r.conversionAction?.includeInConversionsMetric,
          primary_for_goal: r.conversionAction?.primaryForGoal,
        }));
        return ok({ customer_id: cid, count: items.length, items });
      } catch (e) { return fail(e); }
    },
  );

  // ------------------------------------------------------------------
  // get_google_recommendations — CSAK bemenet, Michael maga ítél
  // ------------------------------------------------------------------
  registerTool(
    {
      name: "get_google_recommendations",
      description:
        "Google által javasolt Recommendations (típus, hatás, kampány, dismissed). CSAK BEMENET Michael számára — nem végrehajtandó ajánlás.",
      domain: DOMAIN,
      allowed_agents: MICHAEL_ONLY,
      parameters: {
        type: "object",
        properties: {
          customer_id: { type: "string" },
          limit: { type: "integer", default: 100, minimum: 1, maximum: 500 },
        },
      },
    },
    async (args, ctx) => {
      try {
        const conn = await loadConnection(ctx.supabaseUser);
        const cid = resolveCustomerId(conn, args.customer_id as string | undefined);
        const limit = Math.min(500, Number(args.limit ?? 100));
        const query = `SELECT recommendation.resource_name, recommendation.type, recommendation.dismissed, recommendation.impact.base_metrics.impressions, recommendation.impact.base_metrics.clicks, recommendation.impact.base_metrics.cost_micros, recommendation.impact.base_metrics.conversions, recommendation.impact.potential_metrics.impressions, recommendation.impact.potential_metrics.clicks, recommendation.impact.potential_metrics.cost_micros, recommendation.impact.potential_metrics.conversions, recommendation.campaign FROM recommendation LIMIT ${limit}`;
        const rows = await gaqlSearch(conn, cid, query);
        const items = (rows as any[]).map((r) => {
          const base = r.recommendation?.impact?.baseMetrics ?? {};
          const pot = r.recommendation?.impact?.potentialMetrics ?? {};
          return {
            resource_name: r.recommendation?.resourceName,
            type: r.recommendation?.type,
            dismissed: r.recommendation?.dismissed,
            campaign: r.recommendation?.campaign,
            impact_base: {
              impressions: safeNum(base.impressions),
              clicks: safeNum(base.clicks),
              spend: fromMicros(base.costMicros),
              conversions: safeNum(base.conversions),
            },
            impact_potential: {
              impressions: safeNum(pot.impressions),
              clicks: safeNum(pot.clicks),
              spend: fromMicros(pot.costMicros),
              conversions: safeNum(pot.conversions),
            },
          };
        });
        return ok({ customer_id: cid, count: items.length, items });
      } catch (e) { return fail(e); }
    },
  );
}