import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BookOpen, Sparkles, ShieldCheck, ArrowRightCircle,
  CheckCircle2, Users, Mail, FolderOpen, StickyNote,
  LayoutDashboard, ListChecks, UserPlus, Inbox, Flag, ArrowRight,
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
          <BookOpen className="h-3.5 w-3.5" /> Marketing súgó
        </div>
        <h1 className="text-2xl font-semibold">Napi marketing workflow — kézikönyv</h1>
        <p className="text-sm text-muted-foreground">
          A valós rendszer alapján: Scarlet / manuális cég → Kampánylista → Marketing Workspace →
          Sales-átadás. A teljes folyamat cég-szintű, az állapot a <Code>companies.notes</Code>
          mezőben tárolt markerekben él, nincs külön marketing tábla.
        </p>
      </header>

      <Section icon={LayoutDashboard} title="1. Marketing Dashboard (Ma)">
        <p>Nyisd meg: <Code><Link to="/today" className="text-primary hover:underline">Ma</Link></Code>.
          Ez a marketinges napi nyitóképernyője. A felső kártyák:</p>
        <ul className="ml-5 list-disc space-y-0.5">
          <li><strong>Pipeline bucketek</strong> — <em>Új / Kapcsolatban / Átadható / Átadva / Kikerült</em>.
            Csak azokat a cégeket számolja, amelyek a marketing universe-be tartoznak
            (Scarletből vagy explicit marketing markerrel).</li>
          <li><strong>Új cégek (ma / 7 nap / 30 nap)</strong> — <u>minden</u> újonnan létrehozott
            céget számol forrástól függetlenül (Scarlet és manuális egyformán).</li>
          <li><strong>Mai prioritás lista</strong> — a következő legfontosabb cégek, klikkre a
            cég Marketing Workspace nézete nyílik meg.</li>
        </ul>
        <p>Gyorsműveletek a fejlécben: <em>Kampánylista</em>, <em>Levelek</em>,
          <em>Scarlet research</em>, <em>Marketing súgó</em>.</p>
      </Section>

      <Section icon={Sparkles} title="2. Scarlet Research — új cégek begyűjtése">
        <p>Nyisd meg: <Code><Link to="/sales/research" className="text-primary hover:underline">Scarlet – Marketing Stratéga</Link></Code></p>
        <ol className="ml-5 list-decimal space-y-0.5">
          <li>Add meg a kulcsszót, területet és a kívánt cégszámot, majd <em>Keresés</em>.</li>
          <li>Scarlet (Gemini) AI-val cégeket keres és pontoz 0–100 között (email, telefon,
            website, kulcsszó-egyezés, terület alapján).</li>
          <li>Soronként a <em>Kampány</em> gombbal mented a céget. A rendszer ilyenkor:
            <ul className="ml-5 list-disc space-y-0.5">
              <li>duplikátum-ellenőrzést végez (cégnév + email alapján),</li>
              <li><Code>companies</Code> rekordot szúr be <em>Új</em> marketing státusszal,</li>
              <li>ha van email/telefon, <Code>contacts</Code> rekordot is létrehoz (<em>Iroda</em>).</li>
            </ul>
          </li>
        </ol>
        <p className="text-xs text-muted-foreground">Lead ekkor <strong>nem</strong> jön létre —
          a lead csak a sales-átadáskor keletkezik.</p>
      </Section>

      <Section icon={ListChecks} title="3. Kampánylista — első kapcsolatfelvétel">
        <p>Nyisd meg: <Code><Link to="/campaign-list" className="text-primary hover:underline">Kampánylista</Link></Code></p>
        <p>Itt jelenik meg az összes <em>Új</em> státuszú marketing cég. Soronként:</p>
        <ul className="ml-5 list-disc space-y-0.5">
          <li><strong>Email gomb</strong> — megnyitja az email szerkesztőt a kapcsolattartó címére.
            Sikeres küldés után a cég automatikusan <em>Kapcsolatban</em> állapotba kerül és
            kikerül a kampánylistából.</li>
          <li><strong>Megnyitás</strong> — átvezet a cég Marketing Workspace nézetére.</li>
          <li><strong>Kuka ikon</strong> — a cég <em>Kikerült</em> státuszba megy (nem törlődik,
            csak kiveszed az aktív listából).</li>
        </ul>
      </Section>

      <Section icon={CheckCircle2} title="4. Marketing Workspace — minősítés cég-szinten">
        <p>A cég adatlapja (<Code>/customers/&lt;id&gt;</Code>) marketing role alatt automatikusan
          a <strong>Marketing Workspace</strong> nézetet rendereli — nem a sales 360-at.
          Belépéskor két vezérlő kártya van a tetején:</p>
        <ul className="ml-5 list-disc space-y-0.5">
          <li><strong>Next Best Action</strong> — egyetlen javasolt következő lépés (pl. <em>„Adj
            hozzá kapcsolattartót"</em>, <em>„Küldj első emailt"</em>, <em>„Írj sales jegyzetet"</em>,
            <em>„Készen áll átadásra"</em>).</li>
          <li><strong>Workflow Checklist</strong> — vizuális ellenőrzőlista, mi van meg, mi hiányzik
            az átadáshoz.</li>
        </ul>
        <p>A fejléc tartalmazza a státusz-pillt, a <em>Saleshez átadás</em> gombot, és a
          <em>⋯ menüt</em>, ahol kézzel váltható a marketing státusz (<em>Új</em> /
          <em>Kapcsolatban</em> / <em>Átadható</em>).</p>
        <p className="text-xs text-muted-foreground">Hat tab van: <em>Áttekintés</em>,
          <em>Kapcsolattartók</em>, <em>Email aktivitás</em>, <em>Dokumentumok</em>,
          <em>Jegyzet salesnek</em>, <em>Idővonal</em>.</p>
      </Section>

      <Section icon={UserPlus} title="5. Kapcsolattartók kezelése">
        <p>A <em>Kapcsolattartók</em> tabon látszik a céghez tartozó összes <Code>contacts</Code>
          rekord. Itt tudsz:</p>
        <ul className="ml-5 list-disc space-y-0.5">
          <li>új kapcsolattartót felvenni (név, beosztás, email, telefon),</li>
          <li>meglévőt szerkeszteni,</li>
          <li>közvetlenül emailt írni a kontaktnak.</li>
        </ul>
        <p>Saleshez átadáshoz <strong>legalább egy kapcsolattartó kell</strong>, lehetőleg
          email címmel — enélkül az átadás gomb le van tiltva.</p>
      </Section>

      <Section icon={Inbox} title="6. Email aktivitás">
        <p>Az <em>Email aktivitás</em> tab a céghez tartozó összes email szálat mutatja
          (a <Code>emails</Code> táblából <Code>thread_id</Code> szerint csoportosítva).
          Egy szál sorára kattintva megnyílik az <Code><Link to="/emails" className="text-primary hover:underline">Email</Link></Code>
          modulban a teljes thread.</p>
        <p className="text-xs text-muted-foreground">A thread nézet, a body megjelenítése és a
          csatolmányok minden szerepkörnél (marketing, sales, admin, customer) ugyanazt az adatot
          mutatják — szerepkör csak jogosultságot szab meg, adatot nem.</p>
      </Section>

      <Section icon={FolderOpen} title="7. Dokumentumok">
        <p>A <em>Dokumentumok</em> tabon tudsz a céghez fájlt feltölteni (PDF, kép, dokumentum).
          Tárolás: R2, struktúra <Code>company-documents/&lt;companyId&gt;/…</Code>. Feltöltés után
          a lista azonnal frissül; a sales is ugyanezeket látja a saját 360 nézetében.</p>
      </Section>

      <Section icon={StickyNote} title="8. Jegyzet sales-nek">
        <p>A <em>Jegyzet salesnek</em> tabon írd le, amit a sales-nek tudnia kell az átadás előtt
          (kontextus, igény, sürgősség, eddigi beszélgetés lényege). A jegyzet:</p>
        <ul className="ml-5 list-disc space-y-0.5">
          <li>külön <Code>[MKT:SALES_NOTE]…[/MKT:SALES_NOTE]</Code> régióban tárolódik a
            <Code>companies.notes</Code> mezőben, nem keveredik a sima jegyzettel,</li>
          <li>a Saleshez átadás dialogban automatikusan előtöltődik az átadás összefoglalójába,</li>
          <li>a létrejövő <Code>leads.summary</Code> mezőjébe is bekerül.</li>
        </ul>
        <p className="text-xs text-muted-foreground">Sales-jegyzet nélkül az átadás gomb le van
          tiltva — a Next Best Action ilyenkor <em>„Írj sales jegyzetet"</em>-et javasol.</p>
      </Section>

      <Section icon={Flag} title="9. Marketing státuszok jelentése">
        <div className="grid gap-2 sm:grid-cols-2">
          <Status name="Új"               desc="A cég bekerült a marketing pipeline-ba (Scarlet vagy manuális). Még nem történt kapcsolatfelvétel." tone="info" />
          <Status name="Kapcsolatban"     desc="Email vagy hívás megtörtént. A cég kikerült a kampánylista aktív listájából, minősítés alatt áll." tone="primary" />
          <Status name="Átadható"         desc="Van kapcsolattartó email címmel, van sales-jegyzet, a cég sales-átadásra kész." tone="warning" />
          <Status name="Átadva sales-nek" desc="A handoff megtörtént, létrejött a lead. A marketing már nem tudja újra átadni." tone="success" />
          <Status name="Kikerült"         desc="A marketing nem viszi tovább a céget (nem érdekelt, nem releváns, vagy minőség hiányos). Nem törlődik, csak kiesik a pipeline-ból." tone="danger" />
        </div>
        <p className="text-xs text-muted-foreground">A státuszokat a rendszer a
          <Code>companies.notes</Code> mezőben <Code>[MKT:STATUS:…]</Code> markerként tárolja,
          nincs külön séma-mező. A legutolsó marker az érvényes.</p>
      </Section>

      <Section icon={ArrowRightCircle} title="10. Sales átadás folyamata">
        <p>A cég adatlap fejlécében kattints a <em>Saleshez átadás</em> gombra. Feltételek
          (különben a gomb le van tiltva): van kapcsolattartó, és a Next Best Action állapot
          <em>Készen áll átadásra</em>.</p>
        <p>A dialogban:</p>
        <ol className="ml-5 list-decimal space-y-0.5">
          <li>Az átadási összefoglaló (előtöltve a sales-jegyzettel), szerkeszthető.</li>
          <li>Opcionális projekt-típus mező.</li>
          <li>Kapcsolattartó választó.</li>
        </ol>
        <p>A <em>Megerősítés</em> gomb két dolgot csinál egyszerre:</p>
        <ul className="ml-5 list-disc space-y-0.5">
          <li>új <Code>leads</Code> rekordot szúr be:
            <Code>source=marketing_handoff</Code>, <Code>status=new</Code>,
            <Code>summary</Code> = a jegyzet,</li>
          <li>a cég marketing státuszát <em>Átadva sales-nek</em>-re billenti:
            <Code>[MKT:STATUS:handoff:YYYY-MM-DD:LEADID]</Code>.</li>
        </ul>
      </Section>

      <Section icon={ArrowRight} title="11. Mi történik az átadás után?">
        <ul className="ml-5 list-disc space-y-0.5">
          <li>A lead azonnal megjelenik a <strong>sales pipeline</strong>-ban (új, marketing
            forrással jelölve). A sales kolléga a saját nézetében ugyanezt a céget és minden
            adatát (kontakt, dokumentum, email szál, sales-jegyzet) látja.</li>
          <li>A marketing oldalon a cég <em>Átadva sales-nek</em> állapotban marad. Az átadás
            gomb többé nem aktív — egy céget egyszer lehet átadni.</li>
          <li>Push vagy email értesítés jelenleg nincs; a sales akkor látja az új leadet, amikor
            megnyitja a pipeline-ját.</li>
        </ul>
        <Card className="mt-3 border-dashed bg-muted/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Következő fejlesztési szakasz — sales modul</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>A marketing modul fejlesztése ezzel a súgóval lezárt. A következő szakaszban
              a sales modul kapja a fókuszt:</p>
            <ul className="ml-5 list-disc space-y-0.5">
              <li>az átadott lead a sales pipeline-ba kerül,</li>
              <li>a sales pipeline-ban a lead konkrét <strong>értékesítőhöz</strong> lesz
                rendelhető,</li>
              <li>a teljes értékesítői munkafolyamatot (minősítés, ajánlat, zárás) a sales
                modul fogja kezelni.</li>
            </ul>
          </CardContent>
        </Card>
      </Section>

      <Section icon={ShieldCheck} title="12. Adatminőség (kiegészítő)">
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
          Részletes hiánylista és duplikátum-jelöltek:
          <Code><Link to="/data-quality" className="text-primary hover:underline">Adatminőség</Link></Code>.
        </p>
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
          <Link to="/emails" className="rounded-md border px-3 py-1.5 hover:bg-muted/40">Levelek</Link>
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