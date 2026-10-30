import { createFileRoute } from "@tanstack/react-router";
import {
  buildKey, checkFile, isUuid, COMPANY_DOC_CATEGORIES, PROJECT_DOC_CATEGORIES, UPLOAD_ROLES, type UploadPurpose,
} from "@/lib/r2-policy";

// 1/C: feltöltés csak bejelentkezve, szerepkör és cél (projekt/cég) jogosultság
// ellenőrzésével. A tárolási kulcsot a szerver állítja elő, így meglévő fájl
// nem írható felül, és idegen útvonalra nem lehet feltölteni.
export const Route = createFileRoute("/api/r2-upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { authenticateRequest } = await import("@/integrations/supabase/server");
          let auth;
          try { auth = await authenticateRequest(request); }
          catch { return Response.json({ ok: false, error: "Bejelentkezés szükséges" }, { status: 401 }); }
          const { userId, supabase } = auth;

          const form = await request.formData();
          const file = form.get("file");
          const purpose = String(form.get("purpose") ?? "") as UploadPurpose;
          const targetRaw = String(form.get("targetId") ?? "");
          const category = String(form.get("category") ?? "other");
          if (!(file instanceof File)) return Response.json({ ok: false, error: "Hiányzó fájl" }, { status: 400 });
          if (!["project", "company", "outbound"].includes(purpose)) {
            return Response.json({ ok: false, error: "Érvénytelen feltöltési cél" }, { status: 400 });
          }

          const [{ data: isOwner }, { data: role }] = await Promise.all([
            supabase.rpc("is_owner_role", { _auth_user: userId }),
            supabase.rpc("crm_role_of", { _auth_user: userId }),
          ]);
          if (!isOwner && !UPLOAD_ROLES[purpose].includes(String(role ?? ""))) {
            return Response.json({ ok: false, error: "Ehhez a feltöltéshez nincs jogosultságod" }, { status: 403 });
          }

          let targetId: string | null = null;
          if (purpose === "project") {
            if (!(PROJECT_DOC_CATEGORIES as readonly string[]).includes(category)) {
              return Response.json({ ok: false, error: "Érvénytelen kategória" }, { status: 400 });
            }
            if (targetRaw) {
              if (!isUuid(targetRaw)) return Response.json({ ok: false, error: "Érvénytelen projekt" }, { status: 400 });
              const { data: p } = await supabase.from("projects").select("id").eq("id", targetRaw).maybeSingle();
              if (!p) return Response.json({ ok: false, error: "A projekt nem található vagy nem elérhető" }, { status: 403 });
              targetId = targetRaw;
            }
          } else if (purpose === "company") {
            if (!(COMPANY_DOC_CATEGORIES as readonly string[]).includes(category)) {
              return Response.json({ ok: false, error: "Érvénytelen kategória" }, { status: 400 });
            }
            if (!isUuid(targetRaw)) return Response.json({ ok: false, error: "Érvénytelen cég" }, { status: 400 });
            const { data: c } = await supabase.from("companies").select("id").eq("id", targetRaw).maybeSingle();
            if (!c) return Response.json({ ok: false, error: "A cég nem található vagy nem elérhető" }, { status: 403 });
            targetId = targetRaw;
          }

          const contentType = file.type || "application/octet-stream";
          const fileError = checkFile(purpose, file.name, file.type, file.size);
          if (fileError) return Response.json({ ok: false, error: fileError }, { status: 400 });

          const key = buildKey({ purpose, targetId, category, userId, fileName: file.name, unique: crypto.randomUUID().slice(0, 8) });
          const { presignR2Url } = await import("@/lib/r2.server");
          const url = presignR2Url({ method: "PUT", key, contentType, expiresIn: 300 });
          const r = await fetch(url, { method: "PUT", headers: { "Content-Type": contentType }, body: await file.arrayBuffer() });
          if (!r.ok) {
            console.error("[r2-upload] R2 PUT failed", r.status, (await r.text().catch(() => "")).slice(0, 300));
            return Response.json({ ok: false, error: `Tárhely hiba (${r.status})` }, { status: 502 });
          }
          return Response.json({ ok: true, key, contentType });
        } catch (e: any) {
          console.error("[r2-upload]", e);
          return Response.json({ ok: false, error: "Feltöltési hiba" }, { status: 500 });
        }
      },
    },
  },
});
