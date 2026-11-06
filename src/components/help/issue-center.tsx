import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRouterState } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { submitIssue, listIssues, updateIssue } from "@/lib/issue-reports.functions";
import { issuePath, ISSUE_STATUS, ISSUE_CATEGORY, canPersistIssueCategory, type IssueCategory } from "@/lib/issue-reports-model";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function IssueCenter({ sourcePath }: { sourcePath?: string }) {
  const pathname = useRouterState({ select: s => s.location.pathname });
  const submit = useServerFn(submitIssue), list = useServerFn(listIssues), update = useServerFn(updateIssue);
  const [page, setPage] = useState(0), [description, setDescription] = useState(""), [expected, setExpected] = useState(""), [actual, setActual] = useState(""), [code, setCode] = useState("");
  const [category, setCategory] = useState<IssueCategory>("bug");
  const [path, setPath] = useState(() => issuePath(sourcePath ?? pathname)), [key, setKey] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["issue-reports", page], queryFn: () => list({ data: { page } }), retry: false });
  async function send() {
    if (!canPersistIssueCategory(category) || busy) return;
    const submissionKey = key ?? crypto.randomUUID(); setKey(submissionKey); setBusy(true); setError("");
    try { const r = await submit({ data: { submissionKey, pagePath: issuePath(path), description, expectedResult: expected, actualResult: actual, technicalCode: code } }); setSaved(r.id); setDescription(""); setExpected(""); setActual(""); setCode(""); setKey(null); setPage(0); await q.refetch(); }
    catch (e) { setError(e instanceof Error ? e.message : "A bejelentés nem menthető."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-6">
    <p className="text-sm text-muted-foreground">Csak az itt megadott szöveget mentjük. Ne írj be jelszót, tokent, ügyféllevelet vagy dokumentumtartalmat. Saját azonosítód, szerepköröd és a mentés ideje automatikusan rögzül.</p>
    <form className="space-y-3" onSubmit={e => { e.preventDefault(); void send(); }}>
      <Label htmlFor="issue-category">Miben kérsz segítséget?</Label>
      <Select value={category} disabled={busy} onValueChange={v => { if (v in ISSUE_CATEGORY) setCategory(v as IssueCategory); setSaved(null); }}><SelectTrigger id="issue-category"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(ISSUE_CATEGORY).map(([v, label]) => <SelectItem key={v} value={v}>{label}</SelectItem>)}</SelectContent></Select>
      {!canPersistIssueCategory(category) && <p role="status" className="rounded-md border border-status-warning/30 p-3 text-sm">Elmondhatod és előkészítheted ezt az ügyet, de külön kategóriaként még nem menthető. A bővített ügyjegyzék jóváhagyásra vár. A szöveg ezen az oldalon megmarad; oldalváltáskor nem tároljuk. George segítségét ettől függetlenül kérheted.</p>}
      <Label htmlFor="issue-path">Érintett oldal útvonala</Label><Input id="issue-path" value={path} onChange={e => setPath(e.target.value)} maxLength={250} disabled={busy} />
      {[{ id: "issue-description", label: "Röviden mi a probléma?", value: description, set: setDescription, max: 2000 }, { id: "issue-expected", label: "Mit vártál?", value: expected, set: setExpected, max: 1000 }, { id: "issue-actual", label: "Mi történt ténylegesen?", value: actual, set: setActual, max: 1000 }].map(f => <div key={f.id}><Label htmlFor={f.id}>{f.label}</Label><Textarea id={f.id} required maxLength={f.max} placeholder={f.id === "issue-description" ? "Írd le a saját szavaiddal, mit próbáltál csinálni, vagy min szeretnél változtatni." : undefined} value={f.value} onChange={e => f.set(e.target.value)} disabled={busy} /></div>)}
      <details><summary className="cursor-pointer text-sm text-muted-foreground">Technikai hibakód · nem kötelező</summary><Input aria-label="Technikai hibakód" value={code} onChange={e => setCode(e.target.value)} maxLength={80} pattern="[A-Za-z0-9_.:-]*" disabled={busy} /></details>
      {error && <p role="alert" className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">{error} A beírt szöveg megmaradt.</p>}
      {saved && <p role="status" className="break-all rounded-md border border-status-success/30 p-3 text-sm">Hibajegy mentve: {saved} · Új. A jelentések listájában visszakereshető.</p>}
      <Button type="submit" className="h-auto min-h-9 whitespace-normal text-left" disabled={!canPersistIssueCategory(category) || busy || !description.trim() || !expected.trim() || !actual.trim()}>{busy && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />}{busy ? "Hibajegy mentése…" : canPersistIssueCategory(category) ? "Hibajegy beküldése · nem indít AI-vizsgálatot" : "Új kategória mentése · jóváhagyásra vár"}</Button>
    </form>
    <section className="space-y-3 border-t pt-4"><h2 className="font-semibold">{q.data?.owner ? "Összes munkatársi hibajegy" : "Saját hibajegyeim"}</h2>
      {q.isLoading ? <p role="status">Hibajegyek betöltése…</p> : q.error ? <div role="alert"><p className="text-sm text-destructive">A hibajegyek nem tölthetők be.</p><Button size="sm" variant="outline" onClick={() => q.refetch()}>Lista újrapróbálása</Button></div> : !q.data?.rows.length ? <p className="text-sm text-muted-foreground">Még nincs látható jelentés.</p> : q.data.rows.map(row => <details key={row.id} className="rounded-md border p-3"><summary className="cursor-pointer break-words text-sm">{ISSUE_STATUS[row.status as keyof typeof ISSUE_STATUS]} · {row.description.slice(0, 90)}</summary><div className="space-y-2 pt-3 text-sm"><p className="break-all text-xs text-muted-foreground">{row.id} · {row.reporter_role} · {new Date(row.created_at).toLocaleString("hu-HU")} · {row.page_path}</p><p>{row.description}</p><p><strong>Elvárt:</strong> {row.expected_result}</p><p><strong>Tényleges:</strong> {row.actual_result}</p>{row.technical_code && <p>Hibakód: {row.technical_code}</p>}<p>Vizsgálati megjegyzés: {row.owner_note || "Még nincs tulajdonosi vizsgálati megjegyzés."}</p>{q.data.owner && <OwnerStatus row={row} save={async (status, note) => { await update({ data: { id: row.id, status, note, expectedUpdatedAt: row.updated_at } }); await q.refetch(); }} />}</div></details>)}
      {!!q.data && q.data.total > 20 && <div className="flex gap-2"><Button variant="outline" size="sm" disabled={!page} onClick={() => setPage(page - 1)}>Előző</Button><span>{page + 1}</span><Button variant="outline" size="sm" disabled={(page + 1) * 20 >= q.data.total} onClick={() => setPage(page + 1)}>Következő</Button></div>}
    </section>
    <p className="text-sm text-muted-foreground">Vizsgálat: még nem indult. Nem sikerült igazolni vagy kizárni a hibát. George technikai naplóvizsgálata, külső hibagyűjtés és fejlesztési lista: bekötésre / jóváhagyásra vár. A bejelentésedet akkor is megőrizheted, ha később használati kérdésnek bizonyul; ez nem a munkatárs hibáztatása.</p>
  </div>;
}
type Status = keyof typeof ISSUE_STATUS;
function OwnerStatus({ row, save }: { row: { status: string; owner_note: string }; save: (s: Status, n: string) => Promise<void> }) {
  const [status, setStatus] = useState(row.status as Status), [note, setNote] = useState(row.owner_note), [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <form className="space-y-2 border-t pt-3" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(""); try { await save(status, note); } catch (e) { setError(e instanceof Error ? e.message : "Nem menthető."); } finally { setBusy(false); } }}><select aria-label="Hibajegy státusza" className="w-full rounded-md border bg-background p-2" value={status} onChange={e => setStatus(e.target.value as Status)}>{Object.entries(ISSUE_STATUS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select><Textarea aria-label="Tulajdonosi vizsgálati megjegyzés" value={note} maxLength={2000} onChange={e => setNote(e.target.value)} placeholder="Bizonyított / Feltételezés / Nem vizsgálható – rögzítsd a megfigyelés forrását." />{error && <p role="alert" className="text-destructive">{error}</p>}<Button size="sm" disabled={busy}>{busy ? "Mentés…" : "Vizsgálati státusz és megjegyzés mentése"}</Button></form>;
}