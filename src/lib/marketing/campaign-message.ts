import { escapedMailHtml } from './campaign-send-policy';
export function withCampaignSignature(body:string,html:string|null,signatureHtml:string|null,signatureText:string|null) {
 const text=signatureText?.trim() ? `${body}\n\n${signatureText}` : body;
 const original=html ?? escapedMailHtml(body);
 const signature=signatureHtml?.trim() || (signatureText?.trim()?escapedMailHtml(signatureText):'');
 return {body:text,html:signature?`${original}<br><br><div data-viba-signature="true">${signature}</div>`:original};
}