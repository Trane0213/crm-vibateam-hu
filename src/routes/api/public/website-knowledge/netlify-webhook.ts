/**
 * Publikus Netlify outgoing webhook végpont.
 *
 * URL: /api/public/website-knowledge/netlify-webhook
 * Metódus: POST
 * Auth: HMAC-SHA256 a raw body-n, `NETLIFY_WEBHOOK_SECRET`-tel.
 *       A signature a `X-Webhook-Signature` (vagy `X-Netlify-Webhook-Signature`)
 *       headerben érkezik (hex, opcionális `sha256=` prefix).
 *
 * Viselkedés (WK-1):
 *   - hibás/hiányzó signature → 401
 *   - hiányzó secret env → 500
 *   - érvényes signature → `website_crawl_runs` insert (`pending` status),
 *     válasz: `{ ok: true, run_id }`
 *
 * A tényleges crawl NEM fut ebben a sprintben. A run rekord az Owner UI-n
 * a "Crawl runs" listában látható.
 */

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/api/public/website-knowledge/netlify-webhook",
)({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.NETLIFY_WEBHOOK_SECRET;
        if (!secret) {
          return Response.json(
            { error: "NETLIFY_WEBHOOK_SECRET nincs beállítva" },
            { status: 500 },
          );
        }

        const rawBody = await request.text();
        const sig =
          request.headers.get("x-webhook-signature") ??
          request.headers.get("x-netlify-webhook-signature") ??
          request.headers.get("x-hub-signature-256");

        const { verifyNetlifySignature } = await import(
          "@/lib/website-knowledge/webhook"
        );
        if (!verifyNetlifySignature(rawBody, sig, secret)) {
          return new Response("unauthorized", { status: 401 });
        }

        let payload: Record<string, unknown> = {};
        if (rawBody.length > 0) {
          try {
            payload = JSON.parse(rawBody) as Record<string, unknown>;
          } catch {
            return Response.json(
              { error: "invalid json body" },
              { status: 400 },
            );
          }
        }

        const deployId =
          typeof payload.id === "string" ? payload.id : null;
        const siteId =
          typeof payload.site_id === "string" ? payload.site_id : null;

        const { startCrawlRun } = await import(
          "@/lib/website-knowledge/crawler.server"
        );
        try {
          const run = await startCrawlRun({
            trigger: "netlify_webhook",
            netlify_deploy_id: deployId,
            netlify_site_id: siteId,
            metadata: {
              state: typeof payload.state === "string" ? payload.state : null,
              branch:
                typeof payload.branch === "string" ? payload.branch : null,
              name: typeof payload.name === "string" ? payload.name : null,
            },
          });
          return Response.json({
            ok: true,
            run_id: run.run_id,
            status: run.status,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return Response.json({ error: msg }, { status: 500 });
        }
      },
      GET: async () => new Response("method not allowed", { status: 405 }),
    },
  },
});