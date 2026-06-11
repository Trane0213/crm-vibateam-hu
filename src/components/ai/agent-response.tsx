import { Card, CardContent } from "@/components/ui/card";
import { Lightbulb, ListChecks } from "lucide-react";

/**
 * Strukturált AI-válasz megjelenítő.
 * Sima szöveget kap, és „szekciókra" bont:
 *  - egy szekció fejléce: bold sor (**Cím**) VAGY nagybetűs sor kettősponttal (NYITOTT AJÁNLATOK:)
 *  - a felsorolások (-, •, *) listává alakulnak
 *  - a **bold** részek kiemelten jelennek meg
 *  - „JAVASLAT" / „TIPP" / „ÖSSZEGZÉS" szekció külön kiemelt kártyát kap
 */

type Section = { title: string | null; body: string[]; highlight?: boolean };

function parseSections(text: string): Section[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const sections: Section[] = [];
  let current: Section = { title: null, body: [] };
  const pushCurrent = () => {
    if (current.title || current.body.some((l) => l.trim())) sections.push(current);
    current = { title: null, body: [] };
  };
  const isHeading = (raw: string): string | null => {
    const l = raw.trim();
    if (!l) return null;
    // Markdown heading: ## Cím
    const md = l.match(/^#{1,4}\s+(.+)$/);
    if (md) return md[1].replace(/\*+/g, "").trim();
    // **Cím** (a teljes sor bold)
    const bold = l.match(/^\*\*(.+?)\*\*:?\s*$/);
    if (bold) return bold[1].trim();
    // CAPS + kettőspont: NYITOTT AJÁNLATOK:
    const caps = l.match(/^[•\-\*]?\s*([A-ZÁÉÍÓÖŐÚÜŰ0-9 /()-]{4,}):\s*$/);
    if (caps) return caps[1].trim();
    // Számozott szekciófej: „1) AJÁNLATOK:" / „1. AJÁNLATOK:"
    const num = l.match(/^\d+[.)]\s+([A-ZÁÉÍÓÖŐÚÜŰ][^:]{2,40}):\s*$/);
    if (num) return num[1].trim();
    return null;
  };
  for (const raw of lines) {
    const h = isHeading(raw);
    if (h !== null) {
      pushCurrent();
      current.title = h;
      const up = h.toUpperCase();
      if (up.includes("JAVASLAT") || up.includes("TIPP") || up.includes("ÖSSZEGZ") || up.includes("FÓKUSZ")) {
        current.highlight = true;
      }
      continue;
    }
    current.body.push(raw);
  }
  pushCurrent();
  // Ha csak egy szekció van cím nélkül és rövid → ne kártyázzuk fölöslegesen.
  return sections;
}

function renderInline(s: string, key: string) {
  // **bold** kiemelése
  const parts = s.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) {
      return <strong key={`${key}-${i}`} className="font-semibold text-foreground">{p.slice(2, -2)}</strong>;
    }
    return <span key={`${key}-${i}`}>{p}</span>;
  });
}

function Body({ lines }: { lines: string[] }) {
  const blocks: React.ReactNode[] = [];
  let listBuf: string[] = [];
  const flushList = (key: string) => {
    if (!listBuf.length) return;
    blocks.push(
      <ul key={`ul-${key}`} className="my-1 list-disc space-y-1 pl-5 text-sm leading-relaxed">
        {listBuf.map((item, i) => (
          <li key={i}>{renderInline(item, `li-${key}-${i}`)}</li>
        ))}
      </ul>,
    );
    listBuf = [];
  };
  lines.forEach((raw, i) => {
    const l = raw.replace(/\t/g, "  ");
    const trimmed = l.trim();
    const m = trimmed.match(/^[-*•]\s+(.*)$/);
    if (m) {
      listBuf.push(m[1]);
      return;
    }
    flushList(`${i}`);
    if (!trimmed) {
      blocks.push(<div key={`sp-${i}`} className="h-1" />);
      return;
    }
    blocks.push(
      <p key={`p-${i}`} className="text-sm leading-relaxed">
        {renderInline(trimmed, `p-${i}`)}
      </p>,
    );
  });
  flushList("end");
  return <div className="space-y-1">{blocks}</div>;
}

export function AgentResponse({ text }: { text: string }) {
  const sections = parseSections(text);
  // Ha nincs felismerhető szekció → sima blokk.
  const hasHeadings = sections.some((s) => s.title);
  if (!hasHeadings) {
    return (
      <div className="rounded-lg border bg-card p-4">
        <Body lines={text.split("\n")} />
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      {sections.map((s, i) => {
        if (!s.title && s.body.every((l) => !l.trim())) return null;
        if (s.highlight) {
          return (
            <Card key={i} className="border-primary/40 bg-primary/5">
              <CardContent className="space-y-1 p-4">
                {s.title && (
                  <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
                    <Lightbulb className="h-3.5 w-3.5" /> {s.title}
                  </div>
                )}
                <Body lines={s.body} />
              </CardContent>
            </Card>
          );
        }
        return (
          <Card key={i}>
            <CardContent className="space-y-1 p-4">
              {s.title && (
                <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <ListChecks className="h-3.5 w-3.5" /> {s.title}
                </div>
              )}
              <Body lines={s.body} />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}