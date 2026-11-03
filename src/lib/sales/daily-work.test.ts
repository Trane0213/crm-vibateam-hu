import { describe, expect, it } from "vitest";
import { dailyWork, dueBucket, type DailyLead } from "./daily-work";
const now = new Date("2026-11-03T12:28:00Z");
const lead: DailyLead = { id: "own", assigned_to: "ramon", status: "new", summary: "TESZT", source: "email_inbound", company_id: null,
  contact_id: null, created_at: "2026-11-03T10:00Z", next_step_type: null, next_step_due_at: null, pipeline_entered_at: null };
describe("Sales daily rules", () => {
  it("only includes own cases for sales, all open cases for owner", () => {
    const rows = [lead, { ...lead, id: "other", assigned_to: "other" }, { ...lead, id: "closed", status: "won" }];
    expect(dailyWork(rows, [], "ramon", false, now).leads.map(l => l.id)).toEqual(["own"]);
    expect(dailyWork(rows, [], "owner", true, now).leads.map(l => l.id)).toEqual(["own", "other"]);
  });
  it("uses Budapest midnight, not UTC or browser day", () => {
    expect(dueBucket("2026-11-02T22:30:00Z", now)).toBe("overdue"); // Budapest 23:30 yesterday
    expect(dueBucket("2026-11-02T23:30:00Z", now)).toBe("today"); // Budapest 00:30 today
    expect(dueBucket("2026-11-03T23:30:00Z", now)).toBe("tomorrow");
  });
  it("handles both DST change days", () => {
    expect(dueBucket("2026-03-28T23:30Z", new Date("2026-03-29T12:00Z"))).toBe("today");
    expect(dueBucket("2026-10-25T22:30Z", new Date("2026-10-25T12:00Z"))).toBe("today");
  });
  it("excludes drafts and old quote versions from waiting", () => {
    const l = { ...lead, status: "quote_sent" };
    const quote = { id: "q", lead_id: "own", title: "TESZT", status: "draft", is_current: true };
    expect(dailyWork([l], [quote], "ramon", false, now).waiting).toHaveLength(0);
    expect(dailyWork([l], [{ ...quote, status: "sent", is_current: false }], "ramon", false, now).waiting).toHaveLength(0);
    expect(dailyWork([l], [{ ...quote, status: "sent" }], "ramon", false, now).waiting.map(l => l.id)).toEqual(["own"]);
  });
  it("classifies new and incomplete without treating a completed activity as a task", () => {
    const result = dailyWork([lead], [], "ramon", false, now);
    expect(result.newLeads.map(l => l.id)).toEqual(["own"]);
    expect(result.incomplete.map(l => l.id)).toEqual(["own"]);
    expect(result.buckets.today).toHaveLength(0);
  });
});