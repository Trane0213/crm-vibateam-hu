import { describe, expect, it } from "vitest";
import { dailyWork, dueBucket, salesOverview, salesFocusSections, type DailyLead } from "./daily-work";
const now = new Date("2026-11-03T12:28:00Z");
const lead: DailyLead = { id: "own", assigned_to: "ramon", status: "new", summary: "TESZT", source: "email_inbound", company_id: null,
  contact_id: null, created_at: "2026-11-03T10:00Z", next_step_type: null, next_step_due_at: null, pipeline_entered_at: null };
describe("Sales daily rules", () => {
  it("counts own preparation separately from active pipeline and won", () => {
    const rows = [lead, { ...lead, id: "pipeline", status: "quote_prep", pipeline_entered_at: "2026-11-03T10:00Z" },
      { ...lead, id: "other", assigned_to: "other" }, { ...lead, id: "lost", status: "lost" }];
    expect(salesOverview(rows, [], "ramon", 3)).toEqual({ prep: 1, pipeline: 1, openQuotes: 0, won: 3 });
  });
  it("counts only sent/negotiation current own open quotes, never drafts or closed versions", () => {
    const q = { id: "q", lead_id: "own", title: "TESZT", status: "sent", is_current: true };
    const quotes = [q, { ...q, id: "negotiation", status: "negotiation" }, { ...q, id: "draft", status: "draft" },
      { ...q, id: "old", is_current: false }, { ...q, id: "won", status: "won" },
      { ...q, id: "other", lead_id: "other" }, { ...q, id: "unknown", status: null }];
    expect(salesOverview([lead], quotes, "ramon", 0).openQuotes).toBe(2);
  });
  it("shows a lead once at its highest daily priority without changing source buckets", () => {
    const overdue = { ...lead, id: "overdue", next_step_due_at: "2026-11-02T10:00Z" };
    const today = { ...lead, id: "today", next_step_due_at: "2026-11-03T14:00Z" };
    const waiting = { ...lead, id: "waiting", status: "quote_sent" };
    const incomplete = { ...lead, id: "incomplete", created_at: "2026-10-01T10:00Z" };
    const d = dailyWork([overdue, today, lead, waiting, incomplete], [{ id: "q", lead_id: "waiting", title: "TESZT", status: "sent", is_current: true }], "ramon", false, now);
    expect(salesFocusSections(d).map(rows => rows.map(l => l.id))).toEqual([["overdue"], ["today"], ["own"], ["waiting"], ["incomplete"]]);
    expect(d.incomplete).toHaveLength(5);
  });
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