import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { humanizeSupabaseError } from "@/lib/db-hooks";
import { applyTemplateDefaults, hasDraftTerms, isTemplateKey, QUOTE_TEMPLATES, type TemplateKey } from "@/lib/quotes/templates";
import { getQuoteTemplateDefaults } from "@/lib/quotes/template-defaults.functions";
import { usePermissions } from "@/hooks/use-permissions";
import { QuoteTemplateDefaultsEditor } from "./quote-template-defaults-editor";
import { QuotePrintDocument } from "./quote-print-document";

type Props = { quote: { id: string; locked_at?: string | null; template_key?: string | null; template_version?: number | null; template_terms?: Record<string, string> | null; site_address?: string | null }; headerDraft?: Record<string, unknown> };

/** S6: sablonválasztás és ajánlatonként szerkeszthető feltételek. */
export function QuoteTemplatePanel({ quote, headerDraft }: Props) {
  const qc = useQueryClient();
  const { role } = usePermissions();
  const getDefaults = useServerFn(getQuoteTemplateDefaults);
  const locked = !!quote.locked_at;
  const [key, setKey] = useState<TemplateKey | "">(isTemplateKey(quote.template_key) ? quote.template_key : "");
  const [terms, setTerms] = useState<Record<string, string>>(quote.template_terms ?? {});
  const [site, setSite] = useState(quote.site_address ?? "");
  useEffect(() => {
    setKey(isTemplateKey(quote.template_key) ? quote.template_key : "");
    setTerms(quote.template_terms ?? {}); setSite(quote.site_address ?? "");
  }, [quote.id, quote.template_key, quote.template_version, JSON.stringify(quote.template_terms), quote.site_address]);

  const tpl = key ? QUOTE_TEMPLATES[key] : null;
  const defaults = useQuery({
    queryKey: ["quote-template-defaults", key],
    enabled: !!key && ["owner", "sales", "project_manager"].includes(role ?? ""),
    queryFn: () => {
      if (!key) throw new Error("Válassz sablont.");
      return getDefaults({ data: { key } });
    },
    staleTime: 60_000,
  });
  const save = useMutation({
    mutationFn: async () => {
      if (!tpl) throw new Error("Válassz sablont.");
      if (locked) throw new Error("Kiküldött ajánlat nem módosítható.");
      const { data, error } = await supabase.from("quotes").update({
        template_key: tpl.key, template_version: quote.template_key === tpl.key ? (quote.template_version ?? tpl.version) : tpl.version,
        template_terms: terms, site_address: site.trim() || null,
      } as any).eq("id", quote.id).select("id");
      if (error) throw error;
      if (!data || data.length !== 1) throw new Error("Az ajánlat nem módosítható (nincs jogosultság).");
    },
    onSuccess: () => { toast.success("Sablon és feltételek mentve"); qc.invalidateQueries({ queryKey: ["quotes"] }); },
    onError: (e) => toast.error(humanizeSupabaseError(e)),
  });

  return (
    <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(280px,1fr)_minmax(0,1.4fr)]">
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold">VIBA-sablon és feltételek</h2>
        {quote.template_key && isTemplateKey(quote.template_key) && (
          <Badge variant="outline">{QUOTE_TEMPLATES[quote.template_key].label} · sablon v{quote.template_version ?? "?"}</Badge>
        )}
        {hasDraftTerms(terms) && <Badge variant="destructive">jóváhagyatlan tervezetszöveg</Badge>}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1.5">
          <Label>Sablon</Label>
          <Select value={key} onValueChange={(v) => setKey(v as TemplateKey)} disabled={locked}>
            <SelectTrigger className="w-full max-w-64"><SelectValue placeholder="Válassz sablont" /></SelectTrigger>
            <SelectContent>
              {Object.values(QUOTE_TEMPLATES).map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" variant="outline" className="h-auto whitespace-normal text-left" disabled={!tpl || locked || !defaults.data || defaults.isFetching} onClick={() => tpl && defaults.data && setTerms(applyTemplateDefaults(tpl.key, terms, defaults.data.terms))}>
          Üres feltételek kitöltése a sablonból
        </Button>
      </div>
      {defaults.error && <p role="alert" className="text-sm text-destructive">A sablonalap nem tölthető be. <Button variant="link" size="sm" onClick={() => defaults.refetch()}>Újra</Button></p>}
      {tpl && <p className="text-xs text-muted-foreground">{tpl.audience}. A sablon csak az üres mezőket tölti ki; minden feltétel ajánlatonként módosítható.</p>}
      {tpl && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="qt-site">{tpl.key === "b2b" ? "Projektazonosítás / helyszín" : "Helyszín"}</Label>
            <Input id="qt-site" value={site} maxLength={500} disabled={locked} onChange={(e) => setSite(e.target.value)} />
          </div>
          {tpl.sections.map((s) => (
            <div key={s.key} className="grid gap-1.5">
              <Label htmlFor={`qt-${s.key}`}>{s.label}</Label>
              <Textarea id={`qt-${s.key}`} rows={3} maxLength={4000} disabled={locked}
                value={terms[s.key] ?? ""} onChange={(e) => setTerms((t) => ({ ...t, [s.key]: e.target.value }))} />
            </div>
          ))}
        </div>
      )}
      <Button size="sm" disabled={!tpl || locked || save.isPending} onClick={() => save.mutate()}>Sablon és feltételek mentése</Button>
      {locked && <p className="text-xs text-muted-foreground">Kiküldött verzió — módosításhoz új verziót készíts.</p>}
      {role === "owner" && key && defaults.data && <QuoteTemplateDefaultsEditor key={key} templateKey={key} defaults={defaults.data} />}
    </div>
    <div className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm font-semibold">A4-előnézet <Badge variant="outline">{locked ? "Mentett, zárolt ajánlat" : "Szerkesztés alatt"}</Badge></div>
      <div className="max-h-[80vh] overflow-auto border bg-muted" aria-label="Élő A4-ajánlatelőnézet">
        <QuotePrintDocument id={quote.id} preview draft={locked ? undefined : { ...headerDraft, template_key: key || null, template_terms: terms, site_address: site }} />
      </div>
    </div>
    </div>
  );
}
