import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from 'react';
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Building2, UserPlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/use-permissions";
import { logActivity } from "@/lib/activity-log";
import { decideIntake, normalizeEmail } from "@/lib/web-request-intake";
import type { QuoteRequest } from "@/lib/quote-requests.functions";
import { saveIntakeOnce, type IntakeProgress } from '@/lib/web-request-intake-save';
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
  const progress = useRef(new Map<string, IntakeProgress>());
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
      const entry = progress.current.get(req.id) ?? { companyId: null, started: false };
      progress.current.set(req.id, entry);
      if (entry.started) throw new Error('A korábbi felvételt ellenőrizd a céglistában.');
      const refreshed = await match.refetch();
      if (refreshed.error) throw refreshed.error;
      const d = refreshed.data;
      if (d?.kind !== "create") throw new Error("A felvétel nem engedélyezett ennél az igénynél.");
      setAttemptedIds(ids => [...ids, req.id]);
      return saveIntakeOnce(entry, async () => {
        const { data: co, error: e1 } = await supabase.from("companies")
        .insert({ name: d.companyName, notes: `Weboldali ajánlatkérésből: ${req.id}` })
        .select("id").single();
      if (e1) throw e1;
      return co.id;
      }, async (companyId) => {
      const { error: e2 } = await supabase.from("contacts").insert({
        company_id: companyId, name: d.contactName, email, phone: req.phone?.trim() || null,
      });
      if (e2) throw new Error(`A cég létrejött, de a kapcsolattartó nem mentődött: ${e2.message}`);
      }, async (companyId) => { await logActivity("quote_requests", "create", req.id, { company_id: companyId, intake: "web_request" }); });
    },
    onSuccess: (companyId) => {
      void refreshMarketingWork(qc);
      toast.success("Felvéve a CRM-be", { description: "A céges munkafelületen minősítsd és add át a Sales-nek." });
      navigate({ to: "/customers/$id", params: { id: companyId } });
    },
    onError: (e: Error) => { void refreshMarketingWork(qc); toast.error("Felvétel nem igazolt teljesként", { description: e.message }); },
  });

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
          <p role="alert" className="text-destructive">A felvétel eredményét ellenőrizd; újabb automatikus felvétel tiltott.</p>
          {progress.current.get(req.id)?.companyId ? <Button asChild size="sm" variant="outline"><Link to="/customers/$id" params={{ id: progress.current.get(req.id)?.companyId ?? '' }}>Létrejött cég megnyitása</Link></Button> : <Button asChild size="sm" variant="outline"><Link to="/customers">Céglista megnyitása</Link></Button>}
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
