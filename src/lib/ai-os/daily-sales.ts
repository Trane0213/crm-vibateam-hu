import { dailyWork, salesFocusSections } from '@/lib/sales/daily-work';
import { canonical, safeAudit } from './approval';
export const DAILY_CACHE_PATTERN = 'system:daily-sales:%';
export type DailyData = ReturnType<typeof dailyWork>;
export function dailySalesFocus(d: DailyData) {
  const labels = ['Lejárt határidő', 'Ma esedékes', 'Új érdeklődő', 'Ajánlat utánkövetése', 'Hiányos ügy'];
  return salesFocusSections(d).flatMap((rows, i) => rows.map(lead => ({ lead, reason: labels[i] ?? 'Hiányos ügy' }))).slice(0, 5);
}
export function dailySalesCounts(d: DailyData) {
  return { overdue: d.buckets.overdue.length, today: d.buckets.today.length, tomorrow: d.buckets.tomorrow.length,
    later: d.buckets.later.length, missing: d.buckets.missing.length, newLeads: d.newLeads.length, waiting: d.waiting.length, incomplete: d.incomplete.length };
}
export function dailySalesSource(d: DailyData) {
  return { counts: dailySalesCounts(d), leads: [...d.leads].sort((a,b)=>a.id.localeCompare(b.id)),
    quotes: [...d.quotes].sort((a,b)=>a.id.localeCompare(b.id)), focus: dailySalesFocus(d).map(({lead,reason})=>({id:lead.id,reason})) };
}
export async function dailySalesFingerprint(d: DailyData) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(dailySalesSource(d))));
  return Array.from(new Uint8Array(hash), b=>b.toString(16).padStart(2,'0')).join('');
}
export function dailySalesPrompt(d: DailyData) {
  return JSON.stringify(safeAudit({counts:dailySalesCounts(d), focus:dailySalesFocus(d).map(({lead,reason})=>({
    id:lead.id, name:(lead.company_name ?? lead.summary ?? 'Ügy').slice(0,300), reason,
    due:lead.next_step_due_at, next_step_type:lead.next_step_type,
  })), scope:'own', limitations:'Nincs levelezés vagy dokumentumtartalom; várakozó státusz nem bizonyít megválaszolatlanságot.'}));
}