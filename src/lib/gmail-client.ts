import { getGmailConnection } from "@/lib/gmail-store";

export type GmailMessage = {
  id: string;
  threadId: string;
  snippet?: string;
  labelIds?: string[];
  internalDate?: string;
  payload?: {
    headers?: { name: string; value: string }[];
    body?: { data?: string; size?: number };
    parts?: any[];
    mimeType?: string;
  };
};

async function callProxy<T = any>(
  authUid: string,
  path: string,
  init?: { method?: string; query?: Record<string, any>; body?: any },
): Promise<T> {
  const { apiKey } = getGmailConnection(authUid);
  if (!apiKey) throw new Error("NO_GMAIL_CONNECTION");
  const r = await fetch("/api/gmail/proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionAPIKey: apiKey, path, ...init }),
  });
  const text = await r.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* ignore */
  }
  if (!r.ok) {
    const detail =
      parsed?.error?.message ?? parsed?.error ?? parsed?.message ?? text.slice(0, 400);
    throw new Error(`Gmail API hiba (HTTP ${r.status}): ${detail}`);
  }
  return parsed as T;
}

export async function listMessages(
  authUid: string,
  opts: { q?: string; labelIds?: string[]; maxResults?: number; pageToken?: string } = {},
) {
  const query: Record<string, any> = {};
  if (opts.q) query.q = opts.q;
  if (opts.labelIds && opts.labelIds.length) query.labelIds = opts.labelIds;
  query.maxResults = opts.maxResults ?? 25;
  if (opts.pageToken) query.pageToken = opts.pageToken;
  return callProxy<{ messages?: { id: string; threadId: string }[]; nextPageToken?: string; resultSizeEstimate?: number }>(
    authUid,
    "/gmail/v1/users/me/messages",
    { query },
  );
}

export async function getMessage(
  authUid: string,
  id: string,
  format: "full" | "metadata" | "minimal" = "metadata",
) {
  return callProxy<GmailMessage>(authUid, `/gmail/v1/users/me/messages/${id}`, {
    query: { format, metadataHeaders: ["Subject", "From", "To", "Cc", "Date"] },
  });
}

export async function listLabels(authUid: string) {
  return callProxy<{ labels: { id: string; name: string; type?: string }[] }>(
    authUid,
    "/gmail/v1/users/me/labels",
  );
}

export async function getProfile(authUid: string) {
  return callProxy<{ emailAddress: string; messagesTotal: number; threadsTotal: number }>(
    authUid,
    "/gmail/v1/users/me/profile",
  );
}

function toBase64Url(input: string): string {
  // UTF-8 safe base64
  const bytes = new TextEncoder().encode(input);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function buildRawEmail(opts: {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  from?: string;
}): string {
  const lines = [
    `To: ${opts.to}`,
    opts.cc ? `Cc: ${opts.cc}` : "",
    opts.bcc ? `Bcc: ${opts.bcc}` : "",
    opts.from ? `From: ${opts.from}` : "",
    `Subject: ${opts.subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    opts.body,
  ].filter(Boolean);
  return toBase64Url(lines.join("\r\n"));
}

export async function sendMessage(
  authUid: string,
  opts: { to: string; subject: string; body: string; cc?: string; bcc?: string; threadId?: string },
) {
  const raw = buildRawEmail(opts);
  return callProxy(authUid, "/gmail/v1/users/me/messages/send", {
    method: "POST",
    body: opts.threadId ? { raw, threadId: opts.threadId } : { raw },
  });
}

export function headerValue(msg: GmailMessage | null, name: string): string {
  const h = msg?.payload?.headers?.find(
    (x) => x.name?.toLowerCase() === name.toLowerCase(),
  );
  return h?.value ?? "";
}

export function parseEmailAddress(raw: string): { name: string; email: string } {
  const m = raw.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  return { name: "", email: raw.trim() };
}