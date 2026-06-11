import { useEffect, useMemo, useRef, useState } from "react";
import DOMPurify from "dompurify";

/**
 * Gmail-szerű email body renderer:
 * - iframe srcdoc -> teljes CSS izoláció, eredeti email stílusok megmaradnak
 * - cid: hivatkozások cseréje presigned URL-re
 * - auto-resize a tartalom magasságához
 */
export function EmailHtmlFrame({
  html,
  inlineByCid,
  showRemoteImages,
}: {
  html: string;
  inlineByCid?: Map<string, string>;
  showRemoteImages: boolean;
}) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState(120);

  const srcDoc = useMemo(() => {
    if (typeof window === "undefined") return "";
    // DOMPurify teljes dokumentumként, style és inline style megtartva
    const clean = DOMPurify.sanitize(html, {
      WHOLE_DOCUMENT: true,
      FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "button", "meta", "link"],
      FORBID_ATTR: ["onerror", "onclick", "onload", "onmouseover", "onfocus", "onblur"],
      ALLOW_DATA_ATTR: false,
    });
    const doc = new DOMParser().parseFromString(clean, "text/html");

    doc.querySelectorAll("img").forEach((img) => {
      const src = img.getAttribute("src") ?? "";
      img.setAttribute("loading", "lazy");
      img.setAttribute("referrerpolicy", "no-referrer");
      if (src.startsWith("cid:") && inlineByCid) {
        const cid = src.slice(4).replace(/[<>]/g, "");
        const repl = inlineByCid.get(cid);
        if (repl) img.setAttribute("src", repl);
        return;
      }
      if (/^https?:\/\//i.test(src)) {
        if (!showRemoteImages) {
          img.setAttribute("data-remote-src", src);
          img.removeAttribute("src");
        }
      }
    });
    doc.querySelectorAll("a").forEach((a) => {
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
    });

    // alap stílusok – nem írjuk felül az email stílusait, csak alapot adunk
    const baseStyle = `
      <style>
        html,body{margin:0;padding:0;background:transparent;color:#111;
          font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
          font-size:14px;line-height:1.55;word-wrap:break-word;overflow-wrap:anywhere;}
        img{max-width:100%;height:auto;}
        table{max-width:100%;}
        a{color:#1a73e8;}
        body{padding:4px 2px;}
      </style>`;
    const head = doc.querySelector("head");
    if (head) head.insertAdjacentHTML("beforeend", baseStyle);
    else doc.documentElement.insertAdjacentHTML("afterbegin", `<head>${baseStyle}</head>`);

    return "<!doctype html>" + doc.documentElement.outerHTML;
  }, [html, inlineByCid, showRemoteImages]);

  // A sandbox NEM tartalmaz allow-scripts (biztonság), így a magasságot
  // a parent oldalról mérjük. Az iframe same-origin (srcDoc), így a
  // contentDocument elérhető.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let ro: ResizeObserver | null = null;
    let rafId: number | null = null;
    let lastH = 0;
    const measure = () => {
      if (rafId != null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const doc = el.contentDocument;
        if (!doc) return;
        const h = Math.max(
          doc.body?.scrollHeight ?? 0,
          doc.documentElement?.scrollHeight ?? 0,
        );
        const next = Math.min(Math.max(h + 8, 80), 50000);
        if (h > 0 && Math.abs(next - lastH) > 1) {
          lastH = next;
          setHeight(next);
        }
      });
    };
    const onLoad = () => {
      measure();
      const doc = el.contentDocument;
      if (!doc) return;
      if ("ResizeObserver" in window && doc.body) {
        ro = new ResizeObserver(measure);
        ro.observe(doc.body);
      }
      doc.querySelectorAll("img").forEach((img) => {
        if (!(img as HTMLImageElement).complete) {
          img.addEventListener("load", measure);
          img.addEventListener("error", measure);
        }
      });
    };
    el.addEventListener("load", onLoad);
    // Első mérés, ha már betöltődött
    if (el.contentDocument?.readyState === "complete") onLoad();
    const t1 = setTimeout(measure, 300);
    const t2 = setTimeout(measure, 1200);
    return () => {
      el.removeEventListener("load", onLoad);
      ro?.disconnect();
      if (rafId != null) cancelAnimationFrame(rafId);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [srcDoc]);

  return (
    <iframe
      ref={ref}
      title="email"
      srcDoc={srcDoc}
      sandbox="allow-same-origin allow-popups"
      scrolling="no"
      style={{
        width: "100%",
        height,
        border: 0,
        display: "block",
        background: "transparent",
        overflow: "hidden",
      }}
    />
  );
}