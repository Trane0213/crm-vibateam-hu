/**
 * Ajánlatkészítő — egységes négy lépés és a „következő teendő”. Csak megjelenítési szabály:
 * nem ír adatot, nem dönt jogosultságról, nem számol árat. A mentés, árazás, kiküldés
 * a meglévő paneleken és szerveroldali ellenőrzéseken marad.
 */
import { CLOSED_QUOTE_STATUSES, type QuoteStatus } from "@/lib/quotes/quote-status";
import { quoteWorkflow } from "@/lib/quotes/workflow";

export type QuoteStepKey = "customer" | "pricing" | "offer" | "send";
export const QUOTE_STEPS: { key: QuoteStepKey; label: string }[] = [
  { key: "customer", label: "Ügyfél és dokumentumok" },
  { key: "pricing", label: "Árazás" },
  { key: "offer", label: "Ügyfélnek szóló ajánlat" },
  { key: "send", label: "Kiküldés és utánkövetés" },
];

export type QuoteStepInput = {
  kind: unknown; status: string | null | undefined; locked: boolean; dirty: boolean;
  contactId: string | null | undefined; net: number | null; itemCount: number;
  docCount: number; pricedDocCount: number; sentOfferDocCount: number;
};
export type QuoteNext = { step: QuoteStepKey; title: string; hint: string };

export function quoteNextStep(i: QuoteStepInput): QuoteNext {
  const kind = quoteWorkflow(i.kind);
  const status = (i.status ?? "draft") as QuoteStatus;
  if (i.locked || status === "sent" || status === "negotiation" || CLOSED_QUOTE_STATUSES.includes(status)) {
    return { step: "send", title: "Kövesd az ügyfél válaszát", hint: "Az ajánlat kiment vagy lezárult, tartalma csak olvasható. Módosításhoz új verziót készíts." };
  }
  if (i.dirty) return { step: "customer", title: "Mentsd a módosításokat", hint: "Nem mentett változásaid vannak; az ellenőrzés a mentett adatot nézi." };
  if (!i.contactId) return { step: "customer", title: "Válaszd ki a kapcsolattartót", hint: "Neki megy az ajánlat, és az ő neve kerül az ajánlatra." };
  if (kind === "received_budget" && i.docCount === 0) return { step: "customer", title: "Töltsd fel a kapott költségvetést", hint: "Az Excel-t „Árazatlan költségvetés” típussal, a terveket mellé." };
  if (kind === "viba_offer" && i.itemCount === 0) return { step: "pricing", title: "Add meg az ajánlat tételeit", hint: "Az ajánlat összege kizárólag a tételekből számolódik." };
  if (i.net == null || i.net <= 0) return { step: "pricing", title: kind === "viba_offer" ? "Adj árat a tételeknek" : "Árazd be a költségvetést", hint: "0 Ft-os vagy hiányosan árazott ajánlat nem küldhető ki." };
  if (kind === "received_budget" && i.pricedDocCount === 0) return { step: "offer", title: "Mentsd az árazott Excelt az ajánlatra", hint: "Az ajánlatcsomagban a „Fájlok mentése” gombbal — ez megy az ügyfélnek." };
  if (kind === "viba_offer" && i.sentOfferDocCount === 0) return { step: "offer", title: "Ellenőrizd az ügyfélnek szóló ajánlatot", hint: "Sablon, feltételek és A4-előnézet; a PDF-et „Kiküldött ajánlat” típusként csatold." };
  return { step: "send", title: "Küldd ki az ajánlatot", hint: "A saját Gmail-fiókodból, az eredeti levélszálban válaszként vagy új levélként." };
}
