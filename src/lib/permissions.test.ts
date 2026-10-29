import { describe, it, expect } from "vitest";
import { normalizeRole } from "./permissions";

describe("normalizeRole", () => {
  it("szerepkör nélküli felhasználó nem kap tulajdonosi jogot", () => {
    expect(normalizeRole(null)).toBe("marketing");
    expect(normalizeRole("")).toBe("marketing");
  });
  it("owner marad owner", () => {
    expect(normalizeRole("owner")).toBe("owner");
  });
});
