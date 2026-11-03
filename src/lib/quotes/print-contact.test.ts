import { describe, expect, it } from "vitest";
import { quotePrintContactId } from "./print-contact";

describe("ajánlat PDF kapcsolattartó", () => {
  it("az ajánlat kiválasztott kapcsolattartóját használja", () => {
    expect(quotePrintContactId({ contact_id: "quote-contact" })).toBe("quote-contact");
  });
  it("üres ajánlatválasztásnál nem helyettesíti másik ügy kapcsolattartójával", () => {
    expect(quotePrintContactId({ contact_id: null })).toBeNull();
  });
});