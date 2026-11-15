/**
 * Egyszerűsített ajánlat-munkaterület (UX 1. kör, prototípus).
 * Tiszta, csak megjelenítési szabályok: melyik a 3 lépésből az aktív, és mi a
 * következő teendő. NEM ír adatot, NEM dönt jogosultságról, NEM számol árat —
 * a mentés, árazás, jóváhagyás és küldés a meglévő paneleken marad.
 */
import { CLOSED_QUOTE_STATUSES, type QuoteStatus } from "@/lib/quotes/quote-status";
import { quoteWorkflow } from "@/lib/quotes/workflow";

export type SimpleStep = 1 | 2 | 3;
export type NextAction = "save" | "documents" | "basics" | "timothy" | "review" | "followup";
export type SimpleState = {
  step: SimpleStep;
  done: boolean;
  next: { title: string; hint: string; action: NextAction; button: string };
};
export type SimpleInput = {
  kind: unknown;
  title: string | null | undefined;
  status: string | null | undefined;
  locked: boolean;
  dirty: boolean;
  net: number | null;
  itemCount: number;
  docCount: number;
};

export const SIMPLE_STEPS: { n: SimpleStep; label: string }[] = [
  { n: 1, label: "Ajánlatkérés és dokumentumok" },
  { n: 2, label: "Timothy munkája" },
  { n: 3, label: "Ellenőrzés és jóváhagyás" },
];

export function simpleQuoteState(i: SimpleInput): SimpleState {
  const kind = quoteWorkflow(i.kind);
  const status = (i.status ?? "draft") as QuoteStatus;
  if (i.locked || status === "sent" || status === "negotiation" || CLOSED_QUOTE_STATUSES.includes(status)) {
    return { step: 3, done: true, next: { title: "Kövesd az ügyfél válaszát", hint: "Az ajánlat kiment vagy lezárult. Az utánkövetés és az állapot a lap alján található.", action: "followup", button: "Utánkövetés megnyitása" } };
  }
  if (i.dirty) {
    return { step: 1, done: false, next: { title: "Mentsd a módosításokat", hint: "Nem mentett változásaid vannak. Az ellenőrzés és Timothy a mentett adatot látja.", action: "save", button: "Mentés" } };
  }
  if (!i.title?.trim()) {
    return { step: 1, done: false, next: { title: "Add meg az ajánlat címét", hint: "Egy rövid cím alapján az ügyfél és a kollégák is megtalálják.", action: "basics", button: "Alapadatok" } };
  }
  if (kind === "received_budget" && i.docCount === 0) {
    return { step: 1, done: false, next: { title: "Töltsd fel a kapott költségvetést vagy tervet", hint: "Excel, PDF vagy terv — ebből dolgozik Timothy és az árazó.", action: "documents", button: "Dokumentum feltöltése" } };
  }
  const priced = kind === "viba_offer" ? i.itemCount > 0 : i.net != null;
  if (!priced) {
    return { step: 2, done: false, next: { title: "Kérd meg Timothyt az árazásra", hint: "Írd le, mit árazzunk (pl. csak erősáram). Hiányzó vagy nem jóváhagyott árat nem talál ki — jelzi hiányként.", action: "timothy", button: "Utasítás Timothynak" } };
  }
  return { step: 3, done: false, next: { title: "Ellenőrizd és hagyd jóvá az ajánlatot", hint: "Nézd át az ellenőrző listát. Kiküldés csak a saját Gmail-fiókodból, külön megerősítéssel történik.", action: "review", button: "Ellenőrzés megnyitása" } };
}

/** Timothy gyorsparancsai — csak szöveget töltenek be a meglévő AI-panelbe, nem küldenek. */
export function timothyQuickCommands(kind: unknown): string[] {
  return quoteWorkflow(kind) === "viba_offer"
    ? [
        "Javasolj tételeket ehhez az ajánlathoz a jóváhagyott díjtörzs alapján, és jelezd a hiányzó árakat.",
        "Ellenőrizd a műszaki lehatárolást és a kizárásokat.",
        "Mi hiányzik még a kiküldéshez?",
      ]
    : [
        "Vizsgáld meg a feltöltött költségvetést, csak az erősáramot árazzuk, készíts ajánlattervezetet, és jelezd a hiányokat.",
        "Ellenőrizd a terveket a költségvetéshez képest, és listázd az eltéréseket.",
        "Készíts kérdéslistát az ügyfélnek a hiányzó adatokról.",
      ];
}

/** Nézetválasztó URL-paraméter: csak a felület változik, adat nem. */
export function parseQuoteView(v: unknown): "egyszeru" | undefined {
  return v === "egyszeru" ? "egyszeru" : undefined;
}
