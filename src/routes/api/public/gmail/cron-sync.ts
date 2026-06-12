/**
 * Publikus cron végpont: percenként hívja a pg_cron (pg_net) job, ami
 * minden Gmail-hez csatlakoztatott felhasználón végigfut és inkrementális
 * szinkronizációt végez. A `GMAIL_CRON_SECRET` környezeti változót kell
 * `x-cron-secret` headerben átadni — másik kérés 401-et kap.
 */
import { createFileRoute } from "@tanstack/react-router";

const MAX_CONCURRENCY = 3;
const HARD_DEADLINE_MS = 50 * 1000;

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/public/gmail/cron-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.GMAIL_CRON_SECRET;
        if (!expected) {
          return Response.json({ error: "GMAIL_CRON_SECRET nincs beállítva" }, { status: 500 });
        }
        const sent = request.headers.get("x-cron-secret") ?? "";
        if (!timingSafeEqualStr(sent, expected)) {
          return new Response("unauthorized", { status: 401 });
        }

        const { getAdminClient } = await import("@/lib/gmail/admin.server");
        const { syncInboxIncremental } = await import("@/lib/gmail/sync-incremental.server");
        const admin = getAdminClient();

        const { data: users, error: usersErr } = await admin
          .from("users_profile")
          .select("auth_user_id,gmail_email")
          .not("gmail_refresh_token", "is", null);
        if (usersErr) return Response.json({ error: usersErr.message }, { status: 500 });

        const list = (users ?? []) as { auth_user_id: string; gmail_email: string | null }[];
        const startedAt = Date.now();
        const perUser: any[] = [];
        let index = 0;

        async function worker() {
          while (true) {
            if (Date.now() - startedAt > HARD_DEADLINE_MS) return;
            const i = index++;
            if (i >= list.length) return;
            const u = list[i];
            const runStarted = new Date().toISOString();
            try {
              const r = await syncInboxIncremental(u.auth_user_id);
              await admin.from("gmail_sync_runs").insert({
                user_id: u.auth_user_id,
                trigger: "cron",
                started_at: runStarted,
                finished_at: new Date().toISOString(),
                mode: r.mode,
                fetched: r.fetched,
                inserted: r.inserted,
                skipped: r.skipped,
                errors: r.errors,
                history_id_before: r.history_before,
                history_id_after: r.history_after,
              });
              perUser.push({ user_id: u.auth_user_id, email: u.gmail_email, ...r });
            } catch (e: any) {
              const msg = e?.message ?? String(e);
              await admin.from("gmail_sync_runs").insert({
                user_id: u.auth_user_id,
                trigger: "cron",
                started_at: runStarted,
                finished_at: new Date().toISOString(),
                mode: "incremental",
                fetched: 0,
                inserted: 0,
                skipped: 0,
                errors: [msg],
                history_id_before: null,
                history_id_after: null,
              });
              perUser.push({ user_id: u.auth_user_id, email: u.gmail_email, error: msg });
            }
          }
        }

        const workers = Array.from({ length: Math.min(MAX_CONCURRENCY, list.length || 1) }, () => worker());
        await Promise.all(workers);

        return Response.json({
          ok: true,
          users: list.length,
          processed: perUser.length,
          duration_ms: Date.now() - startedAt,
          runs: perUser,
        });
      },
      GET: async () => new Response("method not allowed", { status: 405 }),
    },
  },
});