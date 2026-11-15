// Ügyön belüli gyorskérések Timothynak és Scarletnek. Csak kérés-szöveg: a rekordot az
// AI-panel az URL-ből azonosítja, adatot a jogosultság-ellenőrzött eszközök olvasnak.
export type CaseKind = "lead" | "company" | "quote" | "inbound" | "campaign" | "thread" | "project";
type Ref = { name?: string | null; id: string };

const SAFE = " Ne ments, ne küldj és ne módosíts semmit jóváhagyás nélkül.";

export function caseAssistantPrompts(agent: "sales" | "marketing", kind: CaseKind, ref: Ref): { label: string; text: string }[] {
  const n = ref.name ? `„${ref.name}”` : "ezt";
  if (agent === "sales") {
    switch (kind) {
      case "lead": return [
        { label: "Mi a következő lépés?", text: `Nézd át a(z) ${n} ügyet (azonosító: ${ref.id}) és javasold a következő lépést indoklással.${SAFE}` },
        { label: "Foglald össze az előzményeket", text: `Foglald össze röviden a(z) ${n} ügy (${ref.id}) előzményeit, leveleit és nyitott kérdéseit.${SAFE}` },
        { label: "Mi hiányzik az ajánlathoz?", text: `Milyen adat, terv vagy egyeztetés hiányzik a(z) ${n} ügyben (${ref.id}) az ajánlatkészítéshez?${SAFE}` },
      ];
      case "company": return [
        { label: "Foglald össze az ügyfelet", text: `Foglald össze a(z) ${n} ügyfelet (${ref.id}): nyitott ügyek, ajánlatok, utolsó kapcsolat.${SAFE}` },
        { label: "Mi a következő lépés?", text: `Mi a következő értékesítési lépés a(z) ${n} ügyfélnél (${ref.id})?${SAFE}` },
        { label: "Hiányzó adatok", text: `Milyen ügyféladat hiányzik a(z) ${n} cégnél (${ref.id})? Csak a rendszerben lévő adatok alapján.${SAFE}` },
      ];
      case "quote": return [
        { label: "Ellenőrizd az ajánlatot", text: `Ellenőrizd a(z) ${n} ajánlatot (${ref.id}): hiányzó tételek, ellentmondások, kiküldés előtti teendők.${SAFE}` },
        { label: "Kísérőlevél-tervezet", text: `Írj rövid kísérőlevél-tervezetet a(z) ${n} ajánlathoz (${ref.id}). Csak tervezet.${SAFE}` },
        { label: "Utánkövetési javaslat", text: `Mikor és hogyan kövessük az ajánlatot (${ref.id})? Javasolj szöveget is.${SAFE}` },
      ];
      case "thread": return [
        { label: "Foglald össze a levelezést", text: `Foglald össze ezt a levélszálat (${ref.id}) és emeld ki a teendőket.${SAFE}` },
        { label: "Válaszvázlat", text: `Írj válaszvázlatot erre a levélszálra (${ref.id}). Csak tervezet.${SAFE}` },
      ];
      case "project": return [
        { label: "Foglald össze a projektet", text: `Foglald össze a(z) ${n} projekt (${ref.id}) állapotát és az átadás nyitott pontjait.${SAFE}` },
      ];
      default: return [];
    }
  }
  switch (kind) {
    case "inbound": return [
      { label: "Minősítsd az érdeklődőt", text: `Minősítsd ezt a webes érdeklődést (${ref.id}): cég vagy magánszemély, igény, sürgősség, átadható-e a Salesnek. Duplikátumot jelezz, ne vonj össze.${SAFE}` },
      { label: "Első válasz tervezete", text: `Írj udvarias első válasz-tervezetet erre a webes érdeklődésre (${ref.id}). Árat ne írj.${SAFE}` },
    ];
    case "campaign": return [
      { label: "Tárgysor-javaslatok", text: `Javasolj 3 tárgysort a kijelölt kampánytervezethez.${SAFE}` },
      { label: "Szövegtervezet", text: `Írj rövid, ellenőrizhető állításokra épülő kampányszöveg-tervezetet a kijelölt kampányhoz.${SAFE}` },
      { label: "Címzettek ellenőrzése", text: `Nézd át a kampány címzettjeit: kizárt cégek, hiányzó vagy nem igazolt e-mail-címek.${SAFE}` },
    ];
    case "thread": return [
      { label: "Foglald össze a levelezést", text: `Foglald össze ezt a levélszálat (${ref.id}) marketing szempontból: érdeklődés, következő lépés.${SAFE}` },
      { label: "Válaszvázlat", text: `Írj válaszvázlatot erre a levélszálra (${ref.id}). Csak tervezet.${SAFE}` },
    ];
    case "lead":
    case "company": return [
      { label: "Mi a következő marketinglépés?", text: `Nézd át a(z) ${n} céget (${ref.id}): marketingállapot, kapcsolattartók, levelezés. Javasolj következő lépést.${SAFE}` },
      { label: "Átadható a Salesnek?", text: `Átadható-e a(z) ${n} (${ref.id}) a Salesnek? Indokold a rendszerben lévő adatokkal.${SAFE}` },
      { label: "Megkereső levél tervezete", text: `Írj megkereső levél-tervezetet a(z) ${n} számára (${ref.id}). Csak tervezet.${SAFE}` },
    ];
    default: return [];
  }
}
