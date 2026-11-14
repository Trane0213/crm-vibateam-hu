/**
 * Ajánlati dokumentum feltöltése — az EGYETLEN kliensoldali útvonal: szerver által generált R2-kulcs (/api/r2-upload,
 * r2-policy szabályok) + quote_documents sor a hívó saját RLS-ével. A dokumentumkezelő és az ajánlatcsomag is ezt használja.
 */
import { supabase } from "@/integrations/supabase/client";
import type { QUOTE_DOC_CATEGORIES } from "@/lib/r2-policy";

export type QuoteDocCategory = (typeof QUOTE_DOC_CATEGORIES)[number];

export async function uploadQuoteDocument(quoteId: string, file: File, category: QuoteDocCategory): Promise<{ key: string }> {
  const fd = new FormData();
  fd.append("file", file, file.name);
  fd.append("purpose", "quote");
  fd.append("targetId", quoteId);
  fd.append("category", category);
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  const res = await fetch("/api/r2-upload", { method: "POST", body: fd, headers: token ? { authorization: `Bearer ${token}` } : {} });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j?.key) throw new Error(j?.error ?? `Feltöltés sikertelen (HTTP ${res.status})`);
  const ins = await supabase.from("quote_documents" as any).insert({
    quote_id: quoteId, name: file.name, file_url: j.key, document_type: category,
    mime_type: file.type || null, size_bytes: file.size ?? null,
  });
  if (ins.error) throw ins.error;
  return { key: j.key as string };
}
