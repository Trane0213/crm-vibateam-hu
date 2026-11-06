import { escapedMailHtml, testCopy } from './campaign-send-policy';
export function campaignTestCopy(subject: string, text: string, html: string | null) {
  // HTML-only imports are preserved but cannot use the existing body-required test claim.
  const copy = testCopy(subject, text);
  const render = (s: string) => s.replace(/\{\{ceg\}\}/g, 'TESZT VIBA-TEAM').replace(/\{\{nev\}\}/g, 'TESZT Címzett');
  return { ...copy, html: html === null ? escapedMailHtml(copy.body) : render(html) };
}