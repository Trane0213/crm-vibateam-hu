import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/use-permissions";
import { quoteSendReadiness } from "@/lib/sales/sales-flow";
import { ReadinessList } from "@/components/sales/sales-flow-ui";

/**
 * Kiküldés előtti ellenőrzés a MENTETT ajánlat alapján. Csak tájékoztat:
 * a kiküldést nem tiltja és nem engedélyezi — a meglévő küldési út
 * (/api/gmail/send, send-policy) szabályai változatlanok.
 */
export function QuoteReadinessCard({
  quote, companyId, net, mismatch, itemCount, dirty,
}: {
  quote: { id: string; quote_kind?: string | null; title: string | null; contact_id?: string | null; valid_until?: string | null; locked_at?: string | null; lead_id: string | null };
  companyId: string | null;
  net: number | null;
  mismatch: boolean;
  itemCount: number;
  dirty: boolean;
}) {
  const { profile, role } = usePermissions();
  // Ugyanazok a cache-kulcsok, mint a QuoteSendPanel-ben — nincs dupla lekérés.
  const docs = useQuery({
    queryKey: ["quote_documents", quote.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("quote_documents" as any).select("*").eq("quote_id", quote.id).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const contact = useQuery({
    queryKey: ["contacts", "one", quote.contact_id],
    enabled: !!quote.contact_id,
    queryFn: async () => (await supabase.from("contacts").select("id,name,email").eq("id", quote.contact_id!).maybeSingle()).data as any,
  });
  if (quote.locked_at) {
    return <p className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">Ez a verzió már kiment és zárolt. Módosításhoz új verziót kell készíteni (1. lépés → Verziók és további műveletek).</p>;
  }
  if (docs.isLoading || (contact.isLoading && !!quote.contact_id)) return <p className="text-sm text-muted-foreground">Ellenőrzés betöltése…</p>;
  if (docs.isError) return <p role="alert" className="text-sm text-destructive">Az ellenőrzés nem tölthető be. <button className="underline" onClick={() => docs.refetch()}>Újra</button></p>;
  const list = docs.data ?? [];
  const readiness = quoteSendReadiness({
    kind: quote.quote_kind ?? null,
    title: quote.title,
    companyId,
    contactId: quote.contact_id ?? null,
    contactEmail: contact.data?.email ?? null,
    net, mismatch, itemCount,
    pricedDocCount: list.filter((d) => d.document_type === "priced_budget").length,
    sentOfferDocCount: list.filter((d) => d.document_type === "sent_offer").length,
    validUntil: quote.valid_until ?? null,
    hasMailbox: !!profile?.gmail_email,
  });
  return (
    <div className="space-y-2">
      {dirty && <p role="status" className="rounded-md border border-[color:var(--status-warning)]/40 bg-[color:var(--status-warning)]/10 px-3 py-2 text-xs">Nem mentett módosításaid vannak. Az ellenőrzés a mentett adatokat nézi — előbb ments.</p>}
      <ReadinessList
        title="Kiküldés előtti ellenőrzés"
        readiness={readiness}
        note={readiness.ready
          ? "A kötelező adatok rendben. A kiküldés csak a lenti gombbal, a saját Gmail-fiókodból történik; a piszkozat nem számít kiküldésnek."
          : "Pótold a kötelező hiányokat a megadott lépésben, mielőtt kiküldöd."}
      />
      {quote.lead_id && (role === "sales" || role === "owner") && <p className="text-xs text-muted-foreground">Kiküldés után a Pipeline-ban léptesd az ügyet „Ajánlat kiadva” szakaszba: <Link to="/sales/leads" search={{ lead: quote.lead_id }} className="text-primary hover:underline">ügy megnyitása a Pipeline-ban</Link>.</p>}
    </div>
  );
}
