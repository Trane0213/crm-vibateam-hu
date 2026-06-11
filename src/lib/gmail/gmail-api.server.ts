/**
 * Gmail API v1 — direkt hivasok a Google REST endpointokra.
 * Server-only. Egyetlen Lovable connector hivas SINCS.
 */

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

async function call<T>(accessToken: string, path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
    },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Gmail API ${r.status}: ${text.slice(0, 500)}`);
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export type GmailListItem = { id: string; threadId: string };
export type GmailListResp = { messages?: GmailListItem[]; nextPageToken?: string; resultSizeEstimate?: number };

export function listMessages(
  accessToken: string,
  opts: { q?: string; labelIds?: string[]; maxResults?: number; pageToken?: string } = {},
) {
  const p = new URLSearchParams();
  if (opts.q) p.set("q", opts.q);
  p.set("maxResults", String(opts.maxResults ?? 25));
  if (opts.pageToken) p.set("pageToken", opts.pageToken);
  (opts.labelIds ?? []).forEach((l) => p.append("labelIds", l));
  return call<GmailListResp>(accessToken, `/messages?${p.toString()}`);
}

export type GmailMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  internalDate?: string;
  payload?: {
    mimeType?: string;
    headers?: { name: string; value: string }[];
    body?: { data?: string; size?: number };
    parts?: any[];
  };
};

export function getMessage(accessToken: string, id: string, format: "full" | "metadata" | "minimal" = "full") {
  const p = new URLSearchParams({ format });
  return call<GmailMessage>(accessToken, `/messages/${id}?${p.toString()}`);
}

export function getProfile(accessToken: string) {
  return call<{ emailAddress: string; messagesTotal: number; threadsTotal: number; historyId: string }>(
    accessToken,
    "/profile",
  );
}

export type GmailAttachment = { data: string; size: number };
export function getAttachment(accessToken: string, messageId: string, attachmentId: string) {
  return call<GmailAttachment>(
    accessToken,
    `/messages/${messageId}/attachments/${attachmentId}`,
  );
}

/** Csatolmány részek bejárása rekurzívan. Inline + valódi csatolmány is. */
export type GmailAttachmentPart = {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
  inline: boolean;
  contentId: string | null;
};
export function listAttachmentParts(m: GmailMessage): GmailAttachmentPart[] {
  const out: GmailAttachmentPart[] = [];
  const walk = (part: any) => {
    if (!part) return;
    const att = part.body?.attachmentId as string | undefined;
    const fname = (part.filename as string | undefined) ?? "";
    if (att && (fname || part.mimeType?.startsWith("image/"))) {
      const headers: { name: string; value: string }[] = part.headers ?? [];
      const disp = headers.find((h) => h.name?.toLowerCase() === "content-disposition")?.value ?? "";
      const cid = headers.find((h) => h.name?.toLowerCase() === "content-id")?.value ?? "";
      out.push({
        attachmentId: att,
        filename: fname || `attachment-${out.length + 1}`,
        mimeType: part.mimeType ?? "application/octet-stream",
        size: Number(part.body?.size ?? 0),
        inline: /inline/i.test(disp),
        contentId: cid ? cid.replace(/[<>]/g, "") : null,
      });
    }
    if (part.parts) for (const p of part.parts) walk(p);
  };
  walk(m.payload);
  return out;
}

export function sendMessage(accessToken: string, raw: string, threadId?: string) {
  return call<{ id: string; threadId: string; labelIds?: string[] }>(accessToken, "/messages/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(threadId ? { raw, threadId } : { raw }),
  });
}

function toBase64Url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function buildRawEmail(opts: {
  from?: string;
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  inReplyTo?: string;
  references?: string;
}): string {
  const lines = [
    opts.from ? `From: ${opts.from}` : "",
    `To: ${opts.to}`,
    opts.cc ? `Cc: ${opts.cc}` : "",
    opts.bcc ? `Bcc: ${opts.bcc}` : "",
    `Subject: ${opts.subject}`,
    opts.inReplyTo ? `In-Reply-To: ${opts.inReplyTo}` : "",
    opts.references ? `References: ${opts.references}` : "",
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    opts.body,
  ].filter(Boolean);
  return toBase64Url(lines.join("\r\n"));
}

/**
 * Teljes MIME üzenet összeállítása HTML + plain text + csatolmányokkal.
 * Csatolmányok base64-kódolt buffer-ek a hívótól.
 */
export function buildRawMimeMessage(opts: {
  from: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  cc?: string;
  bcc?: string;
  inReplyTo?: string;
  references?: string;
  attachments?: { filename: string; mimeType: string; content: Buffer }[];
}): string {
  const boundaryMixed = "mixed_" + Math.random().toString(36).slice(2);
  const boundaryAlt = "alt_" + Math.random().toString(36).slice(2);
  const subjectEnc = encodeHeader(opts.subject);
  const headers = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    opts.cc ? `Cc: ${opts.cc}` : "",
    opts.bcc ? `Bcc: ${opts.bcc}` : "",
    `Subject: ${subjectEnc}`,
    opts.inReplyTo ? `In-Reply-To: ${opts.inReplyTo}` : "",
    opts.references ? `References: ${opts.references}` : "",
    "MIME-Version: 1.0",
  ].filter(Boolean);

  const textPart = (opts.text ?? htmlToText(opts.html)).replace(/\r?\n/g, "\r\n");

  const altBody = [
    `--${boundaryAlt}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(textPart, "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n"),
    "",
    `--${boundaryAlt}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(opts.html, "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n"),
    "",
    `--${boundaryAlt}--`,
  ].join("\r\n");

  const hasAtt = (opts.attachments?.length ?? 0) > 0;

  let body: string;
  if (!hasAtt) {
    headers.push(`Content-Type: multipart/alternative; boundary="${boundaryAlt}"`);
    body = altBody;
  } else {
    headers.push(`Content-Type: multipart/mixed; boundary="${boundaryMixed}"`);
    const parts: string[] = [
      `--${boundaryMixed}`,
      `Content-Type: multipart/alternative; boundary="${boundaryAlt}"`,
      "",
      altBody,
      "",
    ];
    for (const a of opts.attachments!) {
      parts.push(
        `--${boundaryMixed}`,
        `Content-Type: ${a.mimeType}; name="${encodeHeader(a.filename)}"`,
        `Content-Disposition: attachment; filename="${encodeHeader(a.filename)}"`,
        "Content-Transfer-Encoding: base64",
        "",
        a.content.toString("base64").replace(/(.{76})/g, "$1\r\n"),
        "",
      );
    }
    parts.push(`--${boundaryMixed}--`);
    body = parts.join("\r\n");
  }

  const raw = headers.join("\r\n") + "\r\n\r\n" + body;
  return Buffer.from(raw, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function encodeHeader(s: string): string {
  // RFC 2047: csak akkor encode-oljuk, ha nem-ASCII van benne.
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(s)) return s;
  return "=?UTF-8?B?" + Buffer.from(s, "utf8").toString("base64") + "?=";
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Több címzett RFC-822 értékből kinyert email lista (alacsony betűs). */
export function parseAddressList(raw: string): string[] {
  if (!raw) return [];
  // Egyszerű split vesszővel, figyelve a <...> tartalomra.
  const items: string[] = [];
  let depth = 0;
  let buf = "";
  for (const ch of raw) {
    if (ch === "<") depth++;
    if (ch === ">") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) { items.push(buf); buf = ""; continue; }
    buf += ch;
  }
  if (buf.trim()) items.push(buf);
  const out: string[] = [];
  for (const it of items) {
    const m = it.match(/<([^>]+)>/);
    const v = (m ? m[1] : it).trim().toLowerCase();
    if (v && /.@./.test(v)) out.push(v);
  }
  return Array.from(new Set(out));
}

/** HTML body kinyerés (ha van), külön plain text-től. */
export function extractBodies(m: GmailMessage): { html: string | null; text: string | null } {
  const find = (part: any, mime: string): string | null => {
    if (!part) return null;
    if (part.mimeType === mime && part.body?.data) {
      const pad = part.body.data.length % 4 === 0 ? "" : "=".repeat(4 - (part.body.data.length % 4));
      return Buffer.from(part.body.data.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64").toString("utf8");
    }
    if (part.parts) {
      for (const p of part.parts) {
        const t = find(p, mime);
        if (t) return t;
      }
    }
    return null;
  };
  return { html: find(m.payload, "text/html"), text: find(m.payload, "text/plain") };
}

export function headerOf(m: GmailMessage, name: string): string {
  const h = m.payload?.headers?.find((x) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value ?? "";
}

function decodeBase64Url(data: string): string {
  const pad = data.length % 4 === 0 ? "" : "=".repeat(4 - (data.length % 4));
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64").toString("utf8");
}

export function extractBody(m: GmailMessage): string {
  // Preferaljuk a HTML reszt (a UI-ban formazva jelenitjuk meg), kulonben plain text, kulonben snippet.
  const find = (part: any, mime: string): string | null => {
    if (!part) return null;
    if (part.mimeType === mime && part.body?.data) return decodeBase64Url(part.body.data);
    if (part.parts) {
      for (const p of part.parts) {
        const t = find(p, mime);
        if (t) return t;
      }
    }
    return null;
  };
  return find(m.payload, "text/html") ?? find(m.payload, "text/plain") ?? m.snippet ?? "";
}

/**
 * Async body extractor — ha a Gmail nem inline-olta a HTML body-t (nagy üzenet),
 * `body.attachmentId` formaban adja vissza. Ezt itt letöltjük az attachments
 * API-val, dekódoljuk, és visszaadjuk az EREDETI HTML-t teljes egészében.
 */
async function findPartAsync(
  part: any,
  mime: string,
  accessToken: string,
  messageId: string,
): Promise<string | null> {
  if (!part) return null;
  if (part.mimeType === mime) {
    if (part.body?.data) return decodeBase64Url(part.body.data);
    if (part.body?.attachmentId) {
      try {
        const att = await getAttachment(accessToken, messageId, part.body.attachmentId);
        if (att?.data) return decodeBase64Url(att.data);
      } catch {
        return null;
      }
    }
  }
  if (part.parts) {
    for (const p of part.parts) {
      const r = await findPartAsync(p, mime, accessToken, messageId);
      if (r) return r;
    }
  }
  return null;
}

export async function extractHtmlBodyAsync(m: GmailMessage, accessToken: string): Promise<string | null> {
  if (!m.id) return null;
  return findPartAsync(m.payload, "text/html", accessToken, m.id);
}

export async function extractTextBodyAsync(m: GmailMessage, accessToken: string): Promise<string | null> {
  if (!m.id) return null;
  return findPartAsync(m.payload, "text/plain", accessToken, m.id);
}

export async function extractBestBodyAsync(
  m: GmailMessage,
  accessToken: string,
): Promise<{ body: string; isHtml: boolean }> {
  const html = await extractHtmlBodyAsync(m, accessToken);
  if (html) return { body: html, isHtml: true };
  const text = await extractTextBodyAsync(m, accessToken);
  if (text) return { body: text, isHtml: false };
  return { body: m.snippet ?? "", isHtml: false };
}
