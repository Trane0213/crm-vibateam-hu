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
  adsMutate,
  fromMicros,
  GOOGLE_ADS_API_VERSION,
  gaqlSearch,
  listAccessibleCustomers,
  loadConnection,
  periodRange,
  resolveCustomerId,
  safeNum,
  writeChangeLog,
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
        "Kampányonkénti teljesítmény a megadott időszakra: költés, CTR, avg CPC, konverzió, konverziós érték, cost/conv, search_impression_share, lost IS budget miatt, lost IS rank miatt. Snapshot íródik minden kampányhoz.",
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
        const query = `SELECT campaign.id, campaign.name, campaign.status, campaign.bidding_strategy_type, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value, metrics.ctr, metrics.average_cpc, metrics.average_cpm, metrics.cost_per_conversion, metrics.search_impression_share, metrics.search_budget_lost_impression_share, metrics.search_rank_lost_impression_share FROM campaign WHERE segments.date BETWEEN '${from}' AND '${to}'${statusWhere}`;
        const rows = await gaqlSearch(conn, cid, query);
        // Csoportosítás kampányonként (a Google visszaadhat napi bontásban is).
        const byCampaign = new Map<string, { name: string; status: string; bidding: string; rows: any[]; is_samples: { imp: number[]; lost_b: number[]; lost_r: number[] } }>();
        for (const r of rows as any[]) {
          const id = String(r.campaign?.id ?? "");
          if (!id) continue;
          if (!byCampaign.has(id)) byCampaign.set(id, { name: r.campaign?.name ?? "", status: r.campaign?.status ?? "", bidding: r.campaign?.biddingStrategyType ?? "", rows: [], is_samples: { imp: [], lost_b: [], lost_r: [] } });
          const entry = byCampaign.get(id)!;
          entry.rows.push(r);
          // Impression share metrikák napi átlagolása (Google 0..1 skálán adja).
          const imp = Number(r.metrics?.searchImpressionShare);
          const lb = Number(r.metrics?.searchBudgetLostImpressionShare);
          const lr = Number(r.metrics?.searchRankLostImpressionShare);
          if (Number.isFinite(imp)) entry.is_samples.imp.push(imp);
          if (Number.isFinite(lb)) entry.is_samples.lost_b.push(lb);
          if (Number.isFinite(lr)) entry.is_samples.lost_r.push(lr);
        }
        const items: any[] = [];
        for (const [id, entry] of byCampaign) {
          const agg = aggregateMetricRows(entry.rows);
          const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
          const impShare = avg(entry.is_samples.imp);
          const lostBudget = avg(entry.is_samples.lost_b);
          const lostRank = avg(entry.is_samples.lost_r);
          const clicks = Number(agg.clicks) || 0;
          const impressions = Number(agg.impressions) || 0;
          const spend = Number(agg.spend) || 0;
          const conversions = Number(agg.conversions) || 0;
          const derived = {
            ctr: impressions > 0 ? clicks / impressions : null,
            avg_cpc: clicks > 0 ? spend / clicks : null,
            cost_per_conversion: conversions > 0 ? spend / conversions : null,
            search_impression_share: impShare,
            lost_is_budget: lostBudget,
            lost_is_rank: lostRank,
          };
          const metrics = { ...agg, ...derived, period: { from, to, grain: "day" as const } };
          items.push({ campaign_id: id, name: entry.name, status: entry.status, bidding_strategy_type: entry.bidding, ...metrics });
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
      description: "Kulcsszavak listája (opcionálisan hirdetéscsoportra/kampányra szűkítve), teljesítménnyel + Quality Score + CTR + avg CPC + first_page/top_of_page CPC becslés.",
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
        const query = `SELECT ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status, ad_group_criterion.quality_info.quality_score, ad_group_criterion.quality_info.creative_quality_score, ad_group_criterion.quality_info.post_click_quality_score, ad_group_criterion.quality_info.search_predicted_ctr, ad_group_criterion.position_estimates.first_page_cpc_micros, ad_group_criterion.position_estimates.top_of_page_cpc_micros, ad_group.id, ad_group.name, campaign.id, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.ctr, metrics.average_cpc FROM keyword_view WHERE ${conds.join(" AND ")} ORDER BY metrics.cost_micros DESC LIMIT ${limit}`;
        const rows = await gaqlSearch(conn, cid, query);
        const items = (rows as any[]).map((r) => ({
          criterion_id: r.adGroupCriterion?.criterionId,
          text: r.adGroupCriterion?.keyword?.text,
          match_type: r.adGroupCriterion?.keyword?.matchType,
          status: r.adGroupCriterion?.status,
          quality_score: r.adGroupCriterion?.qualityInfo?.qualityScore ?? null,
          creative_quality_score: r.adGroupCriterion?.qualityInfo?.creativeQualityScore ?? null,
          post_click_quality_score: r.adGroupCriterion?.qualityInfo?.postClickQualityScore ?? null,
          predicted_ctr: r.adGroupCriterion?.qualityInfo?.searchPredictedCtr ?? null,
          first_page_cpc: fromMicros(r.adGroupCriterion?.positionEstimates?.firstPageCpcMicros),
          top_of_page_cpc: fromMicros(r.adGroupCriterion?.positionEstimates?.topOfPageCpcMicros),
          ad_group_id: r.adGroup?.id,
          ad_group_name: r.adGroup?.name,
          campaign_id: r.campaign?.id,
          campaign_name: r.campaign?.name,
          impressions: safeNum(r.metrics?.impressions),
          clicks: safeNum(r.metrics?.clicks),
          spend: fromMicros(r.metrics?.costMicros),
          conversions: safeNum(r.metrics?.conversions),
          ctr: r.metrics?.ctr ?? null,
          avg_cpc: fromMicros(r.metrics?.averageCpc),
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
  // ------------------------------------------------------------------
  // get_campaign_landing_urls — kampányonként az összes final_url + ad_group
  // Michael így közvetlenül a Google Ads-ből kapja a landing oldalakat.
  // Nem függ a Knowledge Graph-tól, nem kell UUID lookup.
  // ------------------------------------------------------------------
  registerTool(
    {
      name: "get_campaign_landing_urls",
      description:
        "Kampányonként az összes hirdetés `final_urls` (landing URL) listája, ad_group szerint csoportosítva. Ha egy adott kampány érdekel, add meg a `campaign_id`-t (Google Ads numerikus ID — NEM UUID). Ez a helyes tool a kampány ↔ landing kapcsolat felderítéséhez; NE kg_find_related-et használj Google Ads campaign ID-val.",
      domain: DOMAIN,
      allowed_agents: MICHAEL_ONLY,
      parameters: {
        type: "object",
        properties: {
          customer_id: { type: "string" },
          campaign_id: { type: "string", description: "Google Ads campaign.id (numerikus)." },
          only_active: { type: "boolean", default: true, description: "Csak ENABLED hirdetések." },
          limit: { type: "integer", default: 500, minimum: 1, maximum: 2000 },
        },
      },
    },
    async (args, ctx) => {
      try {
        const conn = await loadConnection(ctx.supabaseUser);
        const cid = resolveCustomerId(conn, args.customer_id as string | undefined);
        const conds: string[] = [];
        if (args.campaign_id) conds.push(`campaign.id = ${Number(args.campaign_id)}`);
        if (args.only_active !== false) conds.push(`ad_group_ad.status = 'ENABLED'`);
        const where = conds.length ? ` WHERE ${conds.join(" AND ")}` : "";
        const limit = Math.min(2000, Number(args.limit ?? 500));
        const query = `SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, ad_group_ad.ad.final_urls FROM ad_group_ad${where} LIMIT ${limit}`;
        const rows = await gaqlSearch(conn, cid, query);
        type Camp = { campaign_id: string; campaign_name: string; landing_urls: Set<string>; ad_groups: Map<string, { name: string; urls: Set<string> }> };
        const byCamp = new Map<string, Camp>();
        for (const r of rows as any[]) {
          const campId = String(r.campaign?.id ?? "");
          if (!campId) continue;
          const camp = byCamp.get(campId) ?? {
            campaign_id: campId,
            campaign_name: r.campaign?.name ?? "",
            landing_urls: new Set<string>(),
            ad_groups: new Map(),
          };
          const agId = String(r.adGroup?.id ?? "");
          const ag = camp.ad_groups.get(agId) ?? { name: r.adGroup?.name ?? "", urls: new Set<string>() };
          const urls: string[] = r.adGroupAd?.ad?.finalUrls ?? [];
          for (const u of urls) {
            if (!u) continue;
            camp.landing_urls.add(u);
            ag.urls.add(u);
          }
          camp.ad_groups.set(agId, ag);
          byCamp.set(campId, camp);
        }
        const items = Array.from(byCamp.values()).map((c) => ({
          campaign_id: c.campaign_id,
          campaign_name: c.campaign_name,
          landing_urls: Array.from(c.landing_urls),
          ad_groups: Array.from(c.ad_groups.entries()).map(([id, ag]) => ({
            ad_group_id: id,
            ad_group_name: ag.name,
            landing_urls: Array.from(ag.urls),
          })),
        }));
        return ok({ customer_id: cid, count: items.length, items });
      } catch (e) { return fail(e); }
    },
  );

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

  // ------------------------------------------------------------------
  // get_baseline_comparison — SZÁMÍTOTT nézet a google_ads_snapshots fölött.
  // Rolling median (robusztus outlier ellen) a `window_days` időszakra,
  // vs. a `compare_last_days` legutóbbi mintáinak mediánja.
  // ------------------------------------------------------------------
  registerTool(
    {
      name: "get_baseline_comparison",
      description:
        "Baseline vs. current összehasonlítás egy entitásra a google_ads_snapshots táblából számítva. Rolling median a baseline időszakra, delta % a legutóbbi időszakhoz képest. Ha kevés a snapshot, stale=true.",
      domain: DOMAIN,
      allowed_agents: MICHAEL_ONLY,
      parameters: {
        type: "object",
        properties: {
          scope: {
            type: "string",
            enum: ["account", "campaign", "ad_group", "keyword"],
            default: "account",
            description: "Entitás típus a snapshotokban.",
          },
          entity_id: {
            type: "string",
            description: "Entitás ID (kampány/ad_group/keyword ID). Account scope-nál a customer_id vagy üres.",
          },
          customer_id: { type: "string", description: "Opcionális; ha üres, a kapcsolat aktív fiókja." },
          window_days: { type: "integer", default: 30, minimum: 3, maximum: 180, description: "Baseline időablak (nap)." },
          compare_last_days: { type: "integer", default: 7, minimum: 1, maximum: 30, description: "Az utolsó ennyi nap a 'current'." },
        },
      },
    },
    async (args, ctx) => {
      try {
        const conn = await loadConnection(ctx.supabaseUser);
        const cid = resolveCustomerId(conn, args.customer_id as string | undefined);
        const scope = (args.scope as string) ?? "account";
        const entityId = (args.entity_id as string | undefined) ?? (scope === "account" ? cid : null);
        const windowDays = Math.min(180, Math.max(3, Number(args.window_days ?? 30)));
        const compareDays = Math.min(30, Math.max(1, Number(args.compare_last_days ?? 7)));

        const since = new Date();
        since.setUTCDate(since.getUTCDate() - windowDays);
        const sinceIso = since.toISOString();
        const currentCutoff = new Date();
        currentCutoff.setUTCDate(currentCutoff.getUTCDate() - compareDays);
        const currentCutoffIso = currentCutoff.toISOString();

        let q = ctx.supabaseUser
          .from("google_ads_snapshots")
          .select("snapshotted_at, metrics_json")
          .eq("customer_id", cid)
          .eq("scope", scope)
          .gte("snapshotted_at", sinceIso)
          .order("snapshotted_at", { ascending: true });
        if (entityId) q = q.eq("entity_id", entityId);
        const { data, error } = await q;
        if (error) throw new Error(`snapshots read failed: ${error.message}`);

        const rows = (data ?? []) as Array<{ snapshotted_at: string; metrics_json: Record<string, any> }>;
        const METRICS = ["spend", "impressions", "clicks", "ctr", "avg_cpc", "conversions", "conv_value", "cpa", "roas"] as const;
        const median = (nums: number[]): number | null => {
          const arr = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
          if (!arr.length) return null;
          const mid = Math.floor(arr.length / 2);
          return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
        };
        const baselineRows = rows.filter((r) => r.snapshotted_at < currentCutoffIso);
        const currentRows = rows.filter((r) => r.snapshotted_at >= currentCutoffIso);
        const MIN_BASELINE = 3;
        const stale = baselineRows.length < MIN_BASELINE || currentRows.length === 0;

        const metrics: Record<string, { baseline: number | null; current: number | null; delta_abs: number | null; delta_pct: number | null }> = {};
        for (const key of METRICS) {
          const b = median(baselineRows.map((r) => Number(r.metrics_json?.[key])));
          const c = median(currentRows.map((r) => Number(r.metrics_json?.[key])));
          const deltaAbs = b !== null && c !== null ? c - b : null;
          const deltaPct = b !== null && c !== null && b !== 0 ? (c - b) / Math.abs(b) : null;
          metrics[key] = { baseline: b, current: c, delta_abs: deltaAbs, delta_pct: deltaPct };
        }

        return ok({
          customer_id: cid,
          scope,
          entity_id: entityId,
          window_days: windowDays,
          compare_last_days: compareDays,
          baseline_sample_size: baselineRows.length,
          current_sample_size: currentRows.length,
          stale,
          stale_reason: stale
            ? baselineRows.length < MIN_BASELINE
              ? `Kevés baseline snapshot (${baselineRows.length} < ${MIN_BASELINE}). Hívj több get_account_snapshot / get_campaign_performance toolt, vagy várd meg a napi cron-t (M7).`
              : "Nincs current időszak snapshot."
            : null,
          metrics,
        });
      } catch (e) { return fail(e); }
    },
  );

  // ------------------------------------------------------------------
  // get_change_history — google_ads_change_log olvasás
  // ------------------------------------------------------------------
  registerTool(
    {
      name: "get_change_history",
      description:
        "Változás-napló olvasása (google_ads_change_log). Michael-execute-ok + jövőbeli kézi Google módosítások. Ok-okozat kötéshez: 'X napján Y változott → Z hatás'.",
      domain: DOMAIN,
      allowed_agents: MICHAEL_ONLY,
      parameters: {
        type: "object",
        properties: {
          customer_id: { type: "string" },
          entity: { type: "string", description: "Opcionális szűrő: 'campaign', 'ad_group', 'keyword', 'ad', 'budget', 'conversion_action', stb." },
          entity_id: { type: "string", description: "Opcionális szűrő egy konkrét entitás ID-jára." },
          days_back: { type: "integer", default: 30, minimum: 1, maximum: 365 },
          limit: { type: "integer", default: 100, minimum: 1, maximum: 500 },
        },
      },
    },
    async (args, ctx) => {
      try {
        const conn = await loadConnection(ctx.supabaseUser);
        const cid = resolveCustomerId(conn, args.customer_id as string | undefined);
        const days = Math.min(365, Math.max(1, Number(args.days_back ?? 30)));
        const limit = Math.min(500, Math.max(1, Number(args.limit ?? 100)));
        const since = new Date();
        since.setUTCDate(since.getUTCDate() - days);
        let q = ctx.supabaseUser
          .from("google_ads_change_log")
          .select("changed_at, entity, entity_id, field, old_value, new_value, changed_by, reason, dry_run_ref")
          .eq("customer_id", cid)
          .gte("changed_at", since.toISOString())
          .order("changed_at", { ascending: false })
          .limit(limit);
        if (args.entity) q = q.eq("entity", String(args.entity));
        if (args.entity_id) q = q.eq("entity_id", String(args.entity_id));
        const { data, error } = await q;
        if (error) throw new Error(`change_log read failed: ${error.message}`);
        const items = (data ?? []) as any[];
        return ok({
          customer_id: cid,
          days_back: days,
          count: items.length,
          items,
          note: items.length === 0
            ? "Nincs változás a naplóban. Michael execute-jai csak M6-tól íródnak ide; kézi Google módosítások szinkronja M7+."
            : null,
        });
      } catch (e) { return fail(e); }
    },
  );

  // ------------------------------------------------------------------
  // pause_campaign — M6-tól ÉLES WRITE tool (CONFIRM approval).
  // Dry run: csak tervet ad vissza. Execute: Google Ads mutate + change_log.
  // ------------------------------------------------------------------
  registerTool(
    {
      name: "pause_campaign",
      description:
        "Kampány szüneteltetése (ENABLED → PAUSED). Dry run: tervet ad vissza. Execute: valós Google Ads mutation + change_log bejegyzés (CONFIRM approval).",
      domain: DOMAIN,
      allowed_agents: MICHAEL_ONLY,
      approval: "confirm",
      supports_dry_run: true,
      parameters: {
        type: "object",
        required: ["campaign_id"],
        properties: {
          customer_id: { type: "string", description: "Opcionális; alapból a kapcsolat aktív Customer ID-ja." },
          campaign_id: { type: "string", description: "A szüneteltetendő kampány id-ja." },
          reason: { type: "string", description: "Rövid üzleti indok (bekerül a change_log-ba)." },
          mode: { type: "string", enum: ["dry_run", "execute"], default: "dry_run" },
        },
      },
    },
    async (args, ctx) => {
      try {
        const mode = (args.mode as string) === "execute" ? "execute" : "dry_run";
        const conn = await loadConnection(ctx.supabaseUser);
        const cid = resolveCustomerId(conn, args.customer_id as string | undefined);
        const campaignId = String(args.campaign_id ?? "").trim();
        if (!campaignId) return fail("campaign_id kötelező.");
        const rows = await gaqlSearch(
          conn, cid,
          `SELECT campaign.id, campaign.name, campaign.status FROM campaign WHERE campaign.id = ${campaignId}`,
          { pageSize: 1 },
        );
        const c: any = rows[0]?.campaign;
        if (!c?.id) return fail(`Kampány nem található: ${campaignId} (customer ${cid}).`);
        const resourceName = `customers/${cid}/campaigns/${campaignId}`;
        const plan = {
          method: "POST",
          endpoint: `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${cid}/campaigns:mutate`,
          operation: "update",
          update_mask: "status",
          resource_name: resourceName,
          field: "status",
          before: c.status,
          after: "PAUSED",
          reason: (args.reason as string) ?? null,
        };
        if (c.status === "PAUSED") {
          return ok({
            dry_run: mode === "dry_run",
            no_op: true,
            campaign: { id: c.id, name: c.name, status: c.status },
            message: "A kampány már PAUSED — nincs teendő.",
          });
        }
        if (mode === "dry_run") {
          return ok({
            dry_run: true,
            campaign: { id: c.id, name: c.name, status: c.status },
            plan,
            note: "Ez egy előnézet. Semmilyen módosítás nem történt.",
          });
        }
        // M6 EXECUTE
        const resp = await adsMutate(conn, cid, "campaigns:mutate", {
          operations: [{ update: { resourceName, status: "PAUSED" }, updateMask: "status" }],
        });
        await writeChangeLog(ctx.supabaseUser, {
          user_id: ctx.userId, customer_id: cid,
          entity: "campaign", entity_id: String(campaignId),
          field: "status", old_value: c.status, new_value: "PAUSED",
          reason: (args.reason as string) ?? null,
        });
        return ok({
          dry_run: false, executed: true,
          campaign: { id: c.id, name: c.name, status: "PAUSED" },
          previous_status: c.status,
          response: resp,
        });
      } catch (e) { return fail(e); }
    },
  );

  // ------------------------------------------------------------------
  // enable_campaign — CONFIRM (visszakapcsol PAUSED → ENABLED)
  // ------------------------------------------------------------------
  registerTool(
    {
      name: "enable_campaign",
      description: "Kampány újraindítása (PAUSED → ENABLED). CONFIRM approval. Dry run támogatott.",
      domain: DOMAIN,
      allowed_agents: MICHAEL_ONLY,
      approval: "confirm",
      supports_dry_run: true,
      parameters: {
        type: "object",
        required: ["campaign_id"],
        properties: {
          customer_id: { type: "string" },
          campaign_id: { type: "string" },
          reason: { type: "string" },
          mode: { type: "string", enum: ["dry_run", "execute"], default: "dry_run" },
        },
      },
    },
    async (args, ctx) => {
      try {
        const mode = (args.mode as string) === "execute" ? "execute" : "dry_run";
        const conn = await loadConnection(ctx.supabaseUser);
        const cid = resolveCustomerId(conn, args.customer_id as string | undefined);
        const campaignId = String(args.campaign_id ?? "").trim();
        if (!campaignId) return fail("campaign_id kötelező.");
        const rows = await gaqlSearch(
          conn, cid,
          `SELECT campaign.id, campaign.name, campaign.status FROM campaign WHERE campaign.id = ${campaignId}`,
          { pageSize: 1 },
        );
        const c: any = rows[0]?.campaign;
        if (!c?.id) return fail(`Kampány nem található: ${campaignId}.`);
        if (c.status === "ENABLED") {
          return ok({ dry_run: mode === "dry_run", no_op: true, campaign: { id: c.id, name: c.name, status: c.status }, message: "Már ENABLED." });
        }
        const resourceName = `customers/${cid}/campaigns/${campaignId}`;
        const plan = { operation: "update", update_mask: "status", resource_name: resourceName, field: "status", before: c.status, after: "ENABLED", reason: (args.reason as string) ?? null };
        if (mode === "dry_run") return ok({ dry_run: true, campaign: { id: c.id, name: c.name, status: c.status }, plan });
        const resp = await adsMutate(conn, cid, "campaigns:mutate", {
          operations: [{ update: { resourceName, status: "ENABLED" }, updateMask: "status" }],
        });
        await writeChangeLog(ctx.supabaseUser, {
          user_id: ctx.userId, customer_id: cid, entity: "campaign", entity_id: String(campaignId),
          field: "status", old_value: c.status, new_value: "ENABLED", reason: (args.reason as string) ?? null,
        });
        return ok({ dry_run: false, executed: true, campaign: { id: c.id, name: c.name, status: "ENABLED" }, previous_status: c.status, response: resp });
      } catch (e) { return fail(e); }
    },
  );

  // ------------------------------------------------------------------
  // update_campaign_budget — CONFIRM
  // ------------------------------------------------------------------
  registerTool(
    {
      name: "update_campaign_budget",
      description: "Kampány napi keret módosítása (fiók pénzneme; pl. HUF). CONFIRM approval. Dry run támogatott.",
      domain: DOMAIN,
      allowed_agents: MICHAEL_ONLY,
      approval: "confirm",
      supports_dry_run: true,
      parameters: {
        type: "object",
        required: ["campaign_id", "new_daily_amount"],
        properties: {
          customer_id: { type: "string" },
          campaign_id: { type: "string" },
          new_daily_amount: { type: "number", description: "Új napi keret a fiók pénznemében (nem micros — pl. 5000 = 5000 HUF/nap)." },
          reason: { type: "string" },
          mode: { type: "string", enum: ["dry_run", "execute"], default: "dry_run" },
        },
      },
    },
    async (args, ctx) => {
      try {
        const mode = (args.mode as string) === "execute" ? "execute" : "dry_run";
        const conn = await loadConnection(ctx.supabaseUser);
        const cid = resolveCustomerId(conn, args.customer_id as string | undefined);
        const campaignId = String(args.campaign_id ?? "").trim();
        const newAmount = Number(args.new_daily_amount);
        if (!campaignId) return fail("campaign_id kötelező.");
        if (!Number.isFinite(newAmount) || newAmount <= 0) return fail("new_daily_amount pozitív szám kell legyen.");
        const rows = await gaqlSearch(
          conn, cid,
          `SELECT campaign.id, campaign.name, campaign_budget.id, campaign_budget.amount_micros FROM campaign WHERE campaign.id = ${campaignId}`,
          { pageSize: 1 },
        );
        const r: any = rows[0];
        const budgetId = r?.campaignBudget?.id;
        if (!budgetId) return fail(`Nem található budget a kampányhoz: ${campaignId}.`);
        const oldMicros = safeNum(r.campaignBudget.amountMicros);
        const oldAmount = oldMicros / 1_000_000;
        const newMicros = Math.round(newAmount * 1_000_000);
        const resourceName = `customers/${cid}/campaignBudgets/${budgetId}`;
        const plan = {
          operation: "update", update_mask: "amount_micros",
          resource_name: resourceName, field: "amount_micros",
          before: oldAmount, after: newAmount,
          delta_pct: oldAmount > 0 ? (newAmount - oldAmount) / oldAmount : null,
          reason: (args.reason as string) ?? null,
        };
        if (mode === "dry_run") return ok({ dry_run: true, campaign: { id: r.campaign.id, name: r.campaign.name }, budget_id: budgetId, plan });
        const resp = await adsMutate(conn, cid, "campaignBudgets:mutate", {
          operations: [{ update: { resourceName, amountMicros: String(newMicros) }, updateMask: "amount_micros" }],
        });
        await writeChangeLog(ctx.supabaseUser, {
          user_id: ctx.userId, customer_id: cid,
          entity: "campaign_budget", entity_id: String(budgetId),
          field: "amount_micros", old_value: String(oldMicros), new_value: String(newMicros),
          reason: (args.reason as string) ?? null,
        });
        return ok({ dry_run: false, executed: true, campaign_id: campaignId, budget_id: budgetId, before: oldAmount, after: newAmount, response: resp });
      } catch (e) { return fail(e); }
    },
  );

  // ------------------------------------------------------------------
  // add_campaign_negative_keyword — CONFIRM
  // ------------------------------------------------------------------
  registerTool(
    {
      name: "add_campaign_negative_keyword",
      description: "Negatív kulcsszó felvétele kampány szinten. CONFIRM approval. Dry run támogatott.",
      domain: DOMAIN,
      allowed_agents: MICHAEL_ONLY,
      approval: "confirm",
      supports_dry_run: true,
      parameters: {
        type: "object",
        required: ["campaign_id", "text"],
        properties: {
          customer_id: { type: "string" },
          campaign_id: { type: "string" },
          text: { type: "string", description: "A negatív kulcsszó szövege." },
          match_type: { type: "string", enum: ["EXACT", "PHRASE", "BROAD"], default: "PHRASE" },
          reason: { type: "string" },
          mode: { type: "string", enum: ["dry_run", "execute"], default: "dry_run" },
        },
      },
    },
    async (args, ctx) => {
      try {
        const mode = (args.mode as string) === "execute" ? "execute" : "dry_run";
        const conn = await loadConnection(ctx.supabaseUser);
        const cid = resolveCustomerId(conn, args.customer_id as string | undefined);
        const campaignId = String(args.campaign_id ?? "").trim();
        const text = String(args.text ?? "").trim();
        const matchType = (args.match_type as string) || "PHRASE";
        if (!campaignId || !text) return fail("campaign_id és text kötelező.");
        const plan = {
          operation: "create",
          endpoint: `campaignCriteria:mutate`,
          create: {
            campaign: `customers/${cid}/campaigns/${campaignId}`,
            negative: true,
            keyword: { text, matchType },
          },
          reason: (args.reason as string) ?? null,
        };
        if (mode === "dry_run") return ok({ dry_run: true, campaign_id: campaignId, plan });
        const resp = await adsMutate(conn, cid, "campaignCriteria:mutate", {
          operations: [{ create: {
            campaign: `customers/${cid}/campaigns/${campaignId}`,
            negative: true,
            keyword: { text, matchType },
          } }],
        });
        await writeChangeLog(ctx.supabaseUser, {
          user_id: ctx.userId, customer_id: cid,
          entity: "campaign_negative_keyword", entity_id: String(campaignId),
          field: "keyword", old_value: null, new_value: `${matchType}:${text}`,
          reason: (args.reason as string) ?? null,
        });
        return ok({ dry_run: false, executed: true, campaign_id: campaignId, keyword: { text, matchType }, response: resp });
      } catch (e) { return fail(e); }
    },
  );

  // ------------------------------------------------------------------
  // remove_campaign — DANGEROUS (irreverzibilis a Google oldalán: REMOVED)
  // ------------------------------------------------------------------
  registerTool(
    {
      name: "remove_campaign",
      description: "Kampány végleges eltávolítása (REMOVED). DANGEROUS — gépelt megerősítéssel. Dry run támogatott.",
      domain: DOMAIN,
      allowed_agents: MICHAEL_ONLY,
      approval: "dangerous",
      supports_dry_run: true,
      parameters: {
        type: "object",
        required: ["campaign_id", "reason"],
        properties: {
          customer_id: { type: "string" },
          campaign_id: { type: "string" },
          reason: { type: "string", description: "Kötelező üzleti indok (change_log-ba kerül)." },
          mode: { type: "string", enum: ["dry_run", "execute"], default: "dry_run" },
        },
      },
    },
    async (args, ctx) => {
      try {
        const mode = (args.mode as string) === "execute" ? "execute" : "dry_run";
        const conn = await loadConnection(ctx.supabaseUser);
        const cid = resolveCustomerId(conn, args.customer_id as string | undefined);
        const campaignId = String(args.campaign_id ?? "").trim();
        const reason = String(args.reason ?? "").trim();
        if (!campaignId) return fail("campaign_id kötelező.");
        if (!reason) return fail("reason kötelező (DANGEROUS művelet).");
        const rows = await gaqlSearch(
          conn, cid,
          `SELECT campaign.id, campaign.name, campaign.status FROM campaign WHERE campaign.id = ${campaignId}`,
          { pageSize: 1 },
        );
        const c: any = rows[0]?.campaign;
        if (!c?.id) return fail(`Kampány nem található: ${campaignId}.`);
        const resourceName = `customers/${cid}/campaigns/${campaignId}`;
        const plan = { operation: "remove", resource_name: resourceName, before: c.status, after: "REMOVED", reason };
        if (mode === "dry_run") return ok({ dry_run: true, campaign: { id: c.id, name: c.name, status: c.status }, plan, warning: "IRREVERZIBILIS művelet a Google Ads oldalán." });
        const resp = await adsMutate(conn, cid, "campaigns:mutate", {
          operations: [{ remove: resourceName }],
        });
        await writeChangeLog(ctx.supabaseUser, {
          user_id: ctx.userId, customer_id: cid,
          entity: "campaign", entity_id: String(campaignId),
          field: "status", old_value: c.status, new_value: "REMOVED", reason,
        });
        return ok({ dry_run: false, executed: true, campaign: { id: c.id, name: c.name, status: "REMOVED" }, previous_status: c.status, response: resp });
      } catch (e) { return fail(e); }
    },
  );
}