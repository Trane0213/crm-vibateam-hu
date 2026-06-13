import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, AlertCircle, Sparkles, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";

type Company = {
  id: string;
  name: string;
  company_type?: string | null;
  website?: string | null;
  domain?: string | null;
  tax_number?: string | null;
  city?: string | null;
  notes?: string | null;
};
type Contact = { id: string; email?: string | null; phone?: string | null; name?: string | null };
type Lead = { id: string; summary?: string | null; notes?: string | null };

/** Egyszerű domain-kinyerés emailből vagy URL-ből. */
function extractDomain(input?: string | null): string | null {
  if (!input) return null;
  const s = String(input).trim().toLowerCase();
  if (!s) return null;
  const at = s.includes("@") ? s.split("@")[1] : s;
  const clean = at
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split("?")[0];
  if (!clean.includes(".")) return null;
  // szűrjük a publikus szolgáltatókat (azokból nem következik céges domain)
  const PUBLIC = new Set(["gmail.com", "googlemail.com", "yahoo.com", "hotmail.com", "outlook.com", "live.com", "icloud.com", "freemail.hu", "citromail.hu", "vipmail.hu", "indamail.hu"]);
  if (PUBLIC.has(clean)) return null;
  return clean;
}

type Suggestion = {
  key: string;
  label: string;
  source: string;
  value: string;
  patch: Record<string, any>;
};

export function CompanyHealthPanel({
  company,
  contacts,
  leads,
}: {
  company: Company;
  contacts: Contact[];
  leads: Lead[];
}) {
  const qc = useQueryClient();
  const isPersonal = company.company_type === "maganszemely";

  // 1. Adatminőség pontozás
  const checks = useMemo(() => {
    const hasContact = contacts.length > 0;
    const hasEmail   = contacts.some((c) => !!c.email);
    const hasPhone   = contacts.some((c) => !!c.phone);
    const items: { key: string; label: string; ok: boolean; required: boolean }[] = [
      { key: "website",   label: "Weboldal",            ok: !!company.website,     required: !isPersonal },
      { key: "domain",    label: "Email domain",        ok: !!company.domain,      required: !isPersonal },
      { key: "tax",       label: "Adószám",             ok: !!company.tax_number,  required: !isPersonal },
      { key: "city",      label: "Település",           ok: !!company.city,        required: true },
      { key: "contact",   label: "Kapcsolattartó",      ok: hasContact,            required: true },
      { key: "email",     label: "Kapcsolattartó email",ok: hasEmail,              required: true },
      { key: "phone",     label: "Kapcsolattartó telefon", ok: hasPhone,           required: true },
    ].filter((x) => x.required);
    const ok = items.filter((i) => i.ok).length;
    const pct = items.length === 0 ? 100 : Math.round((ok / items.length) * 100);
    return { items, pct };
  }, [company, contacts, isPersonal]);

  // 2. Automatikus javaslatok más rekordok alapján
  const suggestions = useMemo<Suggestion[]>(() => {
    const out: Suggestion[] = [];
    const contactEmail = contacts.find((c) => !!c.email)?.email ?? null;
    const emailDomain = extractDomain(contactEmail);
    const websiteDomain = extractDomain(company.website);

    // Domain
    if (!company.domain) {
      const d = websiteDomain ?? emailDomain;
      if (d) {
        out.push({
          key: "domain",
          label: "Email domain kitöltése",
          source: websiteDomain ? `weboldal (${company.website})` : `kapcsolattartó email (${contactEmail})`,
          value: d,
          patch: { domain: d },
        });
      }
    }
    // Website
    if (!company.website) {
      const d = company.domain ?? emailDomain;
      if (d) {
        out.push({
          key: "website",
          label: "Weboldal kitöltése",
          source: company.domain ? `meglévő domain (${company.domain})` : `kapcsolattartó email (${contactEmail})`,
          value: `https://${d}`,
          patch: { website: `https://${d}` },
        });
      }
    }
    // Város – leadek/jegyzetek között keressünk "Település: X" mintát (Scarlet jegyzet formátum)
    if (!company.city) {
      const allText = [company.notes ?? "", ...leads.map((l) => `${l.summary ?? ""}\n${l.notes ?? ""}`)].join("\n");
      const m = allText.match(/Telep[üu]l[ée]s:\s*([^\n,;]+)/i);
      if (m?.[1]) {
        const city = m[1].trim();
        out.push({
          key: "city",
          label: "Település kitöltése",
          source: "lead jegyzet",
          value: city,
          patch: { city },
        });
      }
    }
    return out;
  }, [company, contacts, leads]);

  const apply = useMutation({
    mutationFn: async (s: Suggestion) => {
      const { error } = await supabase.from("companies").update(s.patch).eq("id", company.id);
      if (error) throw error;
    },
    onSuccess: (_d, s) => {
      toast.success(`${s.label} sikeresen alkalmazva`);
      qc.invalidateQueries({ queryKey: ["customers", "detail", company.id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Nem sikerült alkalmazni a javaslatot"),
  });
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const tone = checks.pct >= 80 ? "success" : checks.pct >= 50 ? "warning" : "danger";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between gap-2">
          <span>Adatminőség</span>
          <Badge variant={tone === "success" ? "default" : tone === "warning" ? "secondary" : "destructive"}>
            {checks.pct}%
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <Progress value={checks.pct} className="h-2" />

        <ul className="space-y-1.5">
          {checks.items.map((it) => (
            <li key={it.key} className="flex items-center gap-2">
              {it.ok ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <AlertCircle className="h-4 w-4 text-amber-600" />
              )}
              <span className={it.ok ? "text-foreground" : "text-muted-foreground"}>{it.label}</span>
              {!it.ok && <span className="ml-auto text-xs text-muted-foreground">hiányzik</span>}
            </li>
          ))}
        </ul>

        {suggestions.length > 0 && (
          <div className="border-t pt-3 space-y-2">
            <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              Automatikus javaslatok
            </div>
            {suggestions.map((s) => (
              <div key={s.key} className="flex items-start gap-2 rounded-md border bg-muted/40 p-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{s.label}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    Javasolt érték: <span className="font-mono">{s.value}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">Forrás: {s.source}</div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={apply.isPending && pendingKey === s.key}
                  onClick={() => {
                    setPendingKey(s.key);
                    apply.mutate(s);
                  }}
                >
                  {apply.isPending && pendingKey === s.key ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    "Alkalmaz"
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}

        {suggestions.length === 0 && checks.pct < 100 && (
          <div className="text-xs text-muted-foreground border-t pt-3">
            Nincs automatikusan kitölthető mező – a hiányzó adatokat kézzel kell pótolni.
          </div>
        )}
      </CardContent>
    </Card>
  );
}