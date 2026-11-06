import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Building2, UserPlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/use-permissions";
import { decideIntake, normalizeEmail } from "@/lib/web-request-intake";
import type { QuoteRequest } from "@/lib/quote-requests.functions";
import { createWebsiteIntake, readWebsiteIntake } from '@/lib/web-request-intake.functions';
import { refreshMarketingWork } from '@/lib/marketing-refresh';

const esc = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Weboldali igény minősítése: meglévő cég megnyitása vagy cég+kontakt felvétele.
 * Leadet NEM hoz létre — a Sales-átadás a meglévő céges marketing munkafelületen marad.
 */
export function WebRequestIntakeCard({ req, isTest }: { req: QuoteRequest; isTest: boolean }) {
  const { role } = usePermissions();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const saveFn=useServerFn(createWebsiteIntake);
  const checkFn=useServerFn(readWebsiteIntake);
  const [savedCompany, setSavedCompany]=useState<Record<string,string>>({});
  const [attemptedIds, setAttemptedIds] = useState<string[]>([]);
  const email = normalizeEmail(req.email);
  const companyBase = (req.company_name ?? "").trim() || (req.name ?? "").trim();

  const match = useQuery({
    queryKey: ["web-request-intake", req.id, email, companyBase],
    queryFn: async () => {
      const contacts = email
        ? await supabase.from("contacts").select("id,company_id").ilike("email", esc(email)).limit(20)
        : { data: [], error: null };
      if (contacts.error) throw contacts.error;
      const companies = companyBase
        ? await supabase.from("companies").select("id").ilike("name", esc(companyBase)).limit(5)
        : { data: [], error: null };
      if (companies.error) throw companies.error;
      return decideIntake({
        name: req.name, company_name: req.company_name, email: req.email, isTest,
        contactMatches: contacts.data ?? [], companyNameMatches: companies.data ?? [],
      });
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      setAttemptedIds(ids => [...ids, req.id]);
      return saveFn({data:{id:req.id}});
    },
    onSuccess: (result) => {
      void refreshMarketingWork(qc);
      if(result.kind !== 'saved' && result.kind !== 'existing') { toast.error('Felvétel nem igazolt teljesként',{description:result.reason}); return; }
      setSavedCompany(rows=>({...rows,[req.id]:result.companyId}));
      toast.success(result.kind==='saved'?'Felvéve a CRM-be':'Meglévő cég ellenőrizve');
      navigate({ to: "/customers/$id", params: { id: result.companyId } });
    },
    onError: (e: Error) => { void refreshMarketingWork(qc); toast.error("Felvétel nem igazolt teljesként", { description: e.message }); },
  });
  const check=useMutation({mutationFn:()=>checkFn({data:{id:req.id}}),onSuccess:(result)=>{
    if(result.kind==='saved' || result.kind==='existing') {setSavedCompany(rows=>({...rows,[req.id]:result.companyId}));toast.success('Mentett felvétel ellenőrizve');}
    else toast.error('Eredmény nem igazolt',{description:result.reason});
    void refreshMarketingWork(qc);
  },onError:(e:Error)=>toast.error('Ellenőrzés sikertelen',{description:e.message})});

  if (role !== "marketing" && role !== "owner") return null;
  const d = match.data;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Minősítés és átadás</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Az igényből nem lesz automatikusan lead. Vedd fel cégként, majd a céges munkafelületen add át a Sales-nek.
        </p>
        {attemptedIds.includes(req.id) && !create.isPending ? <div className="space-y-2">
          <p role="alert" className="text-muted-foreground">A felvétel eredményét ellenőrizd; újabb automatikus felvétel tiltott.</p>
          <Button size="sm" variant="outline" disabled={check.isPending} onClick={()=>check.mutate()}>Mentett eredmény ellenőrzése</Button>
          {savedCompany[req.id] ? <Button asChild size="sm" variant="outline"><Link to="/customers/$id" params={{ id: savedCompany[req.id] ?? '' }}>Létrejött cég megnyitása</Link></Button> : <Button asChild size="sm" variant="outline"><Link to="/customers">Céglista megnyitása</Link></Button>}
        </div> : match.isLoading ? <p className="text-muted-foreground">Egyezés keresése…</p>
          : match.error ? <p className="text-destructive">{(match.error as Error).message}</p>
          : d?.kind === "existing" ? (
            <Button asChild size="sm" variant="outline">
              <Link to="/customers/$id" params={{ id: d.companyId }}><Building2 className="mr-1.5 h-4 w-4" />Már a CRM-ben — cég megnyitása</Link>
            </Button>
          ) : d?.kind === "create" ? (
            <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending}>
              <UserPlus className="mr-1.5 h-4 w-4" />Felvétel a CRM-be: „{d.companyName}”
            </Button>
          ) : d ? <p className="text-destructive">{d.reason}</p> : null}
      </CardContent>
    </Card>
  );
}
