import { expect, it } from "vitest";
import { dailyWork, type DailyLead } from "./daily-work";
import { salesWorkspaceView } from "./workspace-view";
const now = new Date("2026-11-06T12:00:00Z");
const lead = (id: string, extra: Partial<DailyLead> = {}): DailyLead => ({ id, assigned_to: "me", status: "contacted", summary: "TESZT", source: null, company_id: null, contact_id: null, created_at: now.toISOString(), next_step_type: "phone", next_step_due_at: "2026-11-06T14:00:00Z", pipeline_entered_at: now.toISOString(), ...extra });
it("preserves own scope, terminal exclusion and priority deduplication", () => {
  const view = salesWorkspaceView(dailyWork([lead("own"), lead("other", { assigned_to: "other" }), lead("won", { status: "won" })], [], "me", false, now), now);
  expect(view.focus.map(row => row.id)).toEqual(["own"]);
  expect(view.stages.flatMap(stage => stage.rows).map(row => row.id)).toEqual(["own"]);
  expect(view.upcoming.map(row => row.id)).toEqual(["own"]);
});
it("closing uses pipeline-entered contract rows; quote stages remain unchanged", () => {
  const data = dailyWork([lead("contract", { status: "contract" }), lead("prep", { status: "quote_prep" }), lead("sent", { status: "quote_sent" }), lead("follow", { status: "follow_up" }), lead("not-entered", { status: "contract", pipeline_entered_at: null })], [], "me", false, now);
  const view = salesWorkspaceView(data, now);
  expect(view.closing).toBe(1);
  expect(view.stages.find(stage => stage.key === "quote")?.rows.map(row => row.id)).toEqual(["sent", "follow"]);
  expect(data.leads.find(row => row.id === "follow")?.status).toBe("follow_up");
});