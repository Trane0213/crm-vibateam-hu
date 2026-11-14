/**
 * Projekt alapadatainak pótlása az Átadás fülön: helyszín, határidő és —
 * kizárólag Tulajdonosnak — projektvezető. A meglévő projekt-mentési utat
 * használja (`useUpsert("projects")`, RLS `projects_write`), csak a ténylegesen
 * megváltozott mezőket küldi; hiba esetén a beírt érték megmarad.
 */
import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RecordCombobox } from "@/components/resource/record-combobox";
import { humanizeSupabaseError, useUpsert } from "@/lib/db-hooks";
import { projectBasicsPatch } from "@/lib/handoff/project-basics";

export function ProjectBasicsForm({
  project, canEdit, canAssignPm, pmLabel,
}: {
  project: { id: string; address?: string | null; deadline?: string | null; project_manager_user_id?: string | null };
  canEdit: boolean;
  canAssignPm: boolean;
  pmLabel: string;
}) {
  const upsert = useUpsert("projects");
  const [address, setAddress] = useState(project.address ?? "");
  const [deadline, setDeadline] = useState((project.deadline ?? "").slice(0, 10));
  const [pm, setPm] = useState(project.project_manager_user_id ?? "");
  const [error, setError] = useState<string | null>(null);
  // Másik projekt vagy sikeres visszaolvasás után a mezők a mentett értéket mutatják.
  useEffect(() => {
    setAddress(project.address ?? ""); setDeadline((project.deadline ?? "").slice(0, 10)); setPm(project.project_manager_user_id ?? "");
  }, [project.id, project.address, project.deadline, project.project_manager_user_id]);

  const patch = projectBasicsPatch(project, { address, deadline, pm: canAssignPm ? pm : undefined });
  const dirty = Object.keys(patch).length > 0;

  if (!canEdit) {
    return (
      <section aria-label="Projekt alapadatai" className="rounded-lg border bg-card p-3 text-xs text-muted-foreground">
        A helyszínt és a határidőt a projektvezető vagy a Tulajdonos pótolja. A te szerepköröd itt csak olvas.
      </section>
    );
  }
  return (
    <section aria-label="Projekt alapadatai" className="rounded-lg border bg-card p-3">
      <h3 className="text-sm font-semibold">Alapadatok pótlása</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">A megnyerés ezeket nem kéri be. Csak a megváltozott mező mentődik, a projekt többi adata változatlan.</p>
      <form
        className="mt-3 grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!dirty) return;
          setError(null);
          upsert.mutate({ id: project.id, ...patch }, { onError: (err) => setError(humanizeSupabaseError(err)) });
        }}
      >
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`addr-${project.id}`}>Helyszín címe</Label>
          <Input id={`addr-${project.id}`} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="pl. 1111 Budapest, TESZT utca 1." disabled={upsert.isPending} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`dl-${project.id}`}>Határidő</Label>
          <Input id={`dl-${project.id}`} type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} disabled={upsert.isPending} />
        </div>
        <div className="space-y-1.5">
          <Label>Projektvezető</Label>
          {canAssignPm ? (
            <RecordCombobox source="v_sales_user_load" value={pm} onChange={setPm} label="Projektvezető" disabled={upsert.isPending} />
          ) : (
            <div className="flex min-h-10 min-w-0 flex-col justify-center rounded-md border bg-muted/30 px-3 py-1.5 text-sm"><span className="break-words">{pmLabel}</span><span className="text-[11px] text-muted-foreground">Csak a Tulajdonos módosíthatja.</span></div>
          )}
        </div>
        {error && <p role="alert" className="text-xs text-destructive sm:col-span-2">A mentés nem sikerült — a beírt értékek megmaradtak. {error}</p>}
        <div className="flex justify-end sm:col-span-2">
          <Button type="submit" size="sm" disabled={!dirty || upsert.isPending}>
            {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {upsert.isPending ? "Mentés…" : dirty ? "Alapadatok mentése" : "Nincs változás"}
          </Button>
        </div>
      </form>
    </section>
  );
}
