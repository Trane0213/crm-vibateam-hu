import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {createRouter,createRootRoute,RouterProvider} from '@tanstack/react-router';
import {QuoteWorkflowDetail} from './routes/_authenticated/quotes.$id';
import {supabase} from './integrations/supabase/client';
import './styles.css';
const quote:any={id:'TESZT-flow',title:'TESZT ajánlat',version:1,is_current:true,status:'draft',quote_kind:'received_budget',lead_id:'TESZT-lead',project_id:null,created_at:'2026-11-03',responsible_user_id:'TESZT-user',template_key:'b2b',template_terms:{payment:'TESZT 30 nap'},manual_net_amount:200000};
const qc=new QueryClient({defaultOptions:{queries:{staleTime:Infinity,retry:false}}});
const user={id:'TESZT-user'};
(supabase.auth as any).getSession=async()=>({data:{session:{user}},error:null});
(supabase.auth as any).onAuthStateChange=()=>({data:{subscription:{unsubscribe(){}}}});
(supabase as any).from=(table:string)=>{
 let single=false;let payload:any=null;
 const chain:any=new Proxy({}, {get:(_,prop)=>{
 if(prop==='then')return (resolve:any)=>{let data:any=[]; if(table==='quotes')data=payload?Object.assign(quote,payload):quote;
 if(table==='leads')data={id:'TESZT-lead',company_id:'TESZT-company',summary:'TESZT ügy'};
 if(table==='companies')data=[{id:'TESZT-company',name:'TESZT ügyfél'}];
 if(table==='users_profile')data=[{auth_user_id:'TESZT-user',full_name:'TESZT Sales',active:true,roles:{name:'sales'}}];
 if(table==='contacts')data=[];
 if(!single&&!Array.isArray(data))data=[data];resolve({data:single&&Array.isArray(data)?data[0]??null:data,error:null});};
 return (...args:any[])=>{if(prop==='maybeSingle'||prop==='single'){single=true;return Promise.resolve({data:table==='quotes'?quote:table==='leads'?{id:'TESZT-lead',company_id:'TESZT-company',summary:'TESZT ügy'}:null,error:null});};if(prop==='update')payload=args[0];return chain;};}});return chain;};
qc.setQueryData(['r2-status'],{configured:true});
qc.setQueryData(['users_profile','me','TESZT-user'],{auth_user_id:'TESZT-user',roles:{name:'sales'}});
qc.setQueryData(['quote-template-defaults','b2b'],{revision:0,terms:{payment:'TESZT alap'}});
(window as any).switchKind=(kind:any)=>{quote.quote_kind=kind;qc.clear();qc.setQueryData(['r2-status'],{configured:true});qc.setQueryData(['users_profile','me','TESZT-user'],{auth_user_id:'TESZT-user',roles:{name:'sales'}});qc.setQueryData(['quote-template-defaults','b2b'],{revision:0,terms:{payment:'TESZT alap'}});render(kind);};
let currentKind='received_budget';const rootRoute=createRootRoute({component:()=> <QuoteWorkflowDetail key={currentKind} id={quote.id}/>});
const router=createRouter({routeTree:rootRoute});
const root=createRoot(document.getElementById('root') as HTMLElement);
function render(kind:string){currentKind=kind;root.render(<QueryClientProvider client={qc}><RouterProvider router={router}/></QueryClientProvider>);router.invalidate();}
render(currentKind);
