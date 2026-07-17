import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, CalendarPlus, ClipboardList, BarChart3, Users, AlertTriangle, Calculator, FileDown } from "lucide-react";

export const Route = createFileRoute("/_authenticated/attendance/guide")({
  component: AttendanceGuide,
});

function Section({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-5 w-5 text-primary" />
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      <div className="space-y-2 text-sm text-muted-foreground leading-relaxed">{children}</div>
    </section>
  );
}

function AttendanceGuide() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="rounded-lg border bg-primary/5 p-5">
        <div className="mb-2 flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Jelenléti rendszer – működési útmutató</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Ez az útmutató röviden összefoglalja, hogyan kell a napi jelenlétet rögzíteni,
          időszakot összesíteni és a fizetést kiszámolni. A rendszer a korábbi Google Forms +
          Táblázat folyamatot váltja ki.
        </p>
      </div>

      <Section icon={Users} title="1. Dolgozók és projektek karbantartása">
        <p>
          A <strong>Dolgozók / projektek</strong> fülön vedd fel az új dolgozókat és aktív
          projekteket. Minden dolgozónál add meg a <strong>napidíjat</strong> (alapértelmezett),
          ezt a rendszer később a napi bejegyzéseknél automatikusan használja.
        </p>
        <p>
          Új projektet a rögzítés közben is létre tudsz hozni, nem kell előre felvenni. Az inaktív
          dolgozók / projektek eltűnnek a legördülő listákból, de a régi bejegyzéseknél megmaradnak.
        </p>
      </Section>

      <Section icon={CalendarPlus} title="2. Napi jelenlét rögzítése">
        <p>
          Az <strong>Új rögzítés</strong> fülön válaszd ki a <strong>dátumot</strong> és a{" "}
          <strong>projektet</strong>, majd pipáld be azokat a dolgozókat, akik aznap dolgoztak.
          Egyszerre több dolgozó is felvehető ugyanarra a projektre és napra.
        </p>
        <p>
          A napidíj mezőt csak akkor kell módosítani, ha az adott napon eltér a dolgozó
          alapértelmezett napidíjától (pl. túlóra, bónusz).
        </p>
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-foreground">
          <AlertTriangle className="mr-1 inline h-4 w-4 text-amber-600" />
          <strong>Duplikáció:</strong> egy dolgozónak egy napra csak egy bejegyzése lehet. Ha
          ugyanarra a napra újra rögzíted, a rendszer figyelmeztet. Ha be van pipálva a
          <em> „Meglévő bejegyzés felülírása”</em> kapcsoló, az új adat felülírja a régit,
          különben kihagyja.
        </p>
      </Section>

      <Section icon={ClipboardList} title="3. Napló – ellenőrzés és javítás">
        <p>
          A <strong>Napló</strong> fülön időszak, dolgozó és projekt szerint szűrhetsz. Itt
          tudod ellenőrizni a rögzített napokat, illetve javítani vagy törölni a hibás
          bejegyzéseket.
        </p>
      </Section>

      <Section icon={BarChart3} title="4. Időszak összesítése és fizetés">
        <p>
          Az <strong>Időszak</strong> fülön add meg a periódust (pl. hetibér, kétheti bér,
          havi bér – bármilyen dátumtartomány). A rendszer dolgozónként összesíti a napokat és
          a napidíjakat, projektenkénti bontásban is.
        </p>
        <p>Dolgozónként külön megadhatod:</p>
        <ul className="list-disc pl-6">
          <li><strong>Bérlet</strong> (transport / hozzáadódik a fizetéshez)</li>
          <li><strong>Előleg</strong> (levonódik a fizetésből)</li>
        </ul>
        <p className="rounded-md border bg-muted/50 p-3 text-foreground">
          <Calculator className="mr-1 inline h-4 w-4 text-primary" />
          <strong>Számítási képlet:</strong><br />
          <code>Fizetés = Ledolgozott napok napidíjainak összege + Bérlet − Előleg</code>
        </p>
        <p>
          A napidíjakat a rendszer naponta összegzi, így ha egy dolgozónak eltérő napidíjú
          napjai voltak (pl. túlóra), akkor is pontos lesz a végösszeg.
        </p>
      </Section>

      <Section icon={FileDown} title="5. CSV export">
        <p>
          Az összesítő oldalon az <strong>Export CSV</strong> gombbal letölthető az adott
          időszak fizetési kimutatása. A fájlt közvetlenül meg tudod nyitni Excelben vagy
          Google Sheetsben, ugyanúgy mint a korábbi táblázatot.
        </p>
      </Section>

      <Section icon={Users} title="6. Jogosultságok">
        <p>
          <strong>Owner:</strong> minden funkcióhoz hozzáfér – dolgozók, projektek,
          bejegyzések, előleg, bérlet, export.<br />
          <strong>Projektvezető (PM):</strong> jelenlétet rögzíthet és időszaki összesítőt
          lekérhet. A dolgozók és projektek szerkesztéséhez owner jogosultság kell.
        </p>
      </Section>

      <div className="rounded-lg border bg-muted/40 p-4 text-xs text-muted-foreground">
        Rövid napi rutin: <strong>Új rögzítés</strong> → dátum + projekt + dolgozók pipa →
        <strong> Mentés</strong>. Hó / hét végén: <strong>Időszak</strong> → dátumtartomány →
        bérlet / előleg megadása → <strong>Export CSV</strong>.
      </div>
    </div>
  );
}