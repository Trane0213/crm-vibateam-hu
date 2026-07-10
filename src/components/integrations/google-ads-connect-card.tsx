import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, CheckCircle2, LogOut, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { disconnectGoogleAds, getGoogleAdsStatus } from "@/lib/google-ads/status.functions";

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Nincs bejelentkezett munkamenet.");
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  return fetch(path, { ...init, headers });
}

export function GoogleAdsConnectCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<null | "connect" | "disconnect">(null);
  const getStatus = useServerFn(getGoogleAdsStatus);
  const disconnect = useServerFn(disconnectGoogleAds);

  const status = useQuery({
    queryKey: ["google-ads", "status", user?.id],
    enabled: !!user?.id,
    queryFn: () => getStatus(),
    staleTime: 30_000,
  });

  const handleConnect = async () => {
    setBusy("connect");
    try {
      const r = await authedFetch("/api/google-ads/oauth/start", { method: "POST", body: JSON.stringify({}) });
      const j = await r.json();
      if (!r.ok || !j.authorizationUrl) throw new Error(j.error ?? "Indítás sikertelen");
      const isEmbedded = window.self !== window.top;
      if (isEmbedded) {
        const opened = window.open(j.authorizationUrl, "_blank", "noopener,noreferrer");
        if (!opened) {
          throw new Error("A böngésző blokkolta a Google bejelentkezési ablakot. Engedélyezd a felugró ablakot, majd próbáld újra.");
        }
        toast.info("Google bejelentkezés", { description: "A Google OAuth folyamat új böngészőfülön indult el." });
        setBusy(null);
        return;
      }
      window.location.assign(j.authorizationUrl);
    } catch (e: any) {
      toast.error("Csatlakozás", { description: e?.message ?? String(e) });
      setBusy(null);
    }
  };

  const handleDisconnect = async () => {
    setBusy("disconnect");
    try {
      await disconnect();
      toast.success("Google Ads kapcsolat eltávolítva.");
      qc.invalidateQueries({ queryKey: ["google-ads"] });
    } catch (e: any) {
      toast.error("Lecsatlakozás", { description: e?.message ?? String(e) });
    } finally { setBusy(null); }
  };

  const data = status.data;
  const connected = !!data?.connected;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            <CardTitle>Google Ads kapcsolat</CardTitle>
          </div>
          {connected ? (
            <Badge variant="outline" className="border-[color:var(--status-success)]/40 text-[color:var(--status-success)]">
              <CheckCircle2 className="mr-1 h-3 w-3" /> csatlakoztatva
            </Badge>
          ) : data?.status === "revoked" || data?.status === "error" ? (
            <Badge variant="outline" className="border-destructive/40 text-destructive">
              <AlertTriangle className="mr-1 h-3 w-3" /> {data.status === "revoked" ? "visszavonva" : "hiba"}
            </Badge>
          ) : (
            <Badge variant="secondary">nincs csatlakoztatva</Badge>
          )}
        </div>
        <CardDescription>
          Saját Google OAuth Client — közvetlen Google Ads API v17 hívás. A refresh token AES-GCM titkosítással
          a CRM saját adatbázisában tárolódik.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {connected && data ? (
          <>
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
              Bejelentkezve mint: <span className="font-medium">{data.google_email}</span>
              {data.connected_at && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  Csatlakozva: {new Date(data.connected_at).toLocaleString("hu-HU")}
                </div>
              )}
              <div className="text-xs text-muted-foreground mt-0.5">
                Utolsó snapshot: {data.last_snapshot_at ? new Date(data.last_snapshot_at).toLocaleString("hu-HU") : "még nincs (M2)"}
              </div>
            </div>
            <Button variant="outline" onClick={handleDisconnect} disabled={busy !== null}>
              <LogOut className="mr-1.5 h-4 w-4" />
              Lecsatlakozás
            </Button>
          </>
        ) : (
          <div className="space-y-2">
            <Button onClick={handleConnect} disabled={busy !== null}>
              {busy === "connect" ? "Átirányítás…" : "Csatlakozás Google fiókkal"}
            </Button>
            {data?.last_error && (
              <p className="text-xs text-destructive">Legutóbbi hiba: {data.last_error}</p>
            )}
          </div>
        )}
        {status.isError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            {(status.error as any)?.message ?? "Státusz lekérési hiba"}
          </div>
        )}
      </CardContent>
    </Card>
  );
}