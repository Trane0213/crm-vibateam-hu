/**
 * AI OS — bootstrap. SERVER-ONLY.
 *
 * A runtime használata előtt EGYSZER hívd a `ensureBootstrapped()`-et.
 * Idempotens. Itt regisztrálunk MINDEN tool-szolgáltatót, hogy a registry
 * teljes legyen, mire egy LLM-hívás indul.
 */

import { registerCoreTools } from "./core-tools.server";

let booted = false;

export function ensureBootstrapped() {
  if (booted) return;
  registerCoreTools();
  // CRM adapter regisztráció — lazy, hogy a core ne függjön CRM-től importban.
  // Ide kerül a jövőben: registerCrmTools(), registerMarketingTools(), stb.
  booted = true;
}