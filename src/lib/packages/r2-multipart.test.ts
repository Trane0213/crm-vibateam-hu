import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/r2.server", () => ({ r2Env: () => ({ accessKeyId: "AK", secretAccessKey: "SK", bucket: "b", endpoint: "https://acc.r2.cloudflarestorage.com" }) }));
import { completeXml, normEtag, parseListParts, parseUploadId, presignPart } from "./r2-multipart.server";

describe("R2 többrészes feltöltés", () => {
  it("UploadId és darablista értelmezése, lapozás", () => {
    expect(parseUploadId("<InitiateMultipartUploadResult><UploadId>abc-1</UploadId></InitiateMultipartUploadResult>")).toBe("abc-1");
    const x = parseListParts(`<ListPartsResult><IsTruncated>true</IsTruncated><NextPartNumberMarker>2</NextPartNumberMarker><Part><PartNumber>1</PartNumber><ETag>&quot;AB12&quot;</ETag><Size>5</Size></Part><Part><PartNumber>2</PartNumber><ETag>"cd34"</ETag><Size>3</Size></Part></ListPartsResult>`);
    expect(x).toEqual({ parts: [{ partNumber: 1, etag: "ab12", size: 5 }, { partNumber: 2, etag: "cd34", size: 3 }], truncated: true, next: 2 });
    expect(normEtag('"X"')).toBe("x");
  });
  it("lezáró XML a darabok sorrendjében", () => {
    expect(completeXml([{ partNumber: 1, etag: "a" }, { partNumber: 2, etag: "b" }])).toBe('<CompleteMultipartUpload><Part><PartNumber>1</PartNumber><ETag>"a"</ETag></Part><Part><PartNumber>2</PartNumber><ETag>"b"</ETag></Part></CompleteMultipartUpload>');
  });
  it("az aláírt darab-URL csak az adott darabra és feltöltésre szól", () => {
    const u = new URL(presignPart("document-packages/project/x/y/z/original/a.pdf", "UP 1", 7, 3600));
    expect(u.pathname).toBe("/b/document-packages/project/x/y/z/original/a.pdf");
    expect(u.searchParams.get("partNumber")).toBe("7");
    expect(u.searchParams.get("uploadId")).toBe("UP 1");
    expect(u.searchParams.get("X-Amz-Expires")).toBe("3600");
    expect(u.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });
});
