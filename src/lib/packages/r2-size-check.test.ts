import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/r2.server", () => ({ r2Env: () => ({ accessKeyId: "AK", secretAccessKey: "SK", bucket: "b", endpoint: "https://acc.r2.cloudflarestorage.com" }) }));
import { parseByteLength, parseContentRangeTotal } from "./r2-multipart.server";
import { sizeVerdict } from "./packages.server";

describe("feltöltés utáni méretellenőrzés", () => {
  it("hiányzó Content-Length nem -1, hanem ismeretlen", () => {
    expect(parseByteLength(null)).toBeNull();
    expect(parseByteLength("")).toBeNull();
    expect(parseByteLength("-1")).toBeNull();
    expect(parseByteLength("904796836")).toBe(904796836);
  });
  it("a teljes méret a Content-Range fejlécből olvasható", () => {
    expect(parseContentRangeTotal("bytes 0-0/904796836")).toBe(904796836);
    expect(parseContentRangeTotal("bytes 0-0/*")).toBeNull();
    expect(parseContentRangeTotal(null)).toBeNull();
  });
  it("ismeretlen méret nem sérülés; csak pontos egyezés siker", () => {
    expect(sizeVerdict({ size: null }, 904796836)).toBe("unknown");
    expect(sizeVerdict(null, 904796836)).toBe("missing");
    expect(sizeVerdict({ size: 904796835 }, 904796836)).toBe("mismatch");
    expect(sizeVerdict({ size: 904796836 }, 904796836)).toBe("match");
  });
});
