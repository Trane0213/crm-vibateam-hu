import {useState} from 'react';
import {useMutation,useQueryClient} from '@tanstack/react-query';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter,DialogTrigger} from '@/components/ui/dialog';
import {RecordCombobox} from '@/components/resource/record-combobox';
import {saveThreadCompany} from '@/lib/gmail/thread-link.functions';
import {toast} from 'sonner';
export function EmailThreadCompanyPicker({threadId,companyId}:{threadId:string;companyId:string|null}) {
  const [open,setOpen]=useState(false),[selected,setSelected]=useState('');
  const qc=useQueryClient();
  const mutation=useMutation({mutationFn:()=>saveThreadCompany({data:{threadId,companyId:selected,oldCompanyId:companyId}}),onSuccess:()=>{for(const key of ['email_threads','email_thread_crm','emails','mkt-home'])qc.invalidateQueries({queryKey:[key]});setOpen(false);toast.success('A szál cégkapcsolata mentve.');},onError:(e)=>toast.error(e.message)});
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button size="sm" variant="outline">Cégkapcsolat ellenőrzése</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Levélszál cégkapcsolata</DialogTitle><DialogDescription>A kijelölt céget ellenőrizd mentés előtt. Csak a szál kapcsolata változik, a korábbi levelek és postafiók-hozzáférések nem.</DialogDescription></DialogHeader><RecordCombobox source="companies" value={selected||companyId} onChange={setSelected} label="Cég"/><DialogFooter><Button disabled={!selected||mutation.isPending} onClick={()=>mutation.mutate()}>Ellenőriztem, hozzárendelés</Button></DialogFooter></DialogContent></Dialog>;
}