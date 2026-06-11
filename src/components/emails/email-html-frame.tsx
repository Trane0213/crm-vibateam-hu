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

    // Magasság-jelentő script (iframe -> parent)
    const resizer = `
      <script>
        (function(){
          function send(){
            var h = Math.max(
              document.body ? document.body.scrollHeight : 0,
              document.documentElement ? document.documentElement.scrollHeight : 0
            );
            parent.postMessage({__emailFrame:true, h:h}, '*');
          }
          window.addEventListener('load', send);
          window.addEventListener('resize', send);
          var ro = new ResizeObserver(send);
          if(document.body) ro.observe(document.body);
          document.querySelectorAll('img').forEach(function(i){
            if(!i.complete) i.addEventListener('load', send);
            i.addEventListener('error', send);
          });
          setTimeout(send, 100);
          setTimeout(send, 600);
          setTimeout(send, 1500);
        })();
      <\/script>`;
    const body = doc.querySelector("body");
    if (body) body.insertAdjacentHTML("beforeend", resizer);

    return "<!doctype html>" + doc.documentElement.outerHTML;
  }, [html, inlineByCid, showRemoteImages]);

  useEffect(() => {
    function onMsg(ev: MessageEvent) {
      const data: any = ev.data;
      if (data && data.__emailFrame && typeof data.h === "number") {
        setHeight(Math.min(Math.max(data.h + 8, 80), 20000));
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  return (
    <iframe
      ref={ref}
      title="email"
      srcDoc={srcDoc}
      sandbox="allow-same-origin allow-popups"
      style={{ width: "100%", height, border: 0, display: "block", background: "transparent" }}
    />
  );
}