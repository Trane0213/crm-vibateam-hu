import { createFileRoute } from "@tanstack/react-router";

// P2 – az elkülönített tervcsomag-feldolgozó visszajelzései. Nyilvános cím, ezért a kezelő maga
// ellenőriz: HMAC-aláírás (közös titok) + feladatonkénti egyszeri token + nyitott feladat. Más
// adatot nem ad vissza, csak a feladathoz szükséges választ (pl. egy aláírt feltöltési címet).
export const Route = createFileRoute("/api/public/package-processor")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const len = Number(request.headers.get("content-length") ?? "0");
          if (len > 12 * 1024 * 1024) return Response.json({ error: "too_large" }, { status: 413 });
          const raw = await request.text();
          const { handleCallback, SIGNATURE_HEADER } = await import("@/lib/packages/processing.server");
          const r = await handleCallback(raw, request.headers.get(SIGNATURE_HEADER), { origin: new URL(request.url).origin });
          return Response.json(r.body, { status: r.status, headers: { "cache-control": "no-store" } });
        } catch (e) {
          console.error("[package-processor]", (e as Error)?.message);
          return Response.json({ error: "server_error" }, { status: 500 });
        }
      },
    },
  },
});
