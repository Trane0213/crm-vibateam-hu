// Melyik CRM-rekordon dolgozik a felhasználó — csak az URL-ből, adatlekérés nélkül.
export type RecordKind = "company" | "contact" | "lead" | "quote" | "project";
export type RecordContext = { kind: RecordKind; id: string; label: string };

const ROUTES: { re: RegExp; kind: RecordKind; label: string }[] = [
  { re: /^\/companies\/([0-9a-f-]{36})(?:\/|$)/i, kind: "company", label: "Cég" },
  { re: /^\/customers\/([0-9a-f-]{36})(?:\/|$)/i, kind: "company", label: "Ügyfél" },
  { re: /^\/contacts\/([0-9a-f-]{36})(?:\/|$)/i, kind: "contact", label: "Kapcsolattartó" },
  { re: /^\/leads\/([0-9a-f-]{36})(?:\/|$)/i, kind: "lead", label: "Lead" },
  { re: /^\/quotes\/([0-9a-f-]{36})(?:\/|$)/i, kind: "quote", label: "Ajánlat" },
  { re: /^\/projects\/([0-9a-f-]{36})(?:\/|$)/i, kind: "project", label: "Projekt" },
];

export function detectRecordContext(pathname: string): RecordContext | null {
  for (const r of ROUTES) {
    const m = pathname.match(r.re);
    if (m) return { kind: r.kind, id: m[1], label: r.label };
  }
  return null;
}

const KIND_HU: Record<RecordKind, string> = {
  company: "cég", contact: "kapcsolattartó", lead: "lead", quote: "ajánlat", project: "projekt",
};

/** A modellnek küldött rejtett kontextus-sor. Csak azonosítót ad át; az adatot a jogosultság-ellenőrzött toolok kérik le. */
export function contextPrefix(ctx: RecordContext, name: string | null): string {
  return [
    `[Kontextus: a felhasználó most a(z) ${KIND_HU[ctx.kind]} adatlapon van. Azonosító: ${ctx.id}${name ? `, megnevezés: „${name}”` : ""}.`,
    `A kérdés erre a rekordra vonatkozik, hacsak a felhasználó mást nem mond. Az adatokat CRM-toolokkal kérd le;`,
    `ha egy információ nincs a rendszerben vagy nincs hozzá jogosultság, mondd meg egyértelműen, ne találd ki.`,
    `Adatot ne módosíts jóváhagyás nélkül.]`,
  ].join(" ");
}

export const CONTEXT_QUESTIONS: Record<RecordKind, string[]> = {
  project: ["Foglald össze a projekt helyzetét", "Milyen ajánlat alapján nyertük el?", "Milyen feladatok vannak hátra?", "Milyen határidők és problémák vannak?", "Készíts feladattervet"],
  company: ["Foglald össze a céget", "Milyen nyitott leadek és ajánlatok vannak?", "Mi a következő lépés?"],
  contact: ["Foglald össze a kapcsolattartót", "Milyen leadekhez és projektekhez tartozik?"],
  lead: ["Foglald össze a leadet", "Mi a következő lépés?", "Milyen ajánlatok készültek?"],
  quote: ["Foglald össze az ajánlatot", "Mi a következő lépés?", "Volt utánkövetés?"],
};

export const GENERAL_QUESTIONS = ["Mi a mai legfontosabb teendőm?", "Mi a következő lépés?", "Készíts feladattervet"];
