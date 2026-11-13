import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRouterState } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { submitIssue, listIssues, updateIssue, reviewIssue, verifyIssue, listIssueFindings } from "@/lib/issue-reports.functions";
import { issuePath, ISSUE_STATUS, ISSUE_CATEGORY, ISSUE_SPECIALIST, ISSUE_EVIDENCE, AI_REVIEW_LIMIT, type IssueCategory } from "@/lib/issue-reports-model";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Row = Awaited<ReturnType<typeof listIssues>>["rows"][number];
type Status = keyof typeof ISSUE_STATUS;
const msg = (e: unknown, d: string) => (e instanceof Error ? e.message : d);

export function IssueCenter({ sourcePath }: { sourcePath?: string }) {
  const pathname = useRouterState({ select: s => s.location.pathname });
  const submit = useServerFn(submitIssue), list = useServerFn(listIssues), update = useServerFn(updateIssue), review = useServerFn(reviewIssue), verify = useServerFn(verifyIssue);
  const [page, setPage] = useState(0), [description, setDescription] = useState(""), [expected, setExpected] = useState(""), [actual, setActual] = useState(""), [code, setCode] = useState("");
  const [category, setCategory] = useState<IssueCategory>("bug");
  const [path, setPath] = useState(() => issuePath(sourcePath ?? pathname)), [key, setKey] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState<string | null>(null), [aiNote, setAiNote] = useState("");
  const q = useQuery({ queryKey: ["issue-reports", page], queryFn: () => list({ data: { page } }), retry: false });
  async function send() {
    if (busy) return;
    const submissionKey = key ?? crypto.randomUUID(); setKey(submissionKey); setBusy(true); setError(""); setAiNote("");
    try {
      const r = await submit({ data: { submissionKey, category, pagePath: issuePath(path), description, expectedResult: expected, actualResult: actual, technicalCode: code } });
      setSaved(r.id); setDescription(""); setExpected(""); setActual(""); setCode(""); setKey(null); setPage(0); await q.refetch();
      setAiNote("George vizsgálja a bejelentést…");
      try { await review({ data: { id: r.id, mode: "initial" } }); setAiNote("George és a szakértő AI vizsgálata elkészült — lent a listában látod."); }
      catch (e) { setAiNote(msg(e, "Az AI-vizsgálat most nem futott le; a bejelentés mentve van.")); }
      await q.refetch();
    } catch (e) { setError(msg(e, "A bejelentés nem menthető.")); }
    finally { setBusy(false); }
  }
  return <div className="space-y-6">
    <p className="text-sm text-muted-foreground">Csak az itt megadott szöveget mentjük. Ne írj be jelszót, tokent, ügyféllevelet vagy dokumentumtartalmat. Beküldés után George automatikusan megvizsgálja, és a megfelelő szakértő AI (Scarlet, Timothy vagy Boss) szempontjából javaslatot ad. Ez javaslat, nem igazolt hiba.</p>
    <form className="space-y-3" onSubmit={e => { e.preventDefault(); void send(); }}>
      <Label htmlFor="issue-category">Miben kérsz segítséget?</Label>
      <Select value={category} disabled={busy} onValueChange={v => { if (v in ISSUE_CATEGORY) setCategory(v as IssueCategory); setSaved(null); }}><SelectTrigger id="issue-category"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(ISSUE_CATEGORY).map(([v, label]) => <SelectItem key={v} value={v}>{label}</SelectItem>)}</SelectContent></Select>
      <Label htmlFor="issue-path">Érintett oldal útvonala</Label><Input id="issue-path" value={path} onChange={e => setPath(e.target.value)} maxLength={250} disabled={busy} />
      {[{ id: "issue-description", label: "Röviden mi a probléma vagy az igény?", value: description, set: setDescription, max: 2000 }, { id: "issue-expected", label: "Mit vártál?", value: expected, set: setExpected, max: 1000 }, { id: "issue-actual", label: "Mi történt ténylegesen?", value: actual, set: setActual, max: 1000 }].map(f => <div key={f.id}><Label htmlFor={f.id}>{f.label}</Label><Textarea id={f.id} required maxLength={f.max} value={f.value} onChange={e => f.set(e.target.value)} disabled={busy} /></div>)}
      <details><summary className="cursor-pointer text-sm text-muted-foreground">Technikai hibakód · nem kötelező</summary><Input aria-label="Technikai hibakód" value={code} onChange={e => setCode(e.target.value)} maxLength={80} pattern="[A-Za-z0-9_.:-]*" disabled={busy} /></details>
      {error && <p role="alert" className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">{error} A beírt szöveg megmaradt.</p>}
      {saved && <p role="status" className="break-all rounded-md border border-status-success/30 p-3 text-sm">Bejelentés mentve: {saved}. {aiNote}</p>}
      <Button type="submit" className="h-auto min-h-9 whitespace-normal text-left" disabled={busy || !description.trim() || !expected.trim() || !actual.trim()}>{busy && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />}{busy ? "Mentés és George vizsgálata…" : "Beküldés George-nak"}</Button>
    </form>
    <section className="space-y-3 border-t pt-4"><h2 className="font-semibold">{q.data?.owner ? "Összesített fejlesztési lista (minden bejelentés)" : "Saját bejelentéseim"}</h2>
      {q.isLoading ? <p role="status">Betöltés…</p> : q.error ? <div role="alert"><p className="text-sm text-destructive">A bejelentések nem tölthetők be.</p><Button size="sm" variant="outline" onClick={() => q.refetch()}>Újrapróbálás</Button></div> : !q.data?.rows.length ? <p className="text-sm text-muted-foreground">Még nincs látható bejelentés.</p> : q.data.rows.map(row => <IssueRow key={row.id} row={row} owner={q.data.owner} mine={row.reporter_id === q.data.me} refresh={async () => { await q.refetch(); }} review={mode => review({ data: { id: row.id, mode } })} verify={(verdict, feedback) => verify({ data: { id: row.id, verdict, feedback } })} save={(status, note) => update({ data: { id: row.id, status, note, expectedUpdatedAt: row.updated_at } })} />)}
      {!!q.data && q.data.total > 20 && <div className="flex gap-2"><Button variant="outline" size="sm" disabled={!page} onClick={() => setPage(page - 1)}>Előző</Button><span>{page + 1}</span><Button variant="outline" size="sm" disabled={(page + 1) * 20 >= q.data.total} onClick={() => setPage(page + 1)}>Következő</Button></div>}
    </section>
  </div>;
}

