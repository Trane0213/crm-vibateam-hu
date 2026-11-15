import { describe, it, expect } from "vitest";
import { dailyWork, type DailyLead } from "@/lib/sales/daily-work";
import { salesKpis, salesTasks, taskTarget } from "./sales-today";

const now = new Date("2026-11-15T10:00:00Z");
const base = (id: string, over: Partial<DailyLead>): DailyLead => ({ id, assigned_to: "u1", status: "contacted", summary: id, source: null, company_id: null, contact_id: "c", created_at: "2026-10-01T00:00:00Z", next_step_type: "call", next_step_due_at: "2026-11-20T09:00:00Z", pipeline_entered_at: null, ...over });

describe("Értékesítés – Ma", () => {
  const leads = [
    base("late", { next_step_due_at: "2026-11-10T09:00:00Z" }),
    base("today", { next_step_due_at: "2026-11-15T15:00:00Z", pipeline_entered_at: "2026-11-01T00:00:00Z" }),
    base("nocontact", { contact_id: null }),
    base("other", { assigned_to: "u2" }),
  ];
  const d = dailyWork(leads, [], "u1", false, now);
  it("a számlálók a meglévő napi szabályból jönnek, más felelős ügye nem számít", () => {
    expect(salesKpis(d)).toEqual({ active: 3, today: 1, overdue: 1, missing: 1 });
  });
  it("egy ügy csak egyszer szerepel, lejárt elöl", () => {
    const t = salesTasks(d);
    expect(t.map((x) => x.id)).toEqual(["late", "today", "nocontact"]);
    expect(t[0].label).toBe("Lejárt teendő");
  });
  it("minden napi teendő az új munkaterület ügyoldalát nyitja meg", () => {
    expect(taskTarget({ id: "a" })).toEqual({ to: "/munka/ugy/$id", params: { id: "a" } });
  });
});
