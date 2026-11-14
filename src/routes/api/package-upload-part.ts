import { createFileRoute } from "@tanstack/react-router";
import { MAX_RELAY_PART } from "@/lib/packages/package-policy";

// P1 tartalék út: ha a böngésző nem tud közvetlenül a tárhelyre írni (pl. a
// tárhely nem engedélyezi az adott címet), egy-egy darabot a szerver továbbít.
// Csak bejelentkezve, saját nyitott feltöltésre, pontos mérettel és MD5-tel.
export const Route = createFileRoute("/api/package-upload-part")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { authenticateRequest } = await import("@/integrations/supabase/server");
          let auth;
          try { auth = await authenticateRequest(request); }
          catch { return Response.json({ ok: false, error: "Bejelentkezés szükséges" }, { status: 401 }); }
          const url = new URL(request.url);
          const fileId = url.searchParams.get("fileId") ?? "";
          const part = Number(url.searchParams.get("part"));
          const md5 = (request.headers.get("x-part-md5") ?? "").toLowerCase();
          const len = Number(request.headers.get("content-length") ?? "0");
          if (len > MAX_RELAY_PART) return Response.json({ ok: false, error: "Túl nagy darab" }, { status: 413 });
          const body = await request.arrayBuffer();
          if (body.byteLength > MAX_RELAY_PART) return Response.json({ ok: false, error: "Túl nagy darab" }, { status: 413 });
          const { relayPart, PackageError } = await import("@/lib/packages/packages.server");
          try {
            const r = await relayPart(auth.supabase as any, auth.userId, fileId, part, md5, body);
            return Response.json(r);
          } catch (e) {
            if (e instanceof PackageError) return Response.json({ ok: false, error: e.message, code: e.code }, { status: e.status });
            console.error("[package-upload-part]", (e as Error)?.message);
            return Response.json({ ok: false, error: "Tárhely hiba", code: "storage" }, { status: 502 });
          }
        } catch (e) {
          console.error("[package-upload-part]", (e as Error)?.message);
          return Response.json({ ok: false, error: "Feltöltési hiba" }, { status: 500 });
        }
      },
    },
  },
});
