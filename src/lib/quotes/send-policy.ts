import { MAX_BYTES } from "@/lib/r2-policy";

/** S4: ajánlat-kiküldés szabályai — szerver és kliens közös, tesztelt. */
export const OUTBOUND_TOTAL_MAX = MAX_BYTES.outbound; // meglévő 20 MB-os kimenő korlát

export const isIdempotencyKey = (v: unknown): v is string =>
  typeof v === "string" && /^[A-Za-z0-9-]{16,64}$/.test(v);

/** A quoted attachment must actually be present, both in UI and on the server. */
export function checkReferencedAttachment(text: string, attachmentCount: number): string | null {
  const plain = text.replace(/<[^>]*>/g, " ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (attachmentCount === 0 && /\b(mellekelten|mellekelt|melleklet\w*|csatolt|csatolva|csatolmany\w*|attached|attachment\w*)\b/.test(plain)) {
    return "A levél csatolt ajánlatra hivatkozik, de nincs kiválasztott melléklet. Csatold az ajánlatot, vagy módosítsd a kísérőlevelet.";
  }
  return null;
}

/** Live Gmail evidence, not an editable CRM outbound flag, proves delivery. */
export function isVerifiedSentMessage(message: { id: string; labelIds?: string[]; internalDate?: string }, expectedId: string): boolean {
  const date = Number(message.internalDate);
  return message.id === expectedId && !!message.labelIds?.includes("SENT") && Number.isFinite(date) && date > 0;
}

export function checkOutboundSize(sizes: (number | null | undefined)[]): string | null {
  const total = sizes.reduce<number>((a, s) => a + (Number(s) || 0), 0);
  if (total > OUTBOUND_TOTAL_MAX) {
    return `A mellékletek összmérete ${(total / 1024 / 1024).toFixed(1)} MB — legfeljebb ${OUTBOUND_TOTAL_MAX / 1024 / 1024} MB küldhető. Válassz kevesebb fájlt, vagy küldd letöltési linkkel.`;
  }
  return null;
}

/** A kiválasztott dokumentumoknak mind az adott ajánlathoz kell tartozniuk. */
export function checkQuoteDocs(requested: string[], found: { id: string; quote_id: string }[], quoteId: string): string | null {
  const uniq = Array.from(new Set(requested));
  if (uniq.length !== requested.length) return "Ismétlődő melléklet.";
  if (found.length !== uniq.length || found.some((d) => d.quote_id !== quoteId)) return "A melléklet nem ehhez az ajánlathoz tartozik, vagy nem elérhető.";
  return null;
}

/**
 * Szerveroldali kiküldhetőség (az /api/gmail/send ajánlat-ágában, a küldési napló előtt).
 * Már kiküldött (zárolt) változat újraküldése nem tiltott — a duplikációt az idempotencia-kulcs védi.
 */
export function quoteSendBlocker(i: {
  status: string | null; kind: string | null; net: number | null; mismatch: boolean;
  itemCount: number; attachedDocTypes: string[]; extraAttachmentCount: number;
}): string | null {
  if (["withdrawn", "accepted", "rejected"].includes(i.status ?? "")) return "Visszavont vagy lezárt ajánlat nem küldhető ki.";
  if (i.kind !== "received_budget" && i.kind !== "viba_offer") return "Az ajánlat típusa nincs megadva.";
  if (i.kind === "viba_offer" && i.itemCount === 0) return "Saját VIBA-ajánlat tételek nélkül nem küldhető ki.";
  if (i.net == null || !(i.net > 0)) return "Az ajánlatnak nincs ellenőrzött, 0 Ft-nál nagyobb nettó összege — 0 Ft-os vagy hiányosan árazott ajánlat nem küldhető ki.";
  if (i.mismatch) return "A tételes és a megadott nettó összeg eltér — előbb javítsd.";
  if (i.attachedDocTypes.length + i.extraAttachmentCount === 0) return "Ajánlat melléklet nélkül nem küldhető ki.";
  if (i.kind === "received_budget" && !i.attachedDocTypes.some((t) => t === "priced_budget" || t === "sent_offer")) return "Az árazott költségvetést vagy a kiküldendő ajánlatfájlt csatolni kell.";
  return null;
}

/** Sikeres kiküldés utáni automatikus lépések: csak igazolt, nem duplikált, figyelmeztetés nélküli küldés után. */
export function postSendPlan(i: { ok: boolean; duplicate?: boolean; warning?: string | null; leadStatus: string | null; hasLead: boolean }) {
  const confirmed = i.ok && !i.duplicate && !i.warning;
  return {
    scheduleFollowup: confirmed,
    advancePipeline: confirmed && i.hasLead && (i.leadStatus === "quote_prep" || i.leadStatus === "follow_up"),
  };
}

/** Válaszfejlécek az eredeti szál utolsó leveléből (RFC 5322 In-Reply-To / References). */
export function replyHeadersFromThread(messages: { headers: { name: string; value: string }[] }[]): { inReplyTo: string; references: string; subject: string } | null {
  const last = messages[messages.length - 1];
  if (!last) return null;
  const h = (n: string) => last.headers.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value?.trim() ?? "";
  const id = h("Message-ID") || h("Message-Id");
  if (!/^<[^<>\s]+>$/.test(id)) return null;
  const refs = h("References").split(/\s+/).filter((r) => /^<[^<>\s]+>$/.test(r));
  if (!refs.includes(id)) refs.push(id);
  return { inReplyTo: id, references: refs.slice(-20).join(" "), subject: h("Subject") };
}
