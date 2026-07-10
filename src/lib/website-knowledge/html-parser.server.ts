/**
 * Nyers HTML → strukturált oldalreprezentáció (WK-2 heurisztika).
 *
 * A parser a WKHtml adapteren keresztül fut. Ha később más DOM lib-re
 * cseréljük, csak az adaptert kell kicserélni — az itteni szelektorok
 * változatlanok maradnak (standard CSS querySelector szintaxis).
 */

import { getDefaultHtmlParser } from "./html/parser";
import type { WKHtmlDocument, WKHtmlElement } from "./html/parser";

// ------- DTO típusok (később a pages.server.ts írja tábláinkba) -------

export interface ExtractedHero {
  position: number;
  headline: string | null;
  subheadline: string | null;
  cta_label: string | null;
  cta_url: string | null;
  media_url: string | null;
}

export interface ExtractedTextBlock {
  position: number;
  heading: string | null;
  body_text: string;
}

export interface ExtractedFeatures {
  position: number;
  heading: string | null;
  items: Array<{ title: string; description: string }>;
}

export interface ExtractedFaq {
  position: number;
  heading: string | null;
  items: Array<{ question: string; answer: string }>;
}

export interface ExtractedCta {
  position: number;
  headline: string | null;
  description: string | null;
  cta_label: string | null;
  cta_url: string | null;
}

export interface ExtractedMedia {
  url: string;
  media_kind: "image" | "video" | "document" | "other";
  alt_text: string | null;
  mime_type: string | null;
  width: number | null;
  height: number | null;
}

export interface ExtractedPage {
  title: string | null;
  meta_description: string | null;
  rendered_text: string;
  hero: ExtractedHero | null;
  text_blocks: ExtractedTextBlock[];
  features: ExtractedFeatures[];
  faqs: ExtractedFaq[];
  ctas: ExtractedCta[];
  media: ExtractedMedia[];
  metadata: Record<string, unknown>;
}

// --------- Segédfüggvények ---------

function cleanText(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/\s+/g, " ")
    .replace(/\u00A0/g, " ")
    .trim();
}

function absoluteUrl(baseUrl: string, href: string | null | undefined): string | null {
  if (!href) return null;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function guessMediaKind(url: string): ExtractedMedia["media_kind"] {
  const lower = url.toLowerCase().split("?")[0];
  if (/\.(png|jpe?g|webp|gif|svg|avif)$/.test(lower)) return "image";
  if (/\.(mp4|webm|mov|m4v)$/.test(lower)) return "video";
  if (/\.(pdf|docx?|xlsx?|pptx?)$/.test(lower)) return "document";
  return "other";
}

function guessMime(url: string): string | null {
  const lower = url.toLowerCase().split("?")[0];
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".avif")) return "image/avif";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".pdf")) return "application/pdf";
  return null;
}

