import { describe, expect, it } from 'vitest';
import { campaignCopyInput, campaignPreview, explicitContactIds } from './campaign-preparation';
describe('campaign preparation rules', () => {
 it('search never selects an unselected contact', () => expect(explicitContactIds([], ['a','b'])).toEqual([]));
 it('keeps explicit selections across search and removes only unavailable IDs', () => expect(explicitContactIds(['b','b','a'], ['a','b','c'])).toEqual(['b','a']));
 it('does not silently truncate a large explicit set', () => { const ids=Array.from({length:2001},(_,i)=>String(i));expect(explicitContactIds(ids,ids)).toHaveLength(2001); });
 it('does not use inferred unverified person names', () => expect(campaignPreview('{{ceg}}', 'Tisztelt {{nev}}!', {name:'TESZT Anna',company_name:'TESZT Cég',contact_kind:'person',data_source:'email_inferred',verification_state:'unverified'}).body).toBe('Tisztelt !'));
 it('uses only explicitly human-verified personal names', () => expect(campaignPreview('', '{{nev}} – {{ceg}}', {name:'TESZT Anna',company_name:'TESZT Cég',contact_kind:'person',verification_state:'human_verified',verified_by:'owner',verified_at:'2026-11-06'}).body).toBe('TESZT Anna – TESZT Cég'));
 it('never treats an identified shared mailbox as a person', () => expect(campaignPreview('', '{{nev}}', {name:'TESZT Info',contact_kind:'shared_mailbox',verification_state:'human_verified',verified_by:'owner',verified_at:'2026-11-06'}).body).toBe(''));
 it('requires the previously loaded timestamp for updates', () => expect(campaignCopyInput.safeParse({id:'11111111-1111-4111-8111-111111111111',name:'TESZT',message_subject:'',message_body:''}).success).toBe(false));
 it('rejects overlong copy instead of truncating it', () => expect(campaignCopyInput.safeParse({name:'TESZT',message_subject:'x'.repeat(501),message_body:''}).success).toBe(false));
 it('escapes recipient data in HTML while preserving the saved formatting', () => {
  const result=campaignPreview('{{ceg}}','{{ceg}}',{company_name:'TESZT <img src=x> & Cég'},'<b>{{ceg}}</b>');
  expect(result.subject).toBe('TESZT <img src=x> & Cég');
  expect(result.html).toBe('<b>TESZT &lt;img src=x&gt; &amp; Cég</b>');
 });
 it('does not inject inferred names into the HTML preview', () => expect(campaignPreview('','',{name:'Anna',contact_kind:'person',verification_state:'unverified'},'<p>{{nev}}</p>').html).toBe('<p></p>'));
 it('preserves HTML-only saved content and does not invent a plain body', () => expect(campaignPreview('Tárgy','',{},'<b>TESZT</b>')).toMatchObject({body:'',html:'<b>TESZT</b>'}));
});