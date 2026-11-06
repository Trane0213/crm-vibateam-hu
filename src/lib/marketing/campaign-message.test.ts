import {expect,it} from 'vitest';
import {withCampaignSignature} from './campaign-message';
it('appends the signature exactly once without mutating the base message',()=>{const first=withCampaignSignature('TESZT','<b>TESZT</b>','<i>Aláírás</i>','Aláírás');expect(first.html).toBe('<b>TESZT</b><br><br><div data-viba-signature="true"><i>Aláírás</i></div>');expect(withCampaignSignature('TESZT','<b>TESZT</b>','<i>Új</i>','Új').html).not.toContain('Aláírás');});
it('does not automatically append a signature to imported mail',()=>expect(withCampaignSignature('','<b>Forrás aláírással</b>',null,null).html).toBe('<b>Forrás aláírással</b>'));
it('escapes plain text but preserves stored HTML',()=>expect(withCampaignSignature('<TESZT>',null,null,null).html).toBe('&lt;TESZT&gt;'));