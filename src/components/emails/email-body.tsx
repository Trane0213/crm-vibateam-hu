import { useMemo } from "react";
import DOMPurify from "dompurify";

/** Detects HTML by looking for an HTML tag near the start. */
function looksLikeHtml(s: string): boolean {
  const head = s.slice(0, 2000);
  return /<\s*(html|body|div|p|a|table|span|br|img|h[1-6]|ul|ol|li|strong|em|style|meta|head|tbody|tr|td|font)\b/i.test(head);
}

/** Shortens a URL/word so it never blows the layout. */
export function shortenUrl(url: string, max = 48): string {
  if (url.length <= max) return url;
  try {
    const u = new URL(url);
    const host = u.host.replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "");
    const tail = path.length > 18 ? "…" + path.slice(-18) : path;
    const out = `${host}${tail}`;
    return out.length > max ? out.slice(0, max - 1) + "…" : out;
  } catch {
    return url.slice(0, max - 1) + "…";
  }
}

/** Linkifies + shortens URLs in plain text. */
function renderPlainText(text: string) {
  const parts: (string | { url: string })[] = [];
  const re = /https?:\/\/[^\s<>()"']+/gi;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) parts.push(text.slice(last, idx));
    parts.push({ url: m[0] });
    last = idx + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return (
    <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
      {parts.map((p, i) =>
        typeof p === "string" ? (
          <span key={i}>{p}</span>
        ) : (
          <a
            key={i}
            href={p.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2 hover:no-underline break-all"
            title={p.url}
          >
            {shortenUrl(p.url)}
          </a>
        ),
      )}
    </div>
  );
}

/** Sanitize + post-process HTML: open links in new tab, shorten visible link text. */
function sanitizeHtml(html: string): string {
  const clean = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input", "button", "meta", "link"],
    FORBID_ATTR: ["onerror", "onclick", "onload", "onmouseover", "style"],
    ALLOW_DATA_ATTR: false,
  });
  if (typeof window === "undefined") return clean;
  const doc = new DOMParser().parseFromString(clean, "text/html");
  doc.querySelectorAll("a").forEach((a) => {
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener noreferrer");
    const href = a.getAttribute("href") ?? "";
    const txt = (a.textContent ?? "").trim();
    if (href && txt && (txt === href || /^https?:\/\//i.test(txt)) && txt.length > 48) {
      a.textContent = shortenUrl(txt);
      a.setAttribute("title", href);
    }
  });
  doc.querySelectorAll("img").forEach((img) => {
    img.setAttribute("loading", "lazy");
    img.setAttribute("referrerpolicy", "no-referrer");
  });
  return doc.body.innerHTML;
}

export function EmailBody({ body }: { body: string | null | undefined }) {
  const text = body ?? "";
  const isHtml = useMemo(() => looksLikeHtml(text), [text]);
  const html = useMemo(() => (isHtml ? sanitizeHtml(text) : ""), [isHtml, text]);

  if (!text.trim()) {
    return <div className="text-sm text-muted-foreground italic">(üres üzenet)</div>;
  }
  if (isHtml) {
    return (
      <div
        className="email-html max-w-none break-words text-sm leading-relaxed text-foreground/90 [&_a]:text-primary [&_a]:underline [&_a]:break-all [&_img]:max-w-full [&_img]:h-auto [&_table]:max-w-full [&_table]:block [&_table]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_p]:my-2 [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:my-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  return renderPlainText(text);
}

/** One-line preview text. Strips HTML/whitespace and shortens URLs. Returns up to `max` chars. */
export function emailPreview(body: string | null | undefined, summary?: string | null, max = 80): string {
  const src = (summary && summary.trim().length > 0 ? summary : body) ?? "";
  let txt = src;
  if (looksLikeHtml(txt)) txt = txt.replace(/<[^>]+>/g, " ");
  txt = txt
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/https?:\/\/[^\s]+/gi, (u) => shortenUrl(u, 32))
    .replace(/\s+/g, " ")
    .trim();
  if (!txt) return "";
  return txt.length > max ? txt.slice(0, max - 1) + "…" : txt;
}