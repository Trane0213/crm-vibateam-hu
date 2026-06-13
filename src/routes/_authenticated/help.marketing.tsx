import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BookOpen, Sparkles, ShieldCheck, Copy, ArrowRightCircle,
  Building2, CheckCircle2, AlertTriangle, Users,
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
          <BookOpen className="h-3.5 w-3.5" /> Felhasználói kézikönyv
        </div>
        <h1 className="text-2xl font-semibold">Marketing CRM használata</h1>
        <p className="text-sm text-muted-foreground">
          Rövid útmutató a napi marketing munkafolyamatokhoz: lead rögzítés,
          minősítés, adatminőség, duplikáció és értékesítői átadás.
        </p>
      </header>

      <Section icon={Sparkles} title="1. Új érdeklődő létrehozása">
        <p>Nyisd meg: <Code>Ma → Új érdeklődő</Code></p>
        <p>Töltsd ki:</p>
        <ul className="ml-5 list-disc space-y-0.5">
          <li>Név</li>
          <li>Email</li>
          <li>Cég</li>
          <li>Rövid leírás</li>
        </ul>
        <p>A rendszer automatikusan:</p>
        <ul className="ml-5 list-disc space-y-0.5">
          <li>ellenőrzi a duplikációt (ha nyitott lead van, jelzi és átirányít)</li>
          <li>összekapcsolja a céggel email domain alapján</li>
          <li>kitölti a hiányzó cégadatokat a meglévő rekordokból</li>
        </ul>
      </Section>

      <Section icon={CheckCircle2} title="2. Lead minősítése">
        <div className="grid gap-2 sm:grid-cols-2">
          <Status name="Új"                       desc="Még nem történt kapcsolatfelvétel." tone="info" />
          <Status name="Kapcsolatfelvétel alatt"  desc="Email vagy telefon megtörtént."     tone="primary" />
          <Status name="Átadható"                 desc="Az érdeklődő megfelelő."            tone="warning" />
          <Status name="Nem érdekes"              desc="Lezárt lead."                       tone="danger" />
        </div>
      </Section>

      <Section icon={ShieldCheck} title="3. Adatminőség ellenőrzése">
        <p>Minden leadhez tartozik adatminőségi mutató:</p>
        <ul className="space-y-1.5">
          <li className="flex items-center gap-2">
            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">85% +</Badge>
            <span>Zöld — átadható az értékesítőnek.</span>
          </li>
          <li className="flex items-center gap-2">
            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">50–84%</Badge>
            <span>Sárga — ajánlott pótolni a hiányzó adatokat.</span>
          </li>
          <li className="flex items-center gap-2">
            <Badge variant="destructive">&lt; 50%</Badge>
            <span>Piros — hiányos, csak felülbírálással adható át.</span>
          </li>
        </ul>
      </Section>

      <Section icon={Building2} title="4. Cégadatok javítása">
        <p>Nyisd meg: <Code>Ügyfelek → Cég adatlap</Code></p>
        <p>A rendszer automatikusan:</p>
        <ul className="ml-5 list-disc space-y-0.5">
          <li>domaint keres a kapcsolattartók emailjeiből</li>
          <li>weboldalt generál a domain alapján</li>
          <li>települést ismer fel a jegyzetekből</li>
          <li>összekapcsolja a kontaktokat és leadeket a cég domainjével</li>
        </ul>
        <p>Az ajánlott javítások egy kattintással alkalmazhatók a Cég adatlap
        Adatminőség paneljéből.</p>
      </Section>

      <Section icon={Copy} title="5. Duplikációk kezelése">
        <p>Nyisd meg: <Code><Link to="/data-quality" className="text-primary hover:underline">Adatminőség → Duplikátum központ</Link></Code></p>
        <p>Itt látható:</p>
        <ul className="ml-5 list-disc space-y-0.5">
          <li>azonos cégek (cégnév vagy adószám egyezés)</li>
          <li>hasonló cégek (név hasonlóság ≥ 85%)</li>
          <li>azonos email több kapcsolattartón</li>
          <li>azonos telefonszám több kapcsolattartón</li>
        </ul>
        <p className="text-xs text-muted-foreground">
          A rendszer csak jelez — az összevonáshoz kézi áttekintés szükséges.
        </p>
      </Section>

      <Section icon={ArrowRightCircle} title="6. Lead átadása értékesítőnek">
        <p>Feltételek:</p>
        <ul className="ml-5 list-disc space-y-0.5">
          <li>cég hozzárendelve</li>
          <li>lead minősítve (státusz = Átadható)</li>
          <li>adatminőség ellenőrizve</li>
        </ul>
        <p>Lépések:</p>
        <ol className="ml-5 list-decimal space-y-0.5">
          <li>Állítsd a státuszt <em>Átadható</em>-ra a lead részleteknél.</li>
          <li>A jobb oldali panelen válassz értékesítőt.</li>
          <li>Kattints az <em>Átadás és lezárás</em> gombra.</li>
        </ol>
        <p>A rendszer:</p>
        <ul className="ml-5 list-disc space-y-0.5">
          <li>egy <em>handoff</em> típusú utókövetést rögzít az idővonalon</li>
          <li>az értékesítő számára láthatóvá teszi a leadet</li>
        </ul>
      </Section>

      <Section icon={ShieldCheck} title="7. CRM egészség és Identity Strength">
        <p>
          Minden cég adatlapján megjelenik az „Identity Strength" mutató (0–100).
          A rendszer a meglévő adatok alapján számolja:
        </p>
        <ul className="ml-5 list-disc space-y-0.5">
          <li>cégnév — 20 pont</li>
          <li>adószám — 30 pont</li>
          <li>email domain — 25 pont</li>
          <li>weboldal — 15 pont</li>
          <li>min. 1 ismert email — 10 pont</li>
        </ul>
        <p className="text-xs text-muted-foreground">
          Az erős azonosító (≥ 2 mező kitöltve) később NAV / OPTEN / Céginfó lekérdezés alapja lesz.
        </p>
      </Section>

      <Section icon={AlertTriangle} title="8. Rendszer figyelmeztetések">
        <p>A marketing dashboardon külön blokkban látható:</p>
        <ul className="ml-5 list-disc space-y-0.5">
          <li>hiányos cégadatok száma (D5)</li>
          <li>potenciális duplikációk (D4)</li>
          <li>kapcsolattartó konfliktusok (D4)</li>
          <li>linkeletlen leadek és email threadek (D3 + D5)</li>
        </ul>
        <p>Bármelyik sorra kattintva a <Code><Link to="/data-quality" className="text-primary hover:underline">Data Quality Center</Link></Code> nyílik meg.</p>
      </Section>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4" /> Hova ugorj most?
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 text-sm">
          <Link to="/today" className="rounded-md border px-3 py-1.5 hover:bg-muted/40">Marketing munkafelület</Link>
          <Link to="/data-quality" className="rounded-md border px-3 py-1.5 hover:bg-muted/40">Adatminőség</Link>
          <Link to="/leads" className="rounded-md border px-3 py-1.5 hover:bg-muted/40">Érdeklődők</Link>
          <Link to="/customers" className="rounded-md border px-3 py-1.5 hover:bg-muted/40">Ügyfelek</Link>
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
  tone: "info" | "primary" | "warning" | "danger";
}) {
  const cls =
    tone === "info"    ? "border-sky-200 bg-sky-50 text-sky-900" :
    tone === "primary" ? "border-primary/30 bg-primary/5 text-foreground" :
    tone === "warning" ? "border-amber-200 bg-amber-50 text-amber-900" :
                         "border-destructive/30 bg-destructive/5 text-destructive";
  return (
    <div className={`rounded-md border p-2 text-xs ${cls}`}>
      <div className="font-semibold">{name}</div>
      <div className="mt-0.5 opacity-80">{desc}</div>
    </div>
  );
}