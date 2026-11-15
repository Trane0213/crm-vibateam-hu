import type { SupabaseClient } from "@supabase/supabase-js";
import { quoteNet } from "@/lib/sales/quote-net";

/**
 * A hónapban megnyert ügyek nettó értéke a hívó jogosultsága szerint (RLS).
 * Csak az aktuális ajánlatverzió tételeiből számol; ha egy megnyert ügynek nincs
 * látható aktuális ajánlata, `unknown`-ként jelöli (nem becsli).
 */
export async function wonNetThisMonth(client: SupabaseClient, since: string, userId: string | null) {
  // Lapozva olvas (nincs 1000 soros csonkolás).
  const ids: string[] = [];
  for (let from = 0; ; from += 1000) {
    let q = client.from("leads").select("id").eq("status", "won").gte("won_at", since).order("id").range(from, from + 999);
    if (userId) q = q.eq("assigned_to", userId);
    const { data, error } = await q;
    if (error) throw error;
    ids.push(...(data ?? []).map((l: { id: string }) => l.id));
    if ((data ?? []).length < 1000) break;
  }
  if (ids.length === 0) return { net: 0, count: 0, unknown: 0 };
  const quotes: { id: string; lead_id: string; discount_percent: number | null }[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const r = await client.from("quotes").select("id,lead_id,discount_percent").in("lead_id", ids.slice(i, i + 100)).eq("is_current", true);
    if (r.error) throw r.error;
    quotes.push(...((r.data ?? []) as typeof quotes));
  }
  const items = new Map<string, { quantity: number | null; unit_price: number | null }[]>();
  for (let i = 0; i < quotes.length; i += 100) {
    for (let from = 0; ; from += 1000) {
      const r = await client.from("quote_items").select("id,quote_id,quantity,unit_price").in("quote_id", quotes.slice(i, i + 100).map((q) => q.id)).order("id").range(from, from + 999);
      if (r.error) throw r.error;
      const rows = (r.data ?? []) as { quote_id: string; quantity: number | null; unit_price: number | null }[];
      for (const it of rows) { const arr = items.get(it.quote_id) ?? []; arr.push(it); items.set(it.quote_id, arr); }
      if (rows.length < 1000) break;
    }
  }
  const withQuote = new Set(quotes.map((q) => q.lead_id));
  const net = quotes.reduce((s, q) => s + quoteNet(items.get(q.id) ?? [], q.discount_percent), 0);
  return { net, count: ids.length, unknown: ids.filter((id) => !withQuote.has(id)).length };
}
