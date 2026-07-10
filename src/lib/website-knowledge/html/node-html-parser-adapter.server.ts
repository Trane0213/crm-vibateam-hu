/**
 * `node-html-parser` alapú adapter a WKHtmlParser interfészhez.
 *
 * Csak szerveroldalon töltődik be (`.server.ts`), a kliens bundle-ből
 * a Vite server-only guard kizárja.
 */

import { parse as nhpParse, type HTMLElement as NHPHtmlElement } from "node-html-parser";
import type { WKHtmlDocument, WKHtmlElement, WKHtmlParser } from "./parser";

function wrapElement(el: NHPHtmlElement): WKHtmlElement {
  return {
    get tagName() {
      return (el.tagName ?? "").toLowerCase();
    },
    getAttribute(name: string): string | null {
      const v = el.getAttribute(name);
      return v ?? null;
    },
    get text() {
      return el.text ?? "";
    },
    get innerHTML() {
      return el.innerHTML ?? "";
    },
    querySelector(selector: string): WKHtmlElement | null {
      const found = el.querySelector(selector);
      return found ? wrapElement(found as NHPHtmlElement) : null;
    },
    querySelectorAll(selector: string): WKHtmlElement[] {
      const list = el.querySelectorAll(selector);
      return list.map((n) => wrapElement(n as NHPHtmlElement));
    },
  };
}

export const nodeHtmlParserAdapter: WKHtmlParser = {
  parse(rawHtml: string): WKHtmlDocument {
    const root = nhpParse(rawHtml, {
      lowerCaseTagName: true,
      comment: false,
      voidTag: { closingSlash: true, tags: [] },
      blockTextElements: {
        script: false,
        noscript: false,
        style: false,
        pre: true,
      },
    });
    return {
      querySelector(selector: string): WKHtmlElement | null {
        const found = root.querySelector(selector);
        return found ? wrapElement(found as NHPHtmlElement) : null;
      },
      querySelectorAll(selector: string): WKHtmlElement[] {
        const list = root.querySelectorAll(selector);
        return list.map((n) => wrapElement(n as NHPHtmlElement));
      },
      get text() {
        return root.text ?? "";
      },
    };
  },
};