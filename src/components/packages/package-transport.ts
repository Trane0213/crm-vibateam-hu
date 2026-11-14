// A feltöltőmotor böngészős átvitele: szerverfüggvények + közvetlen R2 PUT + tartalék szerveres továbbítás.
import { supabase } from "@/integrations/supabase/client";
import { DirectBlocked, type Transport } from "@/lib/packages/upload-engine";
import {
  completePackageFile, recordPackageParts, registerPackageFiles, signPackageParts,
} from "@/lib/packages/packages.functions";

export function makeTransport(packageId: string): Transport {
  return {
    register: (files) => registerPackageFiles({ data: { packageId, files } }),
    sign: (fileId, parts) => signPackageParts({ data: { fileId, parts } }),
    async putDirect(url, body, signal) {
      let res: Response;
      try { res = await fetch(url, { method: "PUT", body, signal }); }
      catch (e) {
        if (signal?.aborted) throw e;
        // Kapcsolódási vagy CORS-hiba: ha van hálózat, a tartalék úton próbáljuk.
        if (typeof navigator === "undefined" || navigator.onLine !== false) throw new DirectBlocked();
        throw e;
      }
      if (!res.ok) throw new Error(`storage_${res.status}`);
    },
    async relay(fileId, partNumber, md5, body, signal) {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const res = await fetch(`/api/package-upload-part?fileId=${encodeURIComponent(fileId)}&part=${partNumber}`, {
        method: "POST", body, signal,
        headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "x-part-md5": md5, "content-type": "application/octet-stream" },
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j?.code === "integrity" ? "integrity" : j?.error ?? `relay_${res.status}`); }
    },
    record: async (fileId, parts) => { await recordPackageParts({ data: { fileId, parts } }); },
    complete: (fileId) => completePackageFile({ data: { fileId } }),
  };
}
