import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatHuf } from "@/lib/format";
import printLogo from "@/assets/viba-team-logo-print.png.asset.json";
import { hasDraftTerms, isTemplateKey, QUOTE_TEMPLATES } from "@/lib/quotes/templates";

/**
 * Ajánlat nyomtatható HTML nézet — böngésző natív "Print / Save as PDF"
 * használatra. Nem külső PDF könyvtár, hanem @media print CSS-el
 * tisztított layout. Külön ablakban nyílik a detail oldalról.
 *
 * URL: /quotes/$id/print (a `$id_` szegmens miatt nem gyereke a
 * `quotes.$id.tsx` route-nak — teljes képernyős, sidebar-mentes render).
 */
export const Route = createFileRoute("/_authenticated/quotes/$id_/print")({
  component: QuotePrint,
});

type QuoteRow = Record<string, any>;
type ItemRow = Record<string, any>;

function QuotePrint() {
  const { id } = Route.useParams();

  const q = useQuery({
    queryKey: ["quotes", "print", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("quotes").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as QuoteRow | null;
    },
  });

  const items = useQuery({
    queryKey: ["quotes", "print", id, "items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quote_items")
        .select("*")
        .eq("quote_id", id)
        .order("created_at", { ascending: true });
      if (error) throw error; // hibás tétel-lekérés ne tűnjön üres ajánlatnak
      return (data ?? []) as ItemRow[];
    },
  });

  // Projektből indított, lead nélküli ajánlatnál a projekt leadjét / cégét használjuk.
  const projectId = q.data?.project_id ?? null;
  const project = useQuery({
    queryKey: ["quotes", "print", id, "project", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects").select("id, lead_id, company_id").eq("id", projectId!).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const leadId = q.data?.lead_id ?? project.data?.lead_id ?? null;
  const lead = useQuery({
    queryKey: ["quotes", "print", id, "lead", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, company_id, contact_id, summary")
        .eq("id", leadId!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const companyId = lead.data?.company_id ?? project.data?.company_id ?? null;
  const company = useQuery({
    queryKey: ["quotes", "print", id, "company", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("id", companyId!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const contactId = lead.data?.contact_id ?? null;
  const contact = useQuery({
    queryKey: ["quotes", "print", id, "contact", contactId],
    enabled: !!contactId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("*")
        .eq("id", contactId!)
        .maybeSingle();
      if (error) return null;
      return data as any;
    },
  });

  // Auto-focus print címzés kényelemért — az adatok betöltése után egyszer.
  const ready = !q.isLoading && !items.isLoading;
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      try {
        document.title = `Ajánlat ${q.data?.title || ""}`.trim();
      } catch {}
    }, 50);
    return () => clearTimeout(t);
  }, [ready, q.data?.title]);

  if (q.isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Betöltés…</div>;
  }
  if (q.error || !q.data) {
    return <div className="p-8 text-sm text-destructive">Az ajánlat nem található, vagy nincs hozzá jogosultságod.</div>;
  }
  if (items.error) {
    return <div className="p-8 text-sm text-destructive">Az ajánlat tételei nem tölthetők be — nyomtatás nem lehetséges. Próbáld újra.</div>;
  }

  const quote = q.data;
  const rows = items.data ?? [];
  const subtotal = rows.reduce(
    (acc, r) => acc + (Number(r.quantity) || 0) * (Number(r.unit_price) || 0),
    0,
  );
  const discountPct = Number(quote.discount_percent) || 0;
  const taxPct = quote.tax_percent == null ? 27 : Number(quote.tax_percent) || 0;
  const discountAmt = Math.round((subtotal * discountPct) / 100);
  const manualNet = rows.length === 0 && quote.manual_net_amount != null ? Number(quote.manual_net_amount) : null;
  const noAmount = rows.length === 0 && manualNet == null; // S8: tétel és kézi összeg nélkül nem 0 Ft
  const net = manualNet ?? subtotal - discountAmt;
  const taxAmt = Math.round((net * taxPct) / 100);
  const gross = net + taxAmt;

  const companyLine = [company.data?.name, company.data?.address]
    .filter(Boolean)
    .join(" · ");
  const contactLine = [contact.data?.name, contact.data?.email, contact.data?.phone]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .print-page { box-shadow: none !important; margin: 0 !important; }
        }
        @page { size: A4; margin: 18mm 16mm; }
      `}</style>
      <div className="min-h-screen bg-neutral-100 py-8 text-neutral-900">
        <div className="no-print mx-auto mb-4 flex max-w-3xl items-center justify-between px-6">
          <div className="text-sm text-neutral-500">Nyomtatható nézet · böngésző Print → PDF</div>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-4 w-4" /> Nyomtatás
          </Button>
        </div>

        <div className="print-page mx-auto max-w-3xl bg-white p-10 shadow-sm">
          {/* Fejléc */}
          <div className="flex items-start justify-between border-b pb-6">
            <div>
              <img src={printLogo.url} alt="VIBA-TEAM Kft – Villamos kivitelezés" className="h-16 w-auto" />
              {isTemplateKey(quote.template_key) && (
                <div className="mt-2 text-[11px] uppercase tracking-wider text-neutral-500">{QUOTE_TEMPLATES[quote.template_key].label}</div>
              )}
            </div>
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-wider text-neutral-500">Ajánlat</div>
              <div className="mt-1 text-2xl font-semibold">
                {quote.title?.trim() ||
                  (quote.version != null ? `v${quote.version}` : `#${String(quote.id).slice(0, 8)}`)}
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                {quote.version != null && <>v{quote.version} · </>}
                Kiállítva: {formatDate(quote.created_at)}
                {quote.valid_until && (
                  <>
                    <br />Érvényes: {formatDate(quote.valid_until)}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Címzett */}
          <div className="mt-6 grid grid-cols-2 gap-6 text-sm">
            <div>
              <div className="mb-1 text-[11px] uppercase tracking-wider text-neutral-500">Ügyfél</div>
              <div className="font-medium">{company.data?.name ?? "—"}</div>
              {companyLine && company.data?.address && (
                <div className="mt-0.5 text-xs text-neutral-600">{company.data?.address}</div>
              )}
              {contactLine && <div className="mt-1 text-xs text-neutral-600">{contactLine}</div>}
            </div>
            <div>
              <div className="mb-1 text-[11px] uppercase tracking-wider text-neutral-500">Tárgy</div>
              <div className="text-sm">
                {lead.data?.summary ?? quote.title ?? "—"}
              </div>
            </div>
          </div>

          {/* Tételek */}
          <div className="mt-8">
            <div className="mb-2 text-[11px] uppercase tracking-wider text-neutral-500">Tételek</div>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-neutral-500">
                  <th className="py-2 pr-2 font-medium">Megnevezés</th>
                  <th className="py-2 px-2 text-right font-medium">Menny.</th>
                  <th className="py-2 px-2 font-medium">Egység</th>
                  <th className="py-2 px-2 text-right font-medium">Egységár</th>
                  <th className="py-2 pl-2 text-right font-medium">Összeg</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-xs text-neutral-400">
                      Nincs tétel az ajánlaton.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const total = (Number(r.quantity) || 0) * (Number(r.unit_price) || 0);
                    return (
                      <tr key={r.id} className="border-b border-neutral-100 align-top">
                        <td className="py-2 pr-2">{r.name ?? "—"}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{r.quantity ?? "—"}</td>
                        <td className="py-2 px-2">{r.unit ?? "—"}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{formatHuf(r.unit_price)}</td>
                        <td className="py-2 pl-2 text-right tabular-nums">{formatHuf(total)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Összesítő */}
          {noAmount ? (
            <div className="mt-6 text-right text-sm text-neutral-500">Ajánlati összeg: nincs megadva</div>
          ) : (
          <div className="mt-6 flex justify-end">
            <div className="w-full max-w-xs text-sm">
              <div className="flex justify-between py-1 text-neutral-600">
                <span>Részösszeg</span>
                <span className="tabular-nums">{formatHuf(subtotal)}</span>
              </div>
              {discountPct > 0 && (
                <div className="flex justify-between py-1 text-neutral-600">
                  <span>Kedvezmény ({discountPct}%)</span>
                  <span className="tabular-nums">− {formatHuf(discountAmt)}</span>
                </div>
              )}
              <div className="flex justify-between border-t py-1 pt-2 text-neutral-600">
                <span>Nettó</span>
                <span className="tabular-nums">{formatHuf(net)}</span>
              </div>
              <div className="flex justify-between py-1 text-neutral-600">
                <span>ÁFA ({taxPct}%)</span>
                <span className="tabular-nums">{formatHuf(taxAmt)}</span>
              </div>
              <div className="mt-1 flex justify-between border-t pt-2 text-base font-semibold">
                <span>Bruttó összesen</span>
                <span className="tabular-nums">{formatHuf(gross)}</span>
              </div>
            </div>
          </div>
          )}

          {/* S6: VIBA-sablon szakaszai */}
          {(() => {
            const tk = isTemplateKey(quote.template_key) ? quote.template_key : null;
            const terms = (quote.template_terms ?? {}) as Record<string, string>;
            const blocks: { label: string; text: string }[] = [
              { label: tk === "b2b" ? "Projekt / helyszín" : "Helyszín", text: quote.site_address ?? "" },
              { label: "Vállalt műszaki tartalom", text: quote.technical_scope ?? "" },
              { label: tk === "b2b" ? "Munkahatárok és kizárások" : "Kizárások", text: quote.exclusions ?? "" },
              ...(tk ? QUOTE_TEMPLATES[tk].sections.map((s) => ({ label: s.label, text: terms[s.key] ?? "" })) : []),
            ].filter((b) => b.text.trim());
            if (!blocks.length) return null;
            return (
              <div className="mt-8 space-y-4 border-t pt-4">
                {tk && hasDraftTerms(terms) && (
                  <div className="no-print rounded border border-red-300 bg-red-50 p-2 text-xs text-red-700">
                    Az ajánlat jóváhagyatlan [TERVEZET] feltételszöveget tartalmaz — kiküldés előtt véglegesítsd.
                  </div>
                )}
                {blocks.map((b) => (
                  <div key={b.label}>
                    <div className="mb-1 text-[11px] uppercase tracking-wider text-neutral-500">{b.label}</div>
                    <div className="whitespace-pre-wrap text-sm text-neutral-700">{b.text}</div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Megjegyzés */}
          {quote.notes && (
            <div className="mt-8 border-t pt-4">
              <div className="mb-1 text-[11px] uppercase tracking-wider text-neutral-500">Megjegyzés</div>
              <div className="whitespace-pre-wrap text-sm text-neutral-700">{quote.notes}</div>
            </div>
          )}

          <div className="mt-10 text-[10px] text-neutral-400">
            Ajánlat azonosító: {quote.id}
          </div>
        </div>
      </div>
    </>
  );
}