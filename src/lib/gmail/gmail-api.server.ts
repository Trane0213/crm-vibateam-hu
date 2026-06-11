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
