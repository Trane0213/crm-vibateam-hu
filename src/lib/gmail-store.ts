/**
 * Per-user Gmail connection-key tárolása böngészőben (localStorage).
 *
 * Megj.: A rendszer per-user OAuth-ot használ. A jelenlegi sémában nincs hely
 * a token DB-ben tárolására, ezért minden felhasználó böngészője lokálisan
 * tárolja a saját `connectionAPIKey`-jét (lovack_…), auth.uid-ra kulcsolva.
 * Új böngészőből újra OAuth kell. A kulcs maga is a saját Gmail-fiókjához
 * kötött; más felhasználó akkor sem tudja használni, ha valahogy ellopná.
 */

const PREFIX = "viba-gmail-conn:";
const EMAIL_PREFIX = "viba-gmail-email:";

export function getGmailConnection(authUid: string | null | undefined): {
  apiKey: string | null;
  email: string | null;
} {
  if (!authUid || typeof window === "undefined") return { apiKey: null, email: null };
  try {
    return {
      apiKey: window.localStorage.getItem(PREFIX + authUid),
      email: window.localStorage.getItem(EMAIL_PREFIX + authUid),
    };
  } catch {
    return { apiKey: null, email: null };
  }
}

export function setGmailConnection(
  authUid: string,
  apiKey: string,
  email: string | null,
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PREFIX + authUid, apiKey);
  if (email) window.localStorage.setItem(EMAIL_PREFIX + authUid, email);
}

export function clearGmailConnection(authUid: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(PREFIX + authUid);
  window.localStorage.removeItem(EMAIL_PREFIX + authUid);
}