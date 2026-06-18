/**
 * EGYSZER FUTTATHATÓ szerver oldali historikus email helyreállító.
 * Service role-lal fut, RLS-t bypassolja.
 *
 * Lépések:
 *  1. Összes email_threads bejárása lapozva.
 *  2. participants alapján contact keresés (contacts.email).
 *  3. contact → company_id származtatás.
 *  4. lead keresés (leads.email) → lead_id + származtatott company/contact.
 *  5. domain → companies.website fallback.
 *  6. Hiányzó email_threads.{company_id,contact_id,lead_id} kitöltése.
 *  7. Ugyanezeknek a mezőknek a visszaírása a kapcsolódó emails sorokra.
 *
 * A futás után a route fájlt töröljük.
 */
import { createFileRoute } from "@tanstack/react-router";

const PUBLIC_DOMAINS = new Set([
  "gmail.com","googlemail.com","yahoo.com","yahoo.co.uk","yahoo.hu",
  "hotmail.com","hotmail.hu","outlook.com","outlook.hu","live.com","msn.com",
  "icloud.com","me.com","mac.com","freemail.hu","citromail.hu","vipmail.hu",
  "indamail.hu","t-online.hu","proton.me","protonmail.com",
]);

function extractDomain(input?: string | null): string | null {
  if (!input) return null;
  const s = String(input).trim().toLowerCase();
  if (!s) return null;
  const at = s.includes("@") ? s.split("@")[1] : s;
  const clean = at.replace(/^https?:\/\//, "").replace(/^www\./, "")
    .split("/")[0].split("?")[0].split("#")[0].trim();
  if (!clean || !clean.includes(".")) return null;
  return clean;
}
const isPublicDomain = (d?: string | null) => !d || PUBLIC_DOMAINS.has(d.toLowerCase());

export const Route = createFileRoute("/api/public/admin/historical-email-backfill")({
  server: {
    handlers: {
      POST: async () => {
        try {
        const { getAdminClient } = await import("@/integrations/supabase/server");
        const admin = getAdminClient();

        // ---- 1. Lookup táblák ----
        const { data: companies } = await admin
          .from("companies").select("id,website")
          .not("website", "is", null).limit(20000);
        const domainMap = new Map<string, string>();
        for (const c of (companies ?? []) as Array<{ id: string; website: string | null }>) {
          const d = extractDomain(c.website);
          if (d && !isPublicDomain(d)) domainMap.set(d, c.id);
        }

        type CRef = { contact_id: string | null; company_id: string | null };
        const emailToContact = new Map<string, CRef>();
        {
          let off = 0;
          while (true) {
            const { data, error } = await admin
              .from("contacts").select("id,email,company_id")
              .not("email", "is", null)
              .order("id", { ascending: true })
              .range(off, off + 999);
            if (error) throw error;
            const rows = data ?? [];
            for (const c of rows as Array<{ id: string; email: string; company_id: string | null }>) {
              const key = c.email.trim().toLowerCase();
              if (!key) continue;
              const ex = emailToContact.get(key);
              if (!ex) emailToContact.set(key, { contact_id: c.id, company_id: c.company_id });
              else {
                if (ex.contact_id !== c.id) ex.contact_id = null;
                if (ex.company_id !== c.company_id) ex.company_id = null;
              }
            }
            if (rows.length < 1000) break;
            off += rows.length;
          }
        }

        type LRef = { lead_id: string | null; company_id: string | null; contact_id: string | null };
        const emailToLead = new Map<string, LRef>();
        {
          let off = 0;
          while (true) {
            const { data, error } = await admin
              .from("leads").select("id,company_id,contact_id")
              .not("contact_id", "is", null)
              .order("id", { ascending: true })
              .range(off, off + 999);
            if (error) throw error;
            const rows = data ?? [];
            for (const l of rows as Array<{ id: string; company_id: string | null; contact_id: string | null }>) {
              // derive email from contact map
              let key: string | null = null;
              for (const [em, ref] of emailToContact) {
                if (ref.contact_id === l.contact_id) { key = em; break; }
              }
              if (!key) continue;
              const ex = emailToLead.get(key);
              if (!ex) emailToLead.set(key, { lead_id: l.id, company_id: l.company_id, contact_id: l.contact_id });
              else {
                if (ex.lead_id !== l.id) ex.lead_id = null;
                if (ex.company_id !== l.company_id) ex.company_id = null;
                if (ex.contact_id !== l.contact_id) ex.contact_id = null;
              }
            }
            if (rows.length < 1000) break;
            off += rows.length;
          }
        }

        // ---- 2. Threadek bejárása ----
        const { count: totalCount } = await admin
          .from("email_threads").select("id", { count: "exact", head: true });
        const { count: missingBefore } = await admin
          .from("email_threads").select("id", { count: "exact", head: true })
          .is("company_id", null);

        let threadsProcessed = 0;
        let threadsUpdated = 0;
        let emailsUpdated = 0;
        let unmatched = 0;
        const errors: string[] = [];

        const PAGE = 500;
        let offset = 0;
        while (true) {
          const { data: page, error } = await admin
            .from("email_threads")
            .select("id,participants,company_id,contact_id,lead_id")
            .order("id", { ascending: true })
            .range(offset, offset + PAGE - 1);
          if (error) { errors.push(error.message); break; }
          const batch = page ?? [];
          if (batch.length === 0) break;

          for (const t of batch as Array<{ id: string; participants: string[] | null; company_id: string | null; contact_id: string | null; lead_id: string | null }>) {
            threadsProcessed++;
            let mCompany = t.company_id;
            let mContact = t.contact_id;
            let mLead = t.lead_id;
            const parts = (t.participants ?? []).map((p) => String(p ?? "").trim().toLowerCase()).filter(Boolean);

            for (const k of parts) {
              const ref = emailToContact.get(k);
              if (!ref) continue;
              if (!mContact && ref.contact_id) mContact = ref.contact_id;
              if (!mCompany && ref.company_id) mCompany = ref.company_id;
              if (mContact && mCompany) break;
            }
            if (!mLead || !mCompany || !mContact) {
              for (const k of parts) {
                const ref = emailToLead.get(k);
                if (!ref) continue;
                if (!mLead && ref.lead_id) mLead = ref.lead_id;
                if (!mCompany && ref.company_id) mCompany = ref.company_id;
                if (!mContact && ref.contact_id) mContact = ref.contact_id;
                if (mLead && mCompany && mContact) break;
              }
            }
            if (!mCompany) {
              for (const p of t.participants ?? []) {
                const d = extractDomain(p);
                if (d && !isPublicDomain(d) && domainMap.has(d)) {
                  mCompany = domainMap.get(d)!;
                  break;
                }
              }
            }

            const patch: Record<string, string> = {};
            if (mCompany && mCompany !== t.company_id) patch.company_id = mCompany;
            if (mContact && mContact !== t.contact_id) patch.contact_id = mContact;
            if (mLead && mLead !== t.lead_id) patch.lead_id = mLead;

            if (Object.keys(patch).length) {
              const { error: uErr } = await admin.from("email_threads").update(patch).eq("id", t.id);
              if (uErr) { errors.push(`thread ${t.id}: ${uErr.message}`); continue; }
              threadsUpdated++;

              for (const [field, value] of Object.entries(patch)) {
                const { count, error: eErr } = await admin
                  .from("emails")
                  .update({ [field]: value }, { count: "exact" })
                  .eq("thread_id", t.id)
                  .is(field, null);
                if (eErr) { errors.push(`emails(${field}) ${t.id}: ${eErr.message}`); continue; }
                emailsUpdated += count ?? 0;
              }
            } else if (!t.company_id && !mCompany) {
              unmatched++;
            }
          }

          if (batch.length < PAGE) break;
          offset += batch.length;
        }

        const { count: missingAfter } = await admin
          .from("email_threads").select("id", { count: "exact", head: true })
          .is("company_id", null);

        return Response.json({
          ok: true,
          totals: {
            threads_total: totalCount ?? 0,
            threads_without_company_before: missingBefore ?? 0,
            threads_without_company_after: missingAfter ?? 0,
            threads_processed: threadsProcessed,
            threads_updated: threadsUpdated,
            emails_updated: emailsUpdated,
            unmatched_threads: unmatched,
          },
          errors: errors.slice(0, 25),
          error_count: errors.length,
        });
        } catch (e: any) {
          return Response.json({ ok: false, error: String(e?.message ?? e), stack: String(e?.stack ?? "") }, { status: 500 });
        }
      },
    },
  },
});