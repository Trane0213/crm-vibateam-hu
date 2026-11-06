import { useMemo } from 'react';
import DOMPurify from 'dompurify';

/** Canonical HTML stays unchanged; rendering cannot execute or fetch third-party resources. */
export function CampaignHtmlPreview({ html }: { html: string }) {
  const doc = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const clean = DOMPurify.sanitize(html, { WHOLE_DOCUMENT: true, FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'meta', 'link', 'base'] });
    return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'"></head><body>${clean}</body></html>`;
  }, [html]);
  return <iframe title="Mentett kampány HTML-előnézete" sandbox="" referrerPolicy="no-referrer" srcDoc={doc} className="h-80 w-full border bg-background" />;
}