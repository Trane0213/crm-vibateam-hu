import { describe, expect, it } from "vitest";
import { prepActivityInput, prepActivityPayload } from "./prep-activity";

const input = { leadId: "e1d4afb6-3ba6-4ea6-b04e-4ef1a0b045b0", type: "call" as const, result: "Nem vette fel" };
describe("completed sales preparation activity", () => {
  it("accepts call and email but not a completed meeting", () => {
    expect(prepActivityInput.safeParse(input).success).toBe(true);
    expect(prepActivityInput.safeParse({ ...input, type: "email" }).success).toBe(true);
    expect(prepActivityInput.safeParse({ ...input, type: "meeting" }).success).toBe(false);
  });
  it("rejects caller supplied dates", () => {
    expect(prepActivityInput.safeParse({ ...input, when: "2026-11-05T10:00" }).success).toBe(false);
    expect(prepActivityInput.safeParse({ ...input, due_date: "2026-11-05T10:00Z" }).success).toBe(false);
  });
  it("records a completed attempt and note using exactly the server clock", () => {
    const payload = prepActivityPayload(input, null, new Date("2026-11-03T12:28:00Z"));
    expect(payload).toMatchObject({ completed: true, result: "Nem vette fel",
      due_date: "2026-11-03T12:28:00.000Z", created_at: "2026-11-03T12:28:00.000Z" });
  });
});