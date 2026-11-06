import { useEffect,useRef,useState } from 'react';
import DOMPurify from 'dompurify';
import { MailFormatToolbar } from './mail-format-toolbar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
const clean=(html:string)=>DOMPurify.sanitize(html,{FORBID_TAGS:['script','iframe','object','embed','form','input','meta','link','base','style'],FORBID_ATTR:['srcset']});
export function MailHtmlEditor({html,onChange,disabled=false,label}:{html:string;onChange:(html:string,text:string)=>void;disabled?:boolean;label:string}) {
 const ref=useRef<HTMLDivElement|null>(null),last=useRef('');
 const [code,setCode]=useState(false),[source,setSource]=useState('');
 useEffect(()=>{if(ref.current && html!==last.current){ref.current.innerHTML=clean(html);last.current=html;}},[html,code]);
 const commit=()=>{const el=ref.current;if(!el)return;last.current=el.innerHTML;onChange(el.innerHTML,el.innerText);};
 return <div className="min-w-0 overflow-hidden rounded-md border bg-card"><MailFormatToolbar disabled={disabled||code} onCommand={(cmd,value)=>{ref.current?.focus();document.execCommand(cmd,false,value);commit();}}/>
 <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2"><span className="text-sm font-medium">{label}</span><Button type="button" size="sm" variant="outline" disabled={disabled} onClick={()=>{setSource(html);setCode(v=>!v);}}>{code?'Formázott nézet':'HTML-kód'}</Button></div>
 {code ? <div className="space-y-2 p-2"><Textarea aria-label={`${label} HTML-kód`} value={source} maxLength={200000} disabled={disabled} rows={7} onChange={e=>setSource(e.target.value)}/><Button type="button" size="sm" disabled={disabled} onClick={()=>{const el=document.createElement('div');el.innerHTML=clean(source);onChange(el.innerHTML,el.textContent??'');setCode(false);}}>HTML beillesztése</Button></div> : <div ref={ref} role="textbox" aria-label={label} aria-multiline="true" contentEditable={!disabled} suppressContentEditableWarning onInput={commit} onPaste={e=>{e.preventDefault();const rich=e.clipboardData.getData('text/html');const plain=e.clipboardData.getData('text/plain');document.execCommand('insertHTML',false,clean(rich||plain.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')));commit();}} className="min-h-40 max-h-80 overflow-auto break-words p-3 text-sm outline-none [&_a]:text-primary [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"/>}</div>;
}