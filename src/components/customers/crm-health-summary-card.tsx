import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Copy,
  Fingerprint,
  Mail,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { computeCompanyScore } from "@/lib/dedupe/scoring";
import { findCompanyDuplicates, findContactConflicts } from "@/lib/dedupe/detect";
import { resolveCompanyIdentity } from "@/lib/dedupe/company-identity";

const ACTIVE_LEAD_STATUSES = new Set([
  "new", "contacted", "quote_prep", "quote_sent", "follow_up", "contract",
]);

type Company = {
  id: string;
  name: string;
  company_type?: string | null;
  website?: string | null;
  tax_number?: string | null;
};

type Contact = { id: string; email?: string | null; phone?: string | null; name?: string | null };
type Lead = { id: string; status?: string | null };
type Thread = { id: string };

export function CrmHealthSummaryCard({
  company,
  contacts,
  leads,
  threads,
}: {
  company: Company;
  contacts: Contact[];
  leads: Lead[];
  threads: Thread[];
}) {
  const score = computeCompanyScore(company, contacts);
  const activeLeads = leads.filter((lead) => ACTIVE_LEAD_STATUSES.has(lead.status ?? "")).length;

  const duplicates = useQuery({
    queryKey: ["company", company.id, "duplicates"],
    queryFn: () => findCompanyDuplicates(company.id),
    staleTime: 60_000,
  });

  const conflicts = useQuery({
    queryKey: ["company", company.id, "contact-conflicts"],
    queryFn: () => findContactConflicts(company.id),
    staleTime: 60_000,
  });

  const identity = useQuery({
    queryKey: ["customers", "detail", company.id, "identity"],
    queryFn: () => resolveCompanyIdentity(company.id),
    staleTime: 60_000,
  });

  return (
    <Card className="mt-3">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Activity className="h-4 w-4 text-primary" />
          CRM Egészség
          <Badge variant="outline" className="ml-auto">
            központi összesítő
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
          <MetricTile icon={ShieldCheck} label="Adatminőség" value={`${score.pct}%`} tone={score.band === "green" ? "success" : score.band === "yellow" ? "warning" : "danger"} />
          <MetricTile icon={Fingerprint} label="Identity Strength" value={identity.data ? `${identity.data.identityStrength}/100` : "—"} />
          <MetricTile icon={Users} label="Kapcsolattartók" value={String(contacts.length)} />
          <MetricTile icon={Sparkles} label="Aktív leadek" value={String(activeLeads)} tone={activeLeads > 0 ? "warning" : undefined} />
          <MetricTile icon={Mail} label="Email threadek" value={String(threads.length)} />
          <MetricTile icon={AlertTriangle} label="Konfliktusok" value={String(conflicts.data?.length ?? 0)} tone={(conflicts.data?.length ?? 0) > 0 ? "danger" : undefined} />
          <MetricTile icon={Copy} label="Duplikációk" value={String(duplicates.data?.length ?? 0)} tone={(duplicates.data?.length ?? 0) > 0 ? "warning" : undefined} />
        </div>
      </CardContent>
    </Card>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone?: "warning" | "danger" | "success";
}) {
  const toneClass =
    tone === "danger"
      ? "text-destructive"
      : tone === "warning"
        ? "text-amber-700"
        : tone === "success"
          ? "text-emerald-700"
          : "text-foreground";

  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${toneClass}`}>{value}</div>
    </div>
  );
}