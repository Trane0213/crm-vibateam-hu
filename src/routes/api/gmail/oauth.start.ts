import { createFileRoute } from "@tanstack/react-router";
import { getAuthedUserId, signState } from "@/lib/gmail/auth.server";
import { buildAuthorizationUrl, buildRedirectUri } from "@/lib/gmail/oauth.server";

export const Route = createFileRoute("/api/gmail/oauth/start")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const userId = await getAuthedUserId(request);
          let loginHint: string | undefined;
          try { loginHint = ((await request.json()) as any)?.loginHint; } catch {}
          const url = buildAuthorizationUrl({
            state: signState(userId),
            redirectUri: buildRedirectUri(request),
            loginHint,
          });
          return Response.json({ authorizationUrl: url });
        } catch (e: any) {
          if (e instanceof Response) return e;
          return Response.json({ error: e?.message ?? String(e) }, { status: 500 });
        }
      },
    },
  },
});
