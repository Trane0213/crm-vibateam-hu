import { z } from 'zod';
export const CAMPAIGN_DAILY_LIMIT = 40;
export const CAMPAIGN_TEST_RECIPIENTS = ['viktor.csotai@gmail.com','info@vibateam.hu'] as const;
export const campaignTestInput = z.object({campaignId:z.string().uuid(),expectedUpdatedAt:z.string().min(1),recipient:z.enum(CAMPAIGN_TEST_RECIPIENTS),confirmed:z.literal(true)}).strict();
export const suppressionInput = z.object({contactId:z.string().uuid(),expectedEmail:z.string().email(),expectedRevision:z.string().uuid().nullable(),blocked:z.boolean(),reference:z.string().trim().min(5).max(500)}).strict();
export function campaignDay(at: Date) { return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Budapest',year:'numeric',month:'2-digit',day:'2-digit'}).format(at); }
export function testCopy(subject: string, body: string) {
 if(!subject.trim() || !body.trim()) throw new Error('A mentett tárgy és üzenet kötelező.');
 const render=(s:string)=>s.replace(/\{\{ceg\}\}/g,'TESZT VIBA-TEAM').replace(/\{\{nev\}\}/g,'TESZT Címzett');
 return {subject:`[TESZT] ${render(subject)}`,body:render(body)};
}
export function escapedMailHtml(body:string) { return body.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br/>'); }
export function campaignOutcome(claimed:boolean,liveVerified:boolean,savedVerified:boolean) {return !claimed ? 'not_started' : liveVerified && savedVerified ? 'verified' : 'uncertain';}