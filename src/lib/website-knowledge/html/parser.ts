/**
 * HTML parser absztrakciós réteg — Website Knowledge.
 *
 * Cél: a felsőbb rétegek (block extraction, media collect, sitemap) NE
 * függjenek közvetlenül a `node-html-parser` konkrét importjától. Ha WK-3+
 * sprintekben más parserre (pl. cheerio, linkedom, HTMLRewriter) kell váltani,
 * elég egy új adapter fájlt írni és a `getDefaultHtmlParser()`-t átkötni.
 *
 * Az interfész szándékosan minimális: `querySelector` / `querySelectorAll`,
 * attribútum, text, tag — semmi lib-specifikus. Minden adapternek ezt kell
 * teljesítenie.
 */

export interface WKHtmlElement {
  readonly tagName: string;
  getAttribute(name: string): string | null;
  readonly text: string;
  readonly innerHTML: string;
  querySelector(selector: string): WKHtmlElement | null;
  querySelectorAll(selector: string): WKHtmlElement[];
}

export interface WKHtmlDocument {
  querySelector(selector: string): WKHtmlElement | null;
  querySelectorAll(selector: string): WKHtmlElement[];
  /** Teljes body / root szöveg (normalizálva a hívó oldalán). */
  readonly text: string;
}

export interface WKHtmlParser {
  /** Nyers HTML-ből épít egy dokumentumot. Kivétel esetén hibát dob. */
  parse(rawHtml: string): WKHtmlDocument;
}

let currentParser: WKHtmlParser | null = null;

/**
 * A default parser lusta importtal töltődik be, hogy ez a fájl (a felület)
 * client-safe maradjon: a konkrét `node-html-parser` csak akkor tölt be, ha
 * valaki ténylegesen parseolni akar (mindig szerveroldalon).
 */
export async function getDefaultHtmlParser(): Promise<WKHtmlParser> {
  if (currentParser) return currentParser;
  const mod = await import("./node-html-parser-adapter.server");
  currentParser = mod.nodeHtmlParserAdapter;
  return currentParser;
}

/**
 * Teszt / jövőbeli csere pontja: felülíthatja a default parsert.
 * Éles kódnak nem szabad hívnia.
 */
export function _setHtmlParserForTesting(parser: WKHtmlParser | null): void {
  currentParser = parser;
}