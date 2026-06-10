import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, CheckCircle2, AlertCircle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  getGmailConnection,
  setGmailConnection,
  clearGmailConnection,
} from "@/lib/gmail-store";
import { getProfile } from "@/lib/gmail-client";

type OAuthMessage = {
  type?: string;
  connector_id?: string;
  success?: boolean;
  api_key?: string;
  error?: string;
};

const GATEWAY_ORIGIN = "https://connector-gateway.lovable.dev";

async function startConnectFlow(
  appUserId: string,
  onError: (msg: string) => void,
): Promise<string | null> {
  const targetOrigin = window.location.origin;
  const returnUrl = window.location.origin + "/oauth/gmail/return";

  // Synchronous popup open inside the user gesture to avoid blocker.
  const popup = window.open("", "viba-gmail-oauth", "width=600,height=720");
  if (!popup) {
    onError("A felugró ablak blokkolva van. Engedélyezd, majd próbáld újra.");
    return null;
  }

  let authorizationUrl: string;
  try {
    const r = await fetch("/api/gmail/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appUserId, targetOrigin, returnUrl }),
    });
    const data = await r.json().catch(() => ({} as any));
    if (!r.ok || !data.authorizationUrl) {
      popup.close();
      onError(data?.error ?? `Indítás sikertelen (HTTP ${r.status}).`);
      return null;
    }
    authorizationUrl = data.authorizationUrl;
  } catch (e: any) {
    popup.close();
    onError(e?.message ?? "Hálózati hiba az OAuth indításnál.");
    return null;
  }

  popup.location.href = authorizationUrl;

  return new Promise<string | null>((resolve) => {
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      clearInterval(timer);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== GATEWAY_ORIGIN) return;
      const data = event.data as OAuthMessage;
      if (!data || data.connector_id !== "google") return;
      cleanup();
      try {
        popup.close();
      } catch {
        /* ignore */
      }
      if (data.success && data.api_key) {
        resolve(data.api_key);
      } else {
        onError(data.error ?? "Az OAuth folyamat sikertelen.");
        resolve(null);
      }
    };
    window.addEventListener("message", onMessage);
    const timer = setInterval(() => {
      if (popup.closed) {
        cleanup();
        onError("A bejelentkezés megszakadt.");
        resolve(null);
      }
    }, 500);
  });
}

export function GmailConnectCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [connecting, setConnecting] = useState(false);

  const { apiKey, email: cachedEmail } = getGmailConnection(user?.id);

  const profile = useQuery({
    queryKey: ["gmail", "profile", user?.id],
    enabled: !!user?.id && !!apiKey,
    queryFn: () => getProfile(user!.id),
    retry: false,
    staleTime: 60_000,
  });

  const handleConnect = async () => {
    if (!user?.id) {
      toast.error("Először jelentkezz be.");
      return;
    }
    setConnecting(true);
    const key = await startConnectFlow(user.id, (m) =>
      toast.error("Gmail csatlakoztatás", { description: m, duration: 10_000 }),
    );
    setConnecting(false);
    if (!key) return;
    setGmailConnection(user.id, key, null);
    // Próbáljuk lekérni a profilt (email cím).
    try {
      const p = await getProfile(user.id);
      if (p?.emailAddress) setGmailConnection(user.id, key, p.emailAddress);
    } catch (e: any) {
      toast.warning("Csatlakozva, de a profil-lekérés sikertelen.", {
        description: e?.message ?? String(e),
      });
    }
    toast.success("Gmail csatlakoztatva.");
    qc.invalidateQueries({ queryKey: ["gmail"] });
  };

  const handleDisconnect = () => {
    if (!user?.id) return;
    clearGmailConnection(user.id);
    qc.invalidateQueries({ queryKey: ["gmail"] });
    toast.success("Gmail kapcsolat eltávolítva.");
  };

  const connected = !!apiKey && !profile.isError;
  const shownEmail = profile.data?.emailAddress ?? cachedEmail;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            <CardTitle>Gmail integráció</CardTitle>
          </div>
          {connected ? (
            <Badge
              variant="outline"
              className="border-[color:var(--status-success)]/40 text-[color:var(--status-success)]"
            >
              <CheckCircle2 className="mr-1 h-3 w-3" />
              csatlakoztatva
            </Badge>
          ) : (
            <Badge variant="secondary">nincs csatlakoztatva</Badge>
          )}
        </div>
        <CardDescription>
          Per-user OAuth — a saját Gmail fiókodat kötöd be. A kapcsolódási kulcs csak a böngésződben tárolódik.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {connected ? (
          <>
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
              Bejelentkezve mint:{" "}
              <span className="font-medium">{shownEmail ?? "ismeretlen cím"}</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleDisconnect}>
                <LogOut className="mr-1.5 h-4 w-4" />
                Lecsatlakozás
              </Button>
              <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["gmail"] })}>
                Frissítés
              </Button>
            </div>
          </>
        ) : (
          <>
            <Button onClick={handleConnect} disabled={connecting}>
              {connecting ? "Csatlakoztatás folyamatban…" : "Csatlakoztatás Gmail-fiókhoz"}
            </Button>
            <div className="rounded-md border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <AlertCircle className="h-3.5 w-3.5" />
                Mit kér ez?
              </div>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                <li>Gmail olvasás (inbox/sent szinkron)</li>
                <li>Gmail küldés (CRM-ből küldött válaszok)</li>
                <li>Gmail módosítás (olvasott jelzés, címke)</li>
              </ul>
            </div>
          </>
        )}
        {profile.isError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            A meglévő kapcsolat hibás vagy lejárt:{" "}
            {(profile.error as any)?.message ?? "ismeretlen hiba"}. Csatlakozz újra.
          </div>
        )}
      </CardContent>
    </Card>
  );
}