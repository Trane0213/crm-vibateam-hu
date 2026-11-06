import type {SupabaseClient} from '@supabase/supabase-js';
import {validateCrmLink} from './gmail/validate-crm-link';
export async function prepareCompanyCall<T extends Record<string,any>>(sb:SupabaseClient,values:T) {
  const link=await validateCrmLink(sb,values);
  if(values.outcome==='callback'&&(!values.callback_date||!Number.isFinite(Date.parse(values.callback_date))))throw new Error('A visszahívás teljes időpontja kötelező.');
  return {...values,company_id:link.company_id};
}