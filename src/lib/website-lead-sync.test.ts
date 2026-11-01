import { describe, it, expect } from "vitest";
import {
  computeSignature,
  verifyRequestAuth,
  parseWebsiteLead,
  toQuoteRequestRow,
  SOURCE_TYPES,
  MAX_BODY_BYTES,
} from "./website-lead-sync";

const SECRET = "TESZT-secret-0123456789abcdef0123456789abcdef";
const NOW = 1_800_000_000;
const base = {
  lead_id: "11111111-2222-4333-8444-555555555555",
  created_at: "2026-11-01T10:00:00Z",
  source_type: "lakossagi",
  name: "TESZT Elek",
  email: "teszt@example.com",
  phone: "+36301234567",
};
const body = (o: object) => JSON.stringify({ ...base, ...o });

describe("auth", () => {
  it("accepts a valid signature", async () => {
    const raw = body({});
    const sig = await computeSignature(SECRET, String(NOW), raw);
    expect(await verifyRequestAuth({ secret: SECRET, timestamp: String(NOW), signature: `sha256=${sig}`, rawBody: raw, nowSeconds: NOW })).toBeNull();
  });
  it("rejects missing headers", async () => {
    expect(await verifyRequestAuth({ secret: SECRET, timestamp: null, signature: null, rawBody: "{}", nowSeconds: NOW })).toBe("missing_auth");
  });
  it("rejects wrong signature", async () => {
    const sig = await computeSignature("other-secret", String(NOW), "{}");
    expect(await verifyRequestAuth({ secret: SECRET, timestamp: String(NOW), signature: sig, rawBody: "{}", nowSeconds: NOW })).toBe("invalid_signature");
  });
  it("rejects tampered body", async () => {
    const sig = await computeSignature(SECRET, String(NOW), body({}));
    expect(await verifyRequestAuth({ secret: SECRET, timestamp: String(NOW), signature: sig, rawBody: body({ name: "x" }), nowSeconds: NOW })).toBe("invalid_signature");
  });
  it("rejects timestamp older than 5 minutes (replay)", async () => {
    const ts = String(NOW - 301);
    const sig = await computeSignature(SECRET, ts, "{}");
    expect(await verifyRequestAuth({ secret: SECRET, timestamp: ts, signature: sig, rawBody: "{}", nowSeconds: NOW })).toBe("stale_timestamp");
  });
});

describe("payload", () => {
  it("accepts every website source_type", () => {
    for (const t of SOURCE_TYPES) {
      const r = parseWebsiteLead(body({ source_type: t }));
      expect(r.ok, t).toBe(true);
    }
  });
  it("rejects unknown source_type", () => {
    expect(parseWebsiteLead(body({ source_type: "spam" })).ok).toBe(false);
  });
  it("rejects missing lead_id", () => {
    const { lead_id: _x, ...rest } = base;
    const r = parseWebsiteLead(JSON.stringify(rest));
    expect(r.ok === false && r.code).toBe("validation_failed");
  });
  it("rejects invalid JSON", () => {
    const r = parseWebsiteLead("{nope");
    expect(r.ok === false && r.code).toBe("invalid_json");
  });
  it("rejects unknown extra fields", () => {
    expect(parseWebsiteLead(body({ service_role: "x" })).ok).toBe(false);
  });
  it("accepts callback without email", () => {
    const r = parseWebsiteLead(body({ source_type: "visszahivas", email: null }));
    expect(r.ok).toBe(true);
  });
  it("rejects callback without phone", () => {
    const r = parseWebsiteLead(body({ source_type: "visszahivas", phone: null }));
    expect(r.ok).toBe(false);
  });
  it("rejects public/signed URL as attachment", () => {
    for (const p of ["https://x.supabase.co/storage/v1/object/public/a.pdf", "../etc/passwd", "a.pdf?token=abc"]) {
      const r = parseWebsiteLead(body({ attachment_path: p }));
      expect(r.ok === false && r.code, p).toBe("invalid_attachment");
    }
  });
  it("accepts storage path attachment", () => {
    expect(parseWebsiteLead(body({ attachment_path: "quote-attachments/2026/abc.pdf" })).ok).toBe(true);
  });
  it("rejects oversized payload object", () => {
    const r = parseWebsiteLead(body({ payload: { big: "x".repeat(40000) } }));
    expect(r.ok === false && r.code).toBe("payload_too_large");
  });
  it("body limit is 64 KB", () => {
    expect(MAX_BODY_BYTES).toBe(65536);
  });
  it("maps to quote_requests row keeping source id and fields", () => {
    const r = parseWebsiteLead(body({ source_type: "tarsashazi", utm: { utm_source: "google" }, source_page: "/tarsashaz" }));
    if (!r.ok) throw new Error("expected ok");
    const row = toQuoteRequestRow(r.data, "2026-11-01T10:00:05Z");
    expect(row.source_lead_id).toBe(base.lead_id);
    expect(row.form_type).toBe("tarsashazi");
    expect(row.utm).toEqual({ utm_source: "google" });
    expect(row.attachment_url).toBeNull();
  });
});