function IssueRow({ row, owner, mine, refresh, review, verify, save }: { row: Row; owner: boolean; mine: boolean; refresh: () => Promise<void>; review: (m: "initial" | "recheck" | "rerun") => Promise<unknown>; verify: (v: "resolved" | "not_resolved", f: string) => Promise<unknown>; save: (s: Status, n: string) => Promise<unknown> }) {
  const [busy, setBusy] = useState(""), [err, setErr] = useState(""), [feedback, setFeedback] = useState("");
  async function run(label: string, fn: () => Promise<unknown>) { setBusy(label); setErr(""); try { await fn(); await refresh(); } catch (e) { setErr(msg(e, "Nem sikerült.")); } finally { setBusy(""); } }
  const canAi = row.ai_run_count < AI_REVIEW_LIMIT;
  return <details className="rounded-md border p-3" open={mine && row.status === "checking"}>
    <summary className="cursor-pointer break-words text-sm">{ISSUE_STATUS[row.status as Status]} · {ISSUE_CATEGORY[row.category as IssueCategory] ?? row.category} · {row.description.slice(0, 90)}</summary>
    <div className="space-y-2 pt-3 text-sm">
      <p className="break-all text-xs text-muted-foreground">{row.id} · {row.reporter_role} · {new Date(row.created_at).toLocaleString("hu-HU")} · {row.page_path}</p>
      <p>{row.description}</p><p><strong>Elvárt:</strong> {row.expected_result}</p><p><strong>Tényleges:</strong> {row.actual_result}</p>{row.technical_code && <p>Hibakód: {row.technical_code}</p>}
      <div className="rounded-md border bg-muted/40 p-3"><p className="font-medium">AI-vizsgálat{row.ai_specialist ? ` · ${ISSUE_SPECIALIST[row.ai_specialist as keyof typeof ISSUE_SPECIALIST]}` : ""}{row.ai_evidence ? ` · ${ISSUE_EVIDENCE[row.ai_evidence as keyof typeof ISSUE_EVIDENCE]}` : ""}</p>
        <p className="whitespace-pre-wrap">{row.ai_analysis || "Még nem készült AI-vizsgálat."}</p>
        {canAi && !row.ai_analyzed_at && <Button size="sm" variant="outline" className="mt-2" disabled={!!busy} onClick={() => run("ai", () => review("initial"))}>{busy === "ai" ? "George vizsgál…" : "George vizsgálatának indítása"}</Button>}
        {canAi && !!row.ai_analyzed_at && (owner || mine) && <Button size="sm" variant="outline" className="mt-2" disabled={!!busy} onClick={() => run("ai2", () => review(row.status === "checking" ? "recheck" : "rerun"))}>{busy === "ai2" ? "George és a szakértők vizsgálnak…" : row.status === "checking" ? "Utóellenőrzés kérése George-tól" : "Újravizsgálat"}</Button>}
        <p className="pt-1 text-xs text-muted-foreground">Vizsgálatok: {row.ai_run_count}/{AI_REVIEW_LIMIT}. George és a szakértő AI-k a te jogosultságoddal, csak olvasva vizsgálnak; semmit nem módosítanak. AI-állítás önmagában nem bizonyíték.</p>
        {!!row.ai_analyzed_at && <ExpertReports issueId={row.id} stamp={row.ai_analyzed_at} />}</div>
      <p>Tulajdonosi megjegyzés: {row.owner_note || "Még nincs."}</p>
      {row.reporter_verdict && <p><strong>Bejelentő visszajelzése:</strong> {row.reporter_verdict === "resolved" ? "Megoldódott" : "Nem oldódott meg"}{row.reporter_feedback ? ` — ${row.reporter_feedback}` : ""}</p>}
      {mine && row.status === "checking" && <div className="space-y-2 rounded-md border border-status-warning/40 p-3"><p className="font-medium">A javítás elkészült. Kérjük, próbáld ki: megoldódott a probléma?</p>
        <Textarea aria-label="Visszajelzés a javításról" maxLength={1000} value={feedback} onChange={e => setFeedback(e.target.value)} placeholder="Nem kötelező: mit tapasztaltál?" />
        <div className="flex flex-wrap gap-2"><Button size="sm" disabled={!!busy} onClick={() => run("ok", () => verify("resolved", feedback))}>{busy === "ok" ? "Mentés…" : "Igen, megoldódott"}</Button><Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("no", () => verify("not_resolved", feedback))}>{busy === "no" ? "Mentés…" : "Nem, még hibás"}</Button></div></div>}
      {err && <p role="alert" className="text-destructive">{err}</p>}
      {owner && <OwnerStatus row={row} busy={!!busy} save={(status, note) => run("save", async () => { await save(status, note); if (status === "checking" && row.status !== "checking" && canAi) { try { await review("recheck"); } catch { /* recheck is optional; status already saved */ } } })} />}
    </div>
  </details>;
}

