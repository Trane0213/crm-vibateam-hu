/**
 * Ajánlat-munkaterület segédszabályai (csak megjelenítés). A lépések és a következő teendő
 * a `quote-steps.ts`-ben vannak; ez a fájl a Timothy-gyorsparancsokat és a régi
 * nézetparaméter olvasását tartja (a régi `?nezet=egyszeru` link már ugyanazt az egy nézetet nyitja).
 */
import { quoteWorkflow } from "@/lib/quotes/workflow";

/** Timothy gyorsparancsai — csak szöveget töltenek be a meglévő AI-panelbe, nem küldenek. */
export function timothyQuickCommands(kind: unknown, step: "pricing" | "offer" = "pricing"): string[] {
  const own = quoteWorkflow(kind) === "viba_offer";
  if (step === "offer") return own
    ? ["Ellenőrizd a műszaki lehatárolást és a kizárásokat.", "Mi hiányzik még a kiküldéshez?", "Írj kísérőlevél-tervezetet ehhez az ajánlathoz (nem küldöd el)."]
    : ["Készíts kérdéslistát az ügyfélnek a hiányzó adatokról.", "Mi hiányzik még a kiküldéshez?", "Írj kísérőlevél-tervezetet ehhez az ajánlathoz (nem küldöd el)."];
  return own
    ? ["Javasolj tételeket ehhez az ajánlathoz a jóváhagyott díjtörzs alapján, és jelezd a hiányzó árakat.", "Mely tételeknek nincs még ára?"]
    : ["Vizsgáld meg a feltöltött költségvetést, csak az erősáramot árazzuk, és jelezd a hiányokat.", "Sorold fel az ár nélküli és ellenőrizendő tételeket okkal.", "Ellenőrizd a terveket a költségvetéshez képest, és listázd az eltéréseket."];
}

/** Régi nézetparaméter: csak az „egyszeru” értéket fogadja el; a felület ettől nem változik. */
export function parseQuoteView(v: unknown): "egyszeru" | undefined {
  return v === "egyszeru" ? "egyszeru" : undefined;
}
