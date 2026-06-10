import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/r2-upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const form = await request.formData();
          const file = form.get("file");
          const key = String(form.get("key") ?? "");
          const contentType = String(form.get("contentType") ?? "") || undefined;
          if (!key || !(file instanceof File)) {
            return Response.json({ ok: false, error: "Hiányzó file vagy key" }, { status: 400 });
          }
          const { presignR2Url } = await import("@/lib/r2.server");
          const url = presignR2Url({ method: "PUT", key, contentType, expiresIn: 300 });
          const buf = await file.arrayBuffer();
          const r = await fetch(url, {
            method: "PUT",
            headers: contentType ? { "Content-Type": contentType } : {},
            body: buf,
          });
          if (!r.ok) {
            const body = await r.text().catch(() => "");
            return Response.json(
              { ok: false, status: r.status, statusText: r.statusText, body: body.slice(0, 1000) },
              { status: 502 },
            );
          }
          return Response.json({ ok: true, key });
        } catch (e: any) {
          return Response.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
        }
      },
    },
  },
});