function OwnerStatus({ row, busy, save }: { row: { status: string; owner_note: string }; busy: boolean; save: (s: Status, n: string) => Promise<void> }) {
  const [status, setStatus] = useState(row.status as Status), [note, setNote] = useState(row.owner_note);
  return <form className="space-y-2 border-t pt-3" onSubmit={e => { e.preventDefault(); void save(status, note); }}><select aria-label="Státusz" className="w-full rounded-md border bg-background p-2" value={status} onChange={e => setStatus(e.target.value as Status)}>{Object.entries(ISSUE_STATUS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select><Textarea aria-label="Tulajdonosi megjegyzés" value={note} maxLength={2000} onChange={e => setNote(e.target.value)} placeholder="Bizonyított / Feltételezés / Nem vizsgálható – rögzítsd a forrást." /><p className="text-xs text-muted-foreground">„Ellenőrzés alatt” állapotra váltáskor George utóellenőrzési lépéseket ír, és a bejelentő felkérést kap a kipróbálásra.</p><Button size="sm" disabled={busy}>{busy ? "Mentés…" : "Státusz és megjegyzés mentése"}</Button></form>;
}

type Finding = Awaited<ReturnType<typeof listIssueFindings>>[number];
const AGENT_LABEL: Record<string, string> = { george: "George · összegzés", scarlet: "Scarlet · Marketing", timothy: "Timothy · Sales", boss: "Boss · Projektek", michael: "Michael · Google Ads" };
const REPORT_STATUS: Record<string, string> = { answered: "Megválaszolva", insufficient_data: "Nincs elég adat", out_of_scope: "Nem a szakterülete", blocked: "Akadályozott", invalid_format: "Nem értelmezhető válasz" };
const BASIS: Record<string, { label: string; cls: string }> = {
  source_fact: { label: "Forrásra hivatkozik (azonosító ellenőrizve)", cls: "border-status-success/40 text-status-success" },
  ai_inference: { label: "AI-következtetés", cls: "border-status-info/40 text-status-info" },
  unverified: { label: "Nem ellenőrzött", cls: "border-status-warning/40 text-status-warning" },
};
const CONF: Record<string, string> = { low: "alacsony", medium: "közepes", high: "magas" };
type Src = { type?: string; id?: string; label?: string };
type Fnd = { statement?: string; basis?: string; sources?: Src[] };
type Act = { action?: string; owner_role?: string };

function ExpertReports({ issueId, stamp }: { issueId: string; stamp: string }) {
  const load = useServerFn(listIssueFindings);
  const q = useQuery({ queryKey: ["issue-findings", issueId, stamp], queryFn: () => load({ data: { id: issueId } }), retry: false });
  if (q.isLoading) return <p role="status" className="pt-2 text-xs text-muted-foreground">Szakértői jelentések betöltése…</p>;
  if (q.error) return <p role="alert" className="pt-2 text-xs text-destructive">A szakértői jelentések nem tölthetők be.</p>;
  if (!q.data?.length) return null;
  return <div className="space-y-2 pt-3"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Szakértői jelentések ({q.data.length})</p>{q.data.map((f) => <ReportCard key={f.id} f={f} />)}</div>;
}

function ReportCard({ f }: { f: Finding }) {
  const findings = (Array.isArray(f.findings) ? f.findings : []) as Fnd[];
  const actions = (Array.isArray(f.recommended_actions) ? f.recommended_actions : []) as Act[];
  const questions = (Array.isArray(f.open_questions) ? f.open_questions : []) as string[];
  return <details className="rounded-md border bg-background p-2" open={f.contribution === "coordinator"}>
    <summary className="cursor-pointer text-sm"><span className="font-medium">{AGENT_LABEL[f.agent_id] ?? f.agent_id}</span> · {REPORT_STATUS[f.report_status] ?? f.report_status} · megbízhatóság: {CONF[f.confidence] ?? f.confidence} · {new Date(f.created_at).toLocaleString("hu-HU")}</summary>
    <div className="space-y-2 pt-2 text-sm">
      {f.summary && <p className="whitespace-pre-wrap">{f.summary}</p>}
      <p className="text-xs text-muted-foreground">Ellenőrzött forrás-hivatkozás: {f.verified_source_count} · nem ellenőrzött állítás: {f.unverified_claim_count}</p>
      {!!findings.length && <ul className="space-y-1">{findings.map((x, i) => { const b = BASIS[x.basis ?? "unverified"] ?? BASIS.unverified; return <li key={i} className="rounded border p-2"><span className={`mr-2 inline-block rounded border px-1.5 text-xs ${b.cls}`}>{b.label}</span>{x.statement}{!!x.sources?.length && <span className="block break-all pt-1 text-xs text-muted-foreground">Forrás: {x.sources.map((s) => `${s.label ? s.label + " " : ""}(${s.type ?? "?"}: ${s.id})`).join("; ")}</span>}</li>; })}</ul>}
      {!!actions.length && <div><p className="text-xs font-medium">Javasolt lépések — mind emberi döntést / jóváhagyást igényel:</p><ul className="list-disc pl-5">{actions.map((a, i) => <li key={i}>{a.action}{a.owner_role ? ` (${a.owner_role})` : ""}</li>)}</ul></div>}
      {!!questions.length && <div><p className="text-xs font-medium">Nyitott kérdések:</p><ul className="list-disc pl-5">{questions.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
    </div>
  </details>;
}
