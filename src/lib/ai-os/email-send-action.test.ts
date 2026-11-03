import {describe,it,expect} from 'vitest';
import {emailSendInput,emailSendAction,assertSameEmail,byteHash,verifyEmailSend} from './email-send-action';
import {verifyExecution} from './approval';
const id='11111111-1111-4111-8111-111111111111';
export const fixture=emailSendAction.parse({message:{leadId:id,mailbox:'test@example.com',to:['customer@example.com'],cc:['copy@example.com'],bcc:['hidden@example.com'],subject:'TESZT levél',body:'Teljes TESZT üzenet.'},context:{lead:{id,summary:'TESZT ügy'},company:{id,name:'TESZT cég'},contact:null,quote:null,thread:null},attachments:[]});
describe('Timothy approved email contract',()=>{
  it('requires full sender, recipients, subject, body and exact lead',()=>{
    for(const field of ['leadId','mailbox','to','subject','body'])expect(emailSendInput.safeParse({...fixture.message,[field]:undefined}).success).toBe(false);
  });
  it('rejects header injection',()=>expect(emailSendInput.safeParse({...fixture.message,subject:'TESZT\r\nBcc: stranger@example.com'}).success).toBe(false));
  it('rejects repeated recipients across To/CC/BCC',()=>expect(emailSendInput.safeParse({...fixture.message,bcc:fixture.message.to}).success).toBe(false));
  it('rejects secrets',()=>expect(emailSendInput.safeParse({...fixture.message,body:'access_token=hidden-value'}).success).toBe(false));
  it.each(['mailbox','to','cc','bcc','subject','body','leadId'])('requires new approval if %s changes',field=>{
    expect(()=>assertSameEmail(fixture,{...fixture,message:{...fixture.message,[field]:'changed'}})).toThrow();
  });
  it('rejects changed file hash and changed context',()=>{
    expect(()=>assertSameEmail(fixture,{...fixture,attachments:[{sha256:'b'.repeat(64)}]})).toThrow();
    expect(()=>assertSameEmail(fixture,{...fixture,context:{...fixture.context,lead:{id:'other'}}})).toThrow();
  });
  it('hashes actual bytes with SHA-256',async()=>expect(await byteHash(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'));
  it('success requires Gmail SENT and exact own CRM evidence',()=>{
    const data={gmail_message_id:'gmail123',email_id:id,thread_id:id,mailbox:fixture.message.mailbox,lead_id:id,verified_sent:true,proof_saved:true};
    expect(verifyEmailSend(data,fixture)).toBe(true);
    for(const field of ['verified_sent','proof_saved','email_id','gmail_message_id','mailbox','lead_id'])expect(verifyEmailSend({...data,[field]:null},fixture)).toBe(false);
    expect(verifyExecution('sales_send_email',{ok:true,data:{...data,proof_saved:false}},fixture).status).toBe('unknown');
  });
});