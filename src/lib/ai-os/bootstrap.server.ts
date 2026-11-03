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
import { registerGmailContextTools } from "./adapters/gmail-tools.server";
import { registerDocumentTools } from "./adapters/document-tools.server";
import { registerEmailSendTool } from './adapters/email-send-action.server';

let booted = false;

export function ensureBootstrapped() {
  if (booted) return;
  registerCoreTools();
  registerCrmTools();
  registerGmailContextTools();
  registerDocumentTools();
  registerEmailSendTool();
  registerGoogleAdsTools();
  registerKgTools();
  registerWebsiteTools();
  booted = true;
}