import { createFileRoute } from "@tanstack/react-router";

/**
 * Univerzális Gmail proxy a connector gateway-en keresztül.
 * Body: { connectionAPIKey: string, path: string, method?: string, body?: any, query?: Record<string,string|number> }
 * A `path` a Gmail API alatti útvonal, pl. "/gmail/v1/users/me/messages".
 */
export const Route = createFileRoute("/api/gmail/proxy")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) {
          return Response.json({ error: "LOVABLE_API_KEY nincs beállítva." }, { status: 500 });
        }

        let body: any;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Hibás JSON body." }, { status: 400 });
        }
        const connectionAPIKey = String(body?.connectionAPIKey ?? "");
        const rawPath = String(body?.path ?? "");
        const method = String(body?.method ?? "GET").toUpperCase();
        const query = (body?.query ?? null) as Record<string, any> | null;
        const reqBody = body?.body ?? null;

        if (!connectionAPIKey) {
          return Response.json({ error: "Nincs Gmail kapcsolat (connectionAPIKey hiányzik)." }, { status: 401 });
        }
        if (!rawPath) {
          return Response.json({ error: "Hiányzó path." }, { status: 400 });
        }

        const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
        let url = `https://connector-gateway.lovable.dev/google_mail${path}`;
        if (query && typeof query === "object") {
          const params = new URLSearchParams();
          for (const [k, v] of Object.entries(query)) {
            if (v == null) continue;
            if (Array.isArray(v)) {
              for (const item of v) params.append(k, String(item));
            } else {
              params.append(k, String(v));
            }
          }
          const qs = params.toString();
          if (qs) url += (url.includes("?") ? "&" : "?") + qs;
        }

        const headers: Record<string, string> = {
          Authorization: `Bearer ${apiKey}`,
          "X-Connection-Api-Key": connectionAPIKey,
        };
        let fetchBody: BodyInit | undefined;
        if (reqBody != null && method !== "GET" && method !== "HEAD") {
          headers["Content-Type"] = "application/json";
          fetchBody = JSON.stringify(reqBody);
        }

        const r = await fetch(url, { method, headers, body: fetchBody });
        const text = await r.text();
        const contentType = r.headers.get("content-type") ?? "application/json";
        return new Response(text, {
          status: r.status,
          headers: { "content-type": contentType },
        });
      },
    },
  },
});