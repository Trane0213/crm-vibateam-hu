import { describe, expect, it } from "vitest";
import { mergeRecordPages, normalizeRecordSearch, recordSearchSchema, RECORD_PAGE_SIZE, RECORD_SEARCH_DELAY, type RecordOption } from "./record-search-model";

const records: RecordOption[] = Array.from({ length: 5000 }, (_, i) => ({
  value: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  label: i === 4999 ? "Amper Studio" : `TESZT Cég ${String(i).padStart(4, "0")}`,
  detail: "TESZT Megrendelő", fields: {},
}));
describe("Nagy rekordlisták", () => {
  it("amper részletre megtalálja az 5000. rekordot is", () => {
    expect(records.filter((r) => normalizeRecordSearch(r.label).includes(normalizeRecordSearch("aMpEr"))).map((r) => r.label)).toEqual(["Amper Studio"]);
  });
  it("magyar ékezetek és kis/nagybetű nem befolyásolja a keresést", () => {
    expect(normalizeRecordSearch("ÁÉÍÓÖŐÚÜŰ")).toBe("aeiooouuu");
  });
  it("egy lap húsz rekordot tartalmaz", () => { expect(RECORD_PAGE_SIZE).toBe(20); });
  it("késlelteti a keresést", () => { expect(RECORD_SEARCH_DELAY).toBe(250); });
  it("mind az 5000 rekord lapozható duplikáció nélkül", () => {
    const pages = Array.from({ length: 250 }, (_, page) => ({ rows: records.slice(page * RECORD_PAGE_SIZE, (page + 1) * RECORD_PAGE_SIZE), hasMore: page < 249 }));
    expect(mergeRecordPages(pages)).toHaveLength(5000);
    expect(mergeRecordPages(pages)[4999].label).toBe("Amper Studio");
  });
  it("ismételt lap nem duplikál kiválasztható azonosítót", () => {
    const page = { rows: records.slice(0, 20), hasMore: true };
    expect(mergeRecordPages([page, page])).toHaveLength(20);
  });
  it("szerkesztéshez külön azonosító kereshető", () => {
    expect(recordSearchSchema.parse({ source: "companies", id: records[4999].value }).id).toBe(records[4999].value);
  });
  it("nem enged tetszőleges táblát vagy negatív lapot", () => {
    expect(recordSearchSchema.safeParse({ source: "auth.users" }).success).toBe(false);
    expect(recordSearchSchema.safeParse({ source: "companies", page: -1 }).success).toBe(false);
  });
});