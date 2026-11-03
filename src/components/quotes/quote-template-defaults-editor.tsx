import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { QUOTE_TEMPLATES, type TemplateKey } from "@/lib/quotes/templates";
import { saveQuoteTemplateDefaults } from "@/lib/quotes/template-defaults.functions";

export function QuoteTemplateDefaultsEditor({ templateKey, defaults }: { templateKey: TemplateKey; defaults: { revision: number; terms: Record<string, string> } }) {
  const [terms, setTerms] = useState(defaults.terms);
  const qc = useQueryClient();
  const saveFn = useServerFn(saveQuoteTemplateDefaults);
  useEffect(() => setTerms(defaults.terms), [templateKey, defaults.revision]);
  const save = useMutation({
    mutationFn: () => saveFn({ data: { key: templateKey, expectedRevision: defaults.revision, terms } }),
    onSuccess: () => {
      toast.success("Általános sablonalap mentve");
      qc.invalidateQueries({ queryKey: ["quote-template-defaults", templateKey] });
    },
    onError: (error) => toast.error(error.message),
  });
  return <details className="border-t pt-4">
    <summary className="cursor-pointer text-sm font-semibold">Általános sablonalap · tulajdonos</summary>
    <div className="mt-4 grid gap-3">
      {QUOTE_TEMPLATES[templateKey].sections.map((s) => <div key={s.key} className="grid gap-1.5">
        <Label htmlFor={`default-${s.key}`}>{s.label}</Label>
        <Textarea id={`default-${s.key}`} maxLength={4000} rows={3} value={terms[s.key] ?? ""} onChange={(e) => setTerms((old) => ({ ...old, [s.key]: e.target.value }))} />
      </div>)}
      <Button variant="outline" disabled={save.isPending} onClick={() => save.mutate()}>Általános sablonalap mentése</Button>
    </div>
  </details>;
}