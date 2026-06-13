/**
 * Marketing email-sablonok a Lead Workspace jobb oldali akciópaneléhez.
 * Csak frontend constants — semmilyen DB tábla nem érintett.
 * A sablonok rövidek, magyar nyelvűek, a marketinges szabadon átírhatja küldés előtt.
 */

export type LeadEmailTemplate = {
  id: string;
  label: string;
  subject: (ctx: TemplateContext) => string;
  body: (ctx: TemplateContext) => string;
};

export type TemplateContext = {
  contactName?: string | null;
  companyName?: string | null;
  projectType?: string | null;
  source?: string | null;
  summary?: string | null;
};

function greeting(ctx: TemplateContext): string {
  const name = ctx.contactName?.trim();
  if (name) {
    const first = name.split(/\s+/)[0];
    return `Kedves ${first}!`;
  }
  return "Kedves Érdeklődő!";
}

function projectLine(ctx: TemplateContext): string {
  if (ctx.projectType && ctx.summary) {
    return `A megkeresésed alapján (${ctx.projectType}) – ${ctx.summary}`;
  }
  if (ctx.projectType) return `A megkeresésed témája: ${ctx.projectType}.`;
  if (ctx.summary) return ctx.summary;
  return "Köszönjük, hogy felvetted velünk a kapcsolatot.";
}

/** A `<p>`-be tördelt body — az EmailComposer kontentEditable HTML-t vár. */
function html(paragraphs: string[]): string {
  return paragraphs.map((p) => `<p>${p}</p>`).join("");
}

export const LEAD_EMAIL_TEMPLATES: LeadEmailTemplate[] = [
  {
    id: "first-contact",
    label: "Első megkeresés",
    subject: (c) =>
      c.summary
        ? `Köszönjük megkeresésed – ${c.summary.slice(0, 50)}`
        : "Köszönjük a megkeresésed",
    body: (c) =>
      html([
        greeting(c),
        projectLine(c),
        "Szeretnénk minél jobban megérteni az igényedet, hogy releváns ajánlattal tudjunk visszajelezni. Mikor lenne számodra egy rövid (15–20 perces) egyeztetés a legalkalmasabb a héten?",
        "Köszönjük előre is!<br/>Üdvözlettel,<br/>VIBA Team",
      ]),
  },
  {
    id: "reminder",
    label: "Emlékeztető",
    subject: (c) =>
      c.summary
        ? `Emlékeztető – ${c.summary.slice(0, 50)}`
        : "Emlékeztető – korábbi megkeresésed",
    body: (c) =>
      html([
        greeting(c),
        "Pár napja jelentkeztünk a megkeresésedre kapcsán, és szerettünk volna utánakérdezni, hogy ez még aktuális téma-e nálatok.",
        "Ha igen, küldök egy időpontjavaslatot egy rövid hívásra. Ha most nem időszerű, jelezz egy szót, és később visszatérek.",
        "Köszönöm!<br/>Üdvözlettel,<br/>VIBA Team",
      ]),
  },
  {
    id: "qualify",
    label: "Kvalifikáló kérdések",
    subject: (c) =>
      c.companyName
        ? `Pár kérdés a(z) ${c.companyName} projekthez`
        : "Pár kérdés a projektedhez",
    body: (c) =>
      html([
        greeting(c),
        "Mielőtt összeállítjuk az ajánlatot, három rövid kérdésre szeretnénk választ kapni, hogy a lehető legpontosabb képet kapjuk:",
        "1) Mi a projekt fő célja, és mikorra szeretnétek elindulni?<br/>2) Van-e már elképzelt költségkeret vagy nagyságrend?<br/>3) Ki a döntéshozó / kik vesznek részt a döntésben?",
        "Köszönöm a válaszodat – ezek alapján 2 munkanapon belül összeállítjuk az ajánlatot.",
        "Üdvözlettel,<br/>VIBA Team",
      ]),
  },
];
