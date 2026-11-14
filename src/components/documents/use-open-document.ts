/**
 * Dokumentum megnyitása a meglévő, szerveroldalon jogosultság-ellenőrzött
 * `r2PresignDownload` úton. Az új lapot a kattintással egy időben nyitjuk meg
 * (különben a mobil böngészők letiltják), az aláírt hivatkozás csak a szerver
 * válasza után kerül bele. Hiba esetén a lap bezárul, és a sorban látható,
 * besorolt hibaüzenet marad (nincs hozzáférés / hiányzó fájl / tárhely / hálózat).
 */
import { useCallback, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { r2PresignDownload } from "@/lib/r2.functions";
import { classifyOpenError, openFailure, type OpenFailure } from "@/lib/documents/document-access";

export type OpenableDoc = { uid: string; fileKey: string | null; name?: string | null };

export function useOpenDocument() {
  const presign = useServerFn(r2PresignDownload);
  const [pending, setPending] = useState<string | null>(null);
  const [failures, setFailures] = useState<Record<string, OpenFailure>>({});

  const fail = useCallback((uid: string, f: OpenFailure) => {
    setFailures((p) => ({ ...p, [uid]: f }));
    toast.error(f.title, { description: f.detail, duration: 8000 });
  }, []);

  const open = useCallback(async (doc: OpenableDoc) => {
    if (!doc.fileKey) { fail(doc.uid, openFailure("missing_file")); return; }
    let win: Window | null = null;
    try {
      win = window.open("", "_blank");
      if (win) {
        try { win.opener = null; } catch { /* böngészőfüggő */ }
        try { win.document.title = "Fájl megnyitása…"; win.document.body.textContent = "A fájl megnyitása folyamatban…"; } catch { /* nem kritikus */ }
      }
    } catch { win = null; }
    setPending(doc.uid);
    try {
      const { url } = await presign({ data: { key: doc.fileKey } });
      setFailures((p) => { if (!(doc.uid in p)) return p; const n = { ...p }; delete n[doc.uid]; return n; });
      if (win && !win.closed) { win.location.replace(url); return; }
      // Letiltott felugró ablak: a felhasználó saját kattintása nyitja meg (ez engedélyezett).
      const f = openFailure("popup");
      toast.warning(f.title, {
        description: f.detail,
        duration: 15000,
        action: { label: "Megnyitás most", onClick: () => { window.open(url, "_blank", "noopener,noreferrer"); } },
      });
    } catch (e) {
      try { win?.close(); } catch { /* már zárva */ }
      fail(doc.uid, classifyOpenError(e));
    } finally {
      setPending(null);
    }
  }, [presign, fail]);

  return { open, pending, failures };
}
