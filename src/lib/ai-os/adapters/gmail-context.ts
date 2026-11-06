import { parse } from "node-html-parser";

export type SyncContext = { active: boolean; authError: boolean; lastSync: string | null };
export function syncCompleteness(sync: SyncContext, now = new Date()) {
  const at = sync.lastSync ? Date.parse(sync.lastSync) : NaN;
  return { ...sync, stale_or_unknown: !Number.isFinite(at) || now.getTime() - at > 24 * 60 * 60 * 1000,
    complete_gmail_history: false, source: "cached_crm_messages", live_gmail_verified: false };
}

/** Conservative credential detection: withhold, never forward or log the matched text. */
export function safeMailText(raw: string | null, offset = 0, size = 6000) {
  if (!raw) return { text: null, status: "missing" as const, next_offset: null };
  if (raw.length > 1_000_000) return { text: null, status: "oversized" as const, next_offset: null };
  const root = parse(raw);
  for (const node of root.querySelectorAll("script,style,iframe,object,form,input,button,svg")) node.remove();
  const text = root.textContent;
  const credential = /(?:bearer\s+[a-z0-9._~-]+|-----BEGIN[^\n]*PRIVATE KEY-----|\b(?:sk-|sb_secret_|ghp_|AIza)[a-z0-9_-]{12,}|\b(?:password|jelsz[oó]|access[_ -]?token|refresh[_ -]?token|api[_ -]?key|client[_ -]?secret)\s*[:=]\s*\S+|\beyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+)/i;
  if (credential.test(text) || credential.test(raw)) return { text: null, status: "sensitive_withheld" as const, next_offset: null };
  const end = offset + size;
  return { text: text.slice(offset, end), status: end < text.length || offset > 0 ? "partial" as const : "cached" as const, next_offset: end < text.length ? end : null };
}

export function messageAssociation(row: Record<string, unknown>, companyId: string, leadId?: string) {
  if (row.company_id && row.company_id !== companyId) return false;
  if (leadId && row.lead_id && row.lead_id !== leadId) return false;
  return true;
}

export function mailDirection(row: Record<string, unknown>, mailbox: string, customerEmails: string[]) {
  const labels = Array.isArray(row.gmail_label_ids) ? row.gmail_label_ids.map(String) : [];
  const sender = String(row.from_email ?? "").trim().toLowerCase();
  if (labels.includes('DRAFT')) return "unknown_or_automated";
  if (labels.includes("SENT")) return "sent";
  if (!labels.length || labels.some((l) => ["DRAFT", "SPAM", "TRASH", "CATEGORY_PROMOTIONS", "CATEGORY_UPDATES", "CATEGORY_SOCIAL", "CATEGORY_FORUMS"].includes(l))) return "unknown_or_automated";
  if (sender !== mailbox.toLowerCase() && customerEmails.includes(sender)) return "customer_inbound";
  return "unverified_sender";
}