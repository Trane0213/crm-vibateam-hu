/**
 * Konkrét ajánlatkérés elfogadása (Marketing „Konkrét ajánlatkérés” jelöléssel átadott ügy).
 * A kijelölt értékesítő elfogadja → az ügy közvetlenül „Ajánlat előkészítése” szakaszba kerül,
 * köztes kapcsolatfelvételi aktivitás nélkül. Általános, nem jelölt lead továbbra is a
 * normál minősítésen megy át (aktivitás + következő lépés → Pipeline).
 * A DB-szabályok (pipeline_entered_at egyirányú, Pipeline-ban kötelező következő lépés) változatlanok.
 */
import { buildNextStepPayload } from "./next-step-input";

export type QuoteRequestLead = { quote_requested?: boolean | null; status: string | null; pipeline_entered_at: string | null };

export function canAcceptQuoteRequest(l: QuoteRequestLead): boolean {
  return l.quote_requested === true && !l.pipeline_entered_at && ["new", "contacted"].includes(l.status ?? "new");
}

/** A meglévő leadírási útvonalon (updateLeadOrThrow) mentendő mezők; null = hiányos határidő. */
export function quoteRequestAcceptPatch(input: { date: string; time: string; note: string; now?: Date }) {
  const step = buildNextStepPayload("quote_send", input.date, input.time, input.note.trim() || "Ajánlat elkészítése");
  if (!step) return null;
  return { ...step, status: "quote_prep" as const, pipeline_entered_at: (input.now ?? new Date()).toISOString() };
}
