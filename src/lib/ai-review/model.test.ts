import { describe, expect, it } from "vitest";
import { planReviews, reviewAllowance, isCreditError, nextStatusAfterFailure, areaSubmissionKey, areaIssueText, budapestDayStartIso, type PendingSignal } from "./model";

const sig = (p: Partial<PendingSignal>): PendingSignal => ({ id: p.signal_key ?? "x", signal_key: "k", domain: "sales", agent: "timothy", severity: "warning", title: "T", detail: {}, source_table: null, source_id: null, occurrences: 1, first_seen_at: "2026-11-13T10:00:00Z", ...p });
const cfg = { enabled: true, daily_review_limit: 6, daily_token_limit: 1_000_000, max_reviews_per_run: 2, paused_reason: null };

describe("planReviews", () => {
  it("no meaningful change → no plan (0 AI calls)", () => {
    expect(planReviews([], 3)).toEqual([]);
    expect(planReviews([sig({ severity: "info", signal_key: "document_needs_review:1" })], 3)).toEqual([]);
  });
  it("only the affected specialist area is planned", () => {
    const p = planReviews([sig({ signal_key: "sales_overdue:1" }), sig({ signal_key: "sales_no_next_step:2" })], 3);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ type: "area", agent: "timothy" });
    expect(p[0].signals).toHaveLength(2);
  });
  it("critical area goes first and slots bound the run", () => {
    const p = planReviews([sig({ signal_key: "project_no_pm:1", agent: "boss", domain: "projects" }), sig({ signal_key: "quote_sent_unproven:1", severity: "critical" })], 1);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ type: "area", agent: "timothy" });
  });
  it("feedback signals review the existing issue (reopened → rerun), one plan per issue", () => {
    const p = planReviews([sig({ signal_key: "issue_reopened:a:1", domain: "feedback", agent: "george", detail: { issue_id: "a" } }), sig({ signal_key: "issue_unreviewed:a", domain: "feedback", agent: "george", detail: { issue_id: "a" } })], 3);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ type: "issue", issueId: "a" });
  });
  it("zero slots → nothing", () => { expect(planReviews([sig({})], 0)).toEqual([]); });
});

describe("reviewAllowance", () => {
  it("paused, token limit and daily limit stop AI calls", () => {
    expect(reviewAllowance({ ...cfg, paused_reason: "credit" }, { reviewsToday: 0, tokensToday: 0 }).slots).toBe(0);
    expect(reviewAllowance(cfg, { reviewsToday: 0, tokensToday: 1_000_000 }).reason).toBe("token_limit");
    expect(reviewAllowance(cfg, { reviewsToday: 6, tokensToday: 0 }).reason).toBe("daily_limit");
  });
  it("per-run cap and remaining daily reviews", () => {
    expect(reviewAllowance(cfg, { reviewsToday: 0, tokensToday: 0 }).slots).toBe(2);
    expect(reviewAllowance(cfg, { reviewsToday: 5, tokensToday: 0 }).slots).toBe(1);
  });
});

describe("safety", () => {
  it("credit/rate-limit errors are recognised", () => {
    expect(isCreditError(Object.assign(new Error("x"), { code: "credit" }))).toBe(true);
    expect(isCreditError(new Error("429 credit_balance_exhausted"))).toBe(true);
    expect(isCreditError(new Error("timeout"))).toBe(false);
  });
  it("one retry, then failed", () => {
    expect(nextStatusAfterFailure(0)).toBe("pending");
    expect(nextStatusAfterFailure(1)).toBe("failed");
  });
  it("same signal group → same issue key (idempotent), order-independent", async () => {
    const a = await areaSubmissionKey("timothy", ["b", "a"]);
    expect(a).toBe(await areaSubmissionKey("timothy", ["a", "b"]));
    expect(a).not.toBe(await areaSubmissionKey("scarlet", ["a", "b"]));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  it("issue text marks suspicion and respects DB limits", () => {
    const t = areaIssueText("timothy", Array.from({ length: 40 }, (_, i) => sig({ signal_key: `s${i}`, detail: { lead_id: "00000000-0000-0000-0000-000000000000" } })));
    expect(t.description.length).toBeLessThanOrEqual(2000);
    expect(t.description).toContain("GYANÚ");
  });
  it("Budapest day start", () => {
    expect(budapestDayStartIso(new Date("2026-11-13T20:00:00Z"))).toBe("2026-11-12T23:00:00.000Z");
    expect(budapestDayStartIso(new Date("2026-07-01T21:30:00Z"))).toBe("2026-06-30T22:00:00.000Z");
  });
});
