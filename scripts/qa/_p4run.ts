import { identifyPage, buildRegistry } from "/dev-server/src/lib/plans/sheet-identify.ts";
import { buildCabinets } from "/dev-server/src/lib/plans/cabinet-bom.ts";
const all = JSON.parse(await Bun.file("/tmp/realplans/pages.json").text());
const sel = process.argv[2] ? new RegExp(process.argv[2]) : /./;
const files: any[] = [], pages: any[] = [];
for (const [name, pgs] of Object.entries<any>(all)) { if (!sel.test(name)) continue; const fn = name.replace(/^\d+_/, ""); files.push({ fileId: name, fileName: fn, path: null, origin: "fixture", pageCount: pgs.length, status: "read" });
  pgs.forEach((p: any, i: number) => pages.push({ fileId: name, page: i + 1, source: "text_layer", aiExtracted: false, width: p.w, height: p.hgt, items: p.items.map((x: any) => ({ s: x.s, x: x.x, y: x.y })), text: "" })); }
const ids = pages.map((p) => identifyPage(files.find((f) => f.fileId === p.fileId), p));
for (const i of ids) console.log(i.fileName.slice(0, 40).padEnd(40), i.page, "|", i.drawingNo?.value, i.drawingNo?.confidence, "| lap", i.sheetNo?.value, "/", i.sheetTotal?.value, "| rev", i.revision?.value, "| ", i.date?.value, "|", i.docType.value, "|", i.discipline.value, "| cab", i.cabinetIds.map((c) => c.id).join(","), "|", i.title?.value?.slice(0, 40));
const reg = buildRegistry(files, ids);
for (const d of reg.drawings) console.log("DRW", d.drawingNo, d.sheetNos, d.sheetTotal, d.revisions, d.dates, d.issues.map((x) => x.message));
for (const m of reg.matrix) console.log("MAT", m.fileName.slice(0, 40), m.status, m.readablePages, "/", m.pages);
const cabs = buildCabinets(files, pages, ids);
if (process.env.CAB) for (const c of cabs) { console.log("\nCAB", c.id, c.status, c.drawingNos, "enc:", c.enclosure?.description?.slice(0, 100));
  for (const l of c.lines) console.log("  ", l.cls.padEnd(10), String(l.qty).padStart(4), l.rating, l.poles, "|", l.description.slice(0, 50), "|", l.basis, "|", l.uncertain.join(" / ").slice(0, 120));
  for (const s of c.schematic) console.log("  SCH", s.cls, s.count, JSON.stringify(s.ratings));
  for (const r of c.reconciliation) console.log("  REC", r.cls, r.explicit, r.schematic, r.note);
  console.log("  circuits", c.circuits.length, c.circuits.slice(0, 30).map((x) => `${x.id}:${x.name ?? "-"}:${x.cable ?? "-"}:${x.powerW ?? "-"}`).join(" "));
  console.log("  refs", c.productRefs.map((r) => `${r.cls}/${r.poles}`).join(","), "rated", c.ratedData.map((r) => `${r.label}=${r.value}`).join("; "));
  console.log("  gaps", c.gaps, "\n  Q", c.questions); }
