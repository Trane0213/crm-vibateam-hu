/**
 * AI OS — bootstrap. SERVER-ONLY.
 *
 * A runtime használata előtt EGYSZER hívd a `ensureBootstrapped()`-et.
 * Idempotens. Itt regisztrálunk MINDEN tool-szolgáltatót, hogy a registry
 * teljes legyen, mire egy LLM-hívás indul.
 */

import { registerCoreTools } from "./core-tools.server";
import { registerCrmTools } from "./adapters/crm-tools.server";
import { registerGoogleAdsTools } from "./adapters/google-ads-tools.server";
import { registerKgTools } from "./adapters/kg-tools.server";
import { registerWebsiteTools } from "./adapters/website-tools.server";

let booted = false;

export function ensureBootstrapped() {
  if (booted) return;
  registerCoreTools();
  registerCrmTools();
  registerGoogleAdsTools();
  registerKgTools();
  registerWebsiteTools();
  booted = true;
}