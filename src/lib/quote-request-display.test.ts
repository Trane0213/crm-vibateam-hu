import { describe, it, expect } from "vitest";
import { receivedAt, isTestRequest, payloadEntries } from "./quote-request-display";

describe("quote request display", () => {
  it("uses website original time over CRM sync time", () => {
    expect(receivedAt({ created_at: "2026-11-01T20:00:00Z", source_created_at: "2026-06-12T08:00:00Z" })).toBe("2026-06-12T08:00:00Z");
  });
  it("falls back to CRM created_at when no source time", () => {
    expect(receivedAt({ created_at: "2026-11-01T20:00:00Z", source_created_at: null })).toBe("2026-11-01T20:00:00Z");
  });
  it("marks TESZT records", () => {
    expect(isTestRequest({ name: "TESZT – VIBA WEB CRM E2E" })).toBe(true);
    expect(isTestRequest({ name: "Kovács Tesztelő Béla" })).toBe(false);
    expect(isTestRequest({ name: "Nagy Anna", message: "Ajánlatot kérek" })).toBe(false);
  });
  it("drops secrets, signed urls and blobs from payload", () => {
    const e = Object.fromEntries(
      payloadEntries({
        name: "Anna",
        api_key: "x",
        file: "https://x/y?token=abc",
        img: "data:image/png;base64,AAAA",
        meta: { page: "/kapcsolat" },
        html: "<script>alert(1)</script>",
      }),
    );
    expect(e).toEqual({ name: "Anna", "meta.page": "/kapcsolat", html: "<script>alert(1)</script>" });
  });
  it("returns empty list for non-object payload", () => {
    expect(payloadEntries(null)).toEqual([]);
  });
});