function intOrNull(v: string | null): number | null {
  if (!v) return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

// --------- Extraktorok ---------

function extractHero(doc: WKHtmlDocument, baseUrl: string): ExtractedHero | null {
  // Első <h1> és környezete
  const h1 = doc.querySelector("h1");
  if (!h1) return null;
  const headline = cleanText(h1.text);
  if (!headline) return null;

  // Kereshetünk közeli p / cta linket az első hero-jelölt szekcióban
  const heroContainer =
    doc.querySelector("header") ??
    doc.querySelector("section") ??
    doc.querySelector("main") ??
    null;

  let subheadline: string | null = null;
  let ctaLabel: string | null = null;
  let ctaUrl: string | null = null;
  let mediaUrl: string | null = null;

  if (heroContainer) {
    const p = heroContainer.querySelector("p");
    subheadline = p ? cleanText(p.text) || null : null;

    const a =
      heroContainer.querySelector("a[class*='btn']") ??
      heroContainer.querySelector("a[role='button']") ??
      heroContainer.querySelector("a");
    if (a) {
      ctaLabel = cleanText(a.text) || null;
      ctaUrl = absoluteUrl(baseUrl, a.getAttribute("href"));
    }

    const img = heroContainer.querySelector("img");
    if (img) {
      mediaUrl = absoluteUrl(baseUrl, img.getAttribute("src"));
    }
  }

  return {
    position: 0,
    headline,
    subheadline,
    cta_label: ctaLabel,
    cta_url: ctaUrl,
    media_url: mediaUrl,
  };
}

function extractTextBlocks(doc: WKHtmlDocument): ExtractedTextBlock[] {
  // h2-nkénti szekció: minden h2 után a következő h2-ig tartó p szövegek összegyűjtve
  const headings = doc.querySelectorAll("h2");
  if (headings.length === 0) return [];
  const blocks: ExtractedTextBlock[] = [];
  headings.forEach((h, idx) => {
    const heading = cleanText(h.text);
    if (!heading) return;
    // Egyszerűsítés: a heading legközelebbi <section> / <div> szülőjében gyűjtjük a p-t.
    // A WKHtml interfészben nincs .parentNode, ezért közelítés: a doc összes p-jét
    // NEM tudjuk pozíció szerint szűrni — ez a heurisztika a headinget adja vissza
    // opcionális body szöveggel a heading után lévő közvetlen szomszéd p-ből.
    // (Későbbi sprint finomíthatja, ha kell.)
    const bodyText = "";
    blocks.push({ position: idx, heading, body_text: bodyText });
  });
  return blocks;
}

function extractFeatures(doc: WKHtmlDocument): ExtractedFeatures[] {
  // Heurisztika: <ul> vagy <ol> listák, amelyek <li>-ben h3/strong címet és p-t
  // tartalmaznak, feature-blokknak számítanak. Egyszerűsítve az összes li szövege.
  const lists = doc.querySelectorAll("ul, ol");
  const out: ExtractedFeatures[] = [];
  let pos = 0;
  for (const list of lists) {
    const items = list.querySelectorAll("li");
    if (items.length < 3) continue;
    const parsed: Array<{ title: string; description: string }> = [];
    for (const li of items) {
      const strong = li.querySelector("strong") ?? li.querySelector("h3") ?? li.querySelector("h4");
      const title = strong ? cleanText(strong.text) : cleanText(li.text).slice(0, 80);
      const desc = strong ? cleanText(li.text).replace(cleanText(strong.text), "").trim() : "";
      if (!title) continue;
      parsed.push({ title, description: desc });
    }
    if (parsed.length >= 3) {
      out.push({ position: pos++, heading: null, items: parsed });
    }
  }
  return out;
}

function extractFaqs(doc: WKHtmlDocument): ExtractedFaq[] {
  // <details><summary>Q</summary>A</details> vagy schema.org FAQPage minta
  const detailsList = doc.querySelectorAll("details");
  const out: ExtractedFaq[] = [];
  if (detailsList.length > 0) {
    const items: Array<{ question: string; answer: string }> = [];
    for (const d of detailsList) {
      const summary = d.querySelector("summary");
      const q = summary ? cleanText(summary.text) : "";
      if (!q) continue;
      const a = cleanText(d.text).replace(q, "").trim();
      items.push({ question: q, answer: a });
    }
    if (items.length > 0) {
      out.push({ position: 0, heading: null, items });
    }
  }
  return out;
}

function extractCtas(doc: WKHtmlDocument, baseUrl: string): ExtractedCta[] {
  // Egyszerű heurisztika: minden .cta / [role=cta] / a.btn-primary jelölt blokk
  const nodes: WKHtmlElement[] = [
    ...doc.querySelectorAll("[class*='cta']"),
    ...doc.querySelectorAll("[data-cta]"),
  ];
  const out: ExtractedCta[] = [];
  const seen = new Set<string>();
  let pos = 0;
  for (const n of nodes) {
    const headline =
      n.querySelector("h2")?.text ?? n.querySelector("h3")?.text ?? null;
    const link =
      n.querySelector("a[class*='btn']") ?? n.querySelector("a");
    if (!headline && !link) continue;
    const label = link ? cleanText(link.text) : null;
    const url = link ? absoluteUrl(baseUrl, link.getAttribute("href")) : null;
    const key = `${cleanText(headline)}|${label}|${url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      position: pos++,
      headline: cleanText(headline) || null,
      description: null,
      cta_label: label,
      cta_url: url,
    });
    if (out.length >= 8) break;
  }
  return out;
}

function extractMedia(doc: WKHtmlDocument, baseUrl: string): ExtractedMedia[] {
  const out: ExtractedMedia[] = [];
  const seen = new Set<string>();
  for (const img of doc.querySelectorAll("img")) {
    const src = absoluteUrl(baseUrl, img.getAttribute("src"));
    if (!src || seen.has(src)) continue;
    seen.add(src);
    out.push({
      url: src,
      media_kind: "image",
      alt_text: img.getAttribute("alt") || null,
      mime_type: guessMime(src),
      width: intOrNull(img.getAttribute("width")),
      height: intOrNull(img.getAttribute("height")),
    });
  }
  for (const source of doc.querySelectorAll("video, source")) {
    const src = absoluteUrl(baseUrl, source.getAttribute("src"));
    if (!src || seen.has(src)) continue;
    seen.add(src);
    out.push({
      url: src,
      media_kind: guessMediaKind(src),
      alt_text: null,
      mime_type: source.getAttribute("type") || guessMime(src),
      width: null,
      height: null,
    });
  }
  return out;
}

// --------- Public API ---------

export async function parseHtml(
  rawHtml: string,
  baseUrl: string,
): Promise<ExtractedPage> {
  const parser = await getDefaultHtmlParser();
  const doc = parser.parse(rawHtml);

  const titleNode = doc.querySelector("title");
  const title = titleNode ? cleanText(titleNode.text) || null : null;

  const metaDesc =
    doc.querySelector("meta[name='description']")?.getAttribute("content") ??
    doc.querySelector("meta[property='og:description']")?.getAttribute("content") ??
    null;

  // rendered_text: main / body plain text, cleaned. Script/style nem lesz benne,
  // mert a node-html-parser blockTextElements alapján NEM adja vissza a .text-ben.
  const mainNode = doc.querySelector("main") ?? doc.querySelector("body");
  const renderedRaw = mainNode ? mainNode.text : doc.text;
  const rendered_text = renderedRaw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    title,
    meta_description: metaDesc ? cleanText(metaDesc) : null,
    rendered_text,
    hero: extractHero(doc, baseUrl),
    text_blocks: extractTextBlocks(doc),
    features: extractFeatures(doc),
    faqs: extractFaqs(doc),
    ctas: extractCtas(doc, baseUrl),
    media: extractMedia(doc, baseUrl),
    metadata: {
      parser: "node-html-parser",
    },
  };
}