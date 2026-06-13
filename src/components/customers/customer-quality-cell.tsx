import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { computeCompanyScore, type CompanyScore } from "@/lib/dedupe/scoring";
import { scanCompanyDuplicatePairs } from "@/lib/dedupe/global-scans";

/**
 * Cég-soros adatminőség + duplikátum badge a /customers listához.
 * Egyszer kérdezzük le a contacts + duplicate-párok adatait (React Query cache),
 * és minden sor abból olvas.
 */
function useCompanyQualityMap() {
  const scores = useQuery({
    queryKey: ["customers", "list", "quality-map"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [{ data: companies }, { data: contacts }] = await Promise.all([
        supabase.from("companies").select("id,name,company_type,website,domain,tax_number,city"),
        supabase.from("contacts").select("company_id,email,phone"),
      ]);
      const byCompany = new Map<string, { email?: string | null; phone?: string | null }[]>();
      for (const k of contacts ?? []) {
        if (!k.company_id) continue;
        const arr = byCompany.get(k.company_id) ?? [];
        arr.push({ email: k.email, phone: k.phone });
        byCompany.set(k.company_id, arr);
      }
      const map = new Map<string, CompanyScore>();
      for (const c of companies ?? []) {
        map.set(c.id, computeCompanyScore(c as any, byCompany.get(c.id) ?? []));
      }
      return map;
    },
  });
  return scores;
}

function useDuplicateMap() {
  return useQuery({
    queryKey: ["customers", "list", "dup-map"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const pairs = await scanCompanyDuplicatePairs();
      const m = new Map<string, number>();
      for (const p of pairs) {
        m.set(p.a.id, (m.get(p.a.id) ?? 0) + 1);
        m.set(p.b.id, (m.get(p.b.id) ?? 0) + 1);
      }
      return m;
    },
  });
}

export function CompanyQualityCell({ companyId }: { companyId: string }) {
  const q = useCompanyQualityMap();
  const score = q.data?.get(companyId);
  if (q.isLoading) return <span className="text-xs text-muted-foreground">…</span>;
  if (!score) return <span className="text-xs text-muted-foreground">—</span>;
  const dot = score.band === "green" ? "🟢" : score.band === "yellow" ? "🟡" : "🔴";
  return (
    <div className="flex items-center gap-2 w-[160px]">
      <span className="text-xs">{dot}</span>
      <Progress value={score.pct} className="h-1.5 flex-1" />
      <span className="tabular-nums text-xs text-muted-foreground w-8 text-right">{score.pct}%</span>
    </div>
  );
}

export function CompanyDuplicateCell({ companyId }: { companyId: string }) {
  const q = useDuplicateMap();
  const n = q.data?.get(companyId) ?? 0;
  if (n === 0) return <span className="text-xs text-muted-foreground">0</span>;
  return (
    <Link to="/data-quality" className="inline-flex">
      <Badge variant="outline" className="gap-1 border-amber-400 text-amber-700 hover:bg-amber-50">
        <Copy className="h-3 w-3" /> {n}
      </Badge>
    </Link>
  );
}