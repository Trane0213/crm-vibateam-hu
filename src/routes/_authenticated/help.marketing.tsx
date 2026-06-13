import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BookOpen, Sparkles, ShieldCheck, ArrowRightCircle,
  CheckCircle2, Users, Mail, FolderOpen, StickyNote, Send,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/help/marketing")({
  component: MarketingHelpPage,
});

function MarketingHelpPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="space-y-1.5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <BookOpen className="h-3.5 w-3.5" /> Marketing gyorssegéd
        </div>
        <h1 className="text-2xl font-semibold">Napi marketing workflow</h1>
        <p className="text-sm text-muted-foreground">
          Cég-alapú minősítés: Scarlet → Kampánylista → Cég adatlap → Átadás sales-nek.
        </p>
      </header>

      <Section icon={Sparkles} title="1. Új cégek begyűjtése — Scarlet">
        <p>Nyisd meg: <Code><Link to="/sales/research" className="text-primary hover:underline">Scarlet – Marketing Stratéga</Link></Code></p>
        <p>Scarlet kutatás után a találatokat kampányba lehet menteni. Mentéskor minden találatból egy <em>potenciális</em> státuszú cég jön létre (és ha van, egy kapcsolattartó is). Lead ekkor még NEM jön létre — a lead csak a sales-átadáskor keletkezik.</p>
      </Section>

      <Section icon={Mail} title="2. Kampánylista — email kiküldés">
        <p>Nyisd meg: <Code><Link to="/campaign-list" className="text-primary hover:underline">Kampánylista</Link></Code></p>
        <p>Itt látod az összes aktív kampány-céget (a kihagyottak és a már kiküldöttek nem jelennek meg). A sor mellől tudsz email-t küldeni a kapcsolattartónak; sikeres küldés után a cég kikerül a listából (<Code>[KAMPANY:EMAIL_SENT]</Code> marker).</p>
      </Section>

      <Section icon={CheckCircle2} title="3. Cég adatlap — Marketing Munkafelület">
        <p>A <Code><Link to="/customers" className="text-primary hover:underline">Ügyfelek</Link></Code> listából (vagy a kampánylista <em>Megnyitás</em> gombjával) nyisd meg a cég adatlapját. Marketing role alatt az adatlap a <strong>Marketing Workspace</strong> nézetet rendereli — nem a sales 360-at.</p>
        <p className="text-xs text-muted-foreground">A fejlécben a marketing státusz váltható:</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Status name="Új"               desc="Még nem történt kapcsolatfelvétel."         tone="info" />
          <Status name="Kapcsolatban"     desc="Email vagy hívás megtörtént."               tone="primary" />
          <Status name="Átadható"         desc="A cég sales-átadásra kész."                 tone="warning" />
          <Status name="Átadva sales-nek" desc="A handoff megtörtént, lead létrejött."      tone="success" />
        </div>
        <p className="text-xs text-muted-foreground">A státuszok a <Code>companies.notes</Code> mezőben tárolt <Code>[MKT:STATUS:…]</Code> markerként élnek — nincs séma-módosítás.</p>
      </Section>

      <Section icon={StickyNote} title="4. Jegyzet sales-nek">
        <p>A jobb oldali <em>Jegyzet sales-nek</em> blokkba írd be, amit a sales-nek tudnia kell az átadás előtt (kontextus, igény, sürgősség). Ez a jegyzet:</p>
        <ul className="ml-5 list-disc space-y-0.5">
          <li>külön <Code>[MKT:SALES_NOTE]</Code> régióban tárolódik (nem keveredik a sima notes szöveggel),</li>
          <li>a Saleshez átadás dialogban előtöltődik az átadás összefoglalójába,</li>
          <li>így a létrejövő lead <em>summary</em> mezőjébe is bekerül.</li>
        </ul>
      </Section>

      <Section icon={FolderOpen} title="5. Dokumentumok">
        <p>A <em>Dokumentumok</em> fülön tudsz a céghez fájlt feltölteni (PDF, kép, dokumentum). Tárolás: R2, struktúra <Code>company-documents/&lt;companyId&gt;/…</Code>. Feltöltés után a lista azonnal frissül; a sales is látja ugyanezeket a dokumentumokat a saját 360 nézetében.</p>
      </Section>

      <Section icon={ShieldCheck} title="6. Adatminőség">
        <p>A cégek és kapcsolattartók listáján színes sávval jelenik meg az adatminőségi mutató:</p>
        <ul className="space-y-1.5">
          <li className="flex items-center gap-2">
            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">85% +</Badge>
            <span>Zöld — elegendő adat az átadáshoz.</span>
          </li>
          <li className="flex items-center gap-2">
            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">50–84%</Badge>
            <span>Sárga — érdemes pótolni a hiányzó adatokat.</span>
          </li>
          <li className="flex items-center gap-2">
            <Badge variant="destructive">&lt; 50%</Badge>
            <span>Piros — hiányos; az átadás panel figyelmeztetést ad.</span>
          </li>
        </ul>
        <p className="text-xs text-muted-foreground">
          Részletes hiánylista és duplikátum-jelöltek: <Code><Link to="/data-quality" className="text-primary hover:underline">Adatminőség</Link></Code>. Az összevonás és a mezők pótlása kézi munka.
        </p>
      </Section>

      <Section icon={ArrowRightCircle} title="7. Saleshez átadás">
        <p>A cég adatlap fejlécében kattints a <em>Saleshez átadás</em> gombra. A dialog:</p>
        <ol className="ml-5 list-decimal space-y-0.5">
          <li>Mutatja az aktuális <em>Jegyzet sales-nek</em> tartalmát (szerkeszthető).</li>
          <li>Kapcsolattartó választó (opcionális).</li>
          <li>Megerősítésre létrehoz egy új <Code>leads</Code> rekordot: <Code>source=marketing_handoff</Code>, <Code>status=new</Code>, a jegyzet a <Code>summary</Code>-ba kerül.</li>
          <li>A cég marketing státusza <em>Átadva sales-nek</em>-re vált (<Code>[MKT:STATUS:handoff:…:LEADID]</Code>).</li>
        </ol>
        <p className="text-xs text-muted-foreground">Átadás után a marketing már <strong>nem</strong> tudja újra átadni ugyanazt a céget — a gomb letiltódik, a lead a sales pipeline-jában él tovább.</p>
      </Section>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4" /> Hova ugorj most?
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 text-sm">
          <Link to="/today" className="rounded-md border px-3 py-1.5 hover:bg-muted/40">Ma</Link>
          <Link to="/sales/research" className="rounded-md border px-3 py-1.5 hover:bg-muted/40">Scarlet</Link>
          <Link to="/campaign-list" className="rounded-md border px-3 py-1.5 hover:bg-muted/40">Kampánylista</Link>
          <Link to="/customers" className="rounded-md border px-3 py-1.5 hover:bg-muted/40">Ügyfelek</Link>
          <Link to="/data-quality" className="rounded-md border px-3 py-1.5 hover:bg-muted/40">Adatminőség</Link>
        </CardContent>
      </Card>
    </div>
  );
}

function Section({
  icon: Icon, title, children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 text-primary" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm leading-relaxed">{children}</CardContent>
    </Card>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12px]">{children}</code>
  );
}

function Status({
  name, desc, tone,
}: {
  name: string;
  desc: string;
  tone: "info" | "primary" | "warning" | "success" | "danger";
}) {
  const cls =
    tone === "info"    ? "border-sky-200 bg-sky-50 text-sky-900" :
    tone === "primary" ? "border-primary/30 bg-primary/5 text-foreground" :
    tone === "warning" ? "border-amber-200 bg-amber-50 text-amber-900" :
    tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" :
                         "border-destructive/30 bg-destructive/5 text-destructive";
  return (
    <div className={`rounded-md border p-2 text-xs ${cls}`}>
      <div className="font-semibold">{name}</div>
      <div className="mt-0.5 opacity-80">{desc}</div>
    </div>
  );
}