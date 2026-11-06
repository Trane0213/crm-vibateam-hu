import { describe, expect, it } from "vitest";
import { canAccessRoute, type RoleSlug } from "./permissions";
import { HELP_GUIDES, HELP_PATHS } from "./help-guide";
describe("szerepkörsúgó hozzáférés", () => {
  for (const role of ["marketing", "sales", "owner", "project_manager"] as RoleSlug[]) {
    it(`${role} minden súgóhivatkozása engedélyezett`, () => {
      expect(canAccessRoute(role, HELP_PATHS[role])).toBe(true);
      expect(canAccessRoute(role, "/help")).toBe(true);
      for (const step of HELP_GUIDES[role]) expect(canAccessRoute(role, step.path)).toBe(true);
    });
  }
});