/**
 * Sitemap feldolgozó (rekurzív sitemapindex támogatással), a WKHtml
 * absztrakción keresztül. A node-html-parser XML tageket is olvassa.
 */

import { getDefaultHtmlParser } from "./html/parser";

const MAX_URLS = 500;
const MAX_INDEX_DEPTH = 3;

async function fetchText(url: string, timeoutMs = 15_000): Promise<string> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "user-agent": "VibaCRM-WK/1.0 (+https://vibateam.hu)" },
    });
    if (!res.ok) throw new Error(`sitemap fetch ${url}: HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(to);
  }
}

async function collectFromXml(
  xml: string,
  depth: number,
  acc: Set<string>,
): Promise<void> {
  if (depth > MAX_INDEX_DEPTH) return;
  const parser = await getDefaultHtmlParser();
  const doc = parser.parse(xml);

  const sitemapNodes = doc.querySelectorAll("sitemap > loc");
  if (sitemapNodes.length > 0) {
    for (const node of sitemapNodes) {
      if (acc.size >= MAX_URLS) return;
      const child = node.text.trim();
      if (!/^https?:\/\//i.test(child)) continue;
      try {
        const childXml = await fetchText(child);
        await collectFromXml(childXml, depth + 1, acc);
      } catch {
        // részleges sitemap-index: ignoráljuk a hibás gyerekeket
      }
    }
    return;
  }

  const urlNodes = doc.querySelectorAll("url > loc");
  for (const node of urlNodes) {
    if (acc.size >= MAX_URLS) break;
    const u = node.text.trim();
    if (!/^https?:\/\//i.test(u)) continue;
    acc.add(u);
  }
}

export async function fetchSitemapUrls(sitemapUrl: string): Promise<string[]> {
  const xml = await fetchText(sitemapUrl);
  const set = new Set<string>();
  await collectFromXml(xml, 0, set);
  return Array.from(set);
}

export function guessSitemapUrl(baseUrl: string): string {
  const u = new URL(baseUrl);
  return `${u.origin}/sitemap.xml`;
}