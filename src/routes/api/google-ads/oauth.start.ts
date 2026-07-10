import { createFileRoute } from "@tanstack/react-router";
import { authenticateRequest } from "@/integrations/supabase/server";
import { signState } from "@/lib/google-ads/auth.server";
import {
  buildAuthorizationUrl,
  describeAuthorizationUrl,
  resolveRedirectUri,
} from "@/lib/google-ads/oauth.server";

export const Route = createFileRoute("/api/google-ads/oauth/start")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { userId } = await authenticateRequest(request);
          let loginHint: string | undefined;
          try { loginHint = ((await request.json()) as any)?.loginHint; } catch { /* empty body */ }
          const redirect = resolveRedirectUri(request);
          const state = signState(userId);
          const url = buildAuthorizationUrl({
            state,
            redirectUri: redirect.redirectUri,
            loginHint,
          });
          console.info("[google-ads-oauth:start] generated authorize URL", {
            runtime_env_GOOGLE_ADS_CLIENT_ID: process.env.GOOGLE_ADS_CLIENT_ID ?? "",
            ...describeAuthorizationUrl(url),
            redirect_uri_source: redirect.source,
            redirect_uri_candidates: redirect.candidates,
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