import { describe, it, expect } from "vitest";
import { buildNextStepPayload, canEnterPipeline, localDateTimeToIso, splitIsoToLocal } from "./next-step-input";

describe("next step input", () => {
  it("kézi dátum + idő nem-null ISO határidővé alakul és visszaolvasható", () => {
    const p = buildNextStepPayload("phone", "2026-11-05", "14:30", " hívás ");
    expect(p).not.toBeNull();
    expect(p!.next_step_due_at).toBe(new Date(2026, 10, 5, 14, 30).toISOString());
    expect(splitIsoToLocal(p!.next_step_due_at)).toEqual({ date: "2026-11-05", time: "14:30" });
    expect(p!.next_step_note).toBe("hívás");
  });
  it("hiányos dátum/idő/típus nem ad mentési payloadot", () => {
    expect(buildNextStepPayload("phone", "2026-11-05", "", "")).toBeNull();
    expect(buildNextStepPayload("phone", "", "09:00", "")).toBeNull();
    expect(buildNextStepPayload("", "2026-11-05", "09:00", "")).toBeNull();
    expect(localDateTimeToIso("2026-02-30", "09:00")).toBeNull();
    expect(localDateTimeToIso("2026-11-05", "25:00")).toBeNull();
  });
  it("Pipeline csak aktivitás + típus + mentett határidő esetén", () => {
    const base = { activityCount: 1, nextStepType: "phone", nextStepDueAt: "2026-11-05T08:00:00Z", inPipeline: false, isLost: false };
    expect(canEnterPipeline(base)).toBe(true);
    expect(canEnterPipeline({ ...base, nextStepDueAt: null })).toBe(false);
    expect(canEnterPipeline({ ...base, nextStepType: null })).toBe(false);
    expect(canEnterPipeline({ ...base, activityCount: 0 })).toBe(false);
    expect(canEnterPipeline({ ...base, inPipeline: true })).toBe(false);
  });
});
