import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, CheckCircle2, LogOut, RefreshCw, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Nincs bejelentkezett munkamenet.");
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  return fetch(path, { ...init, headers });
}

async function fetchStatus() {
  const r = await authedFetch("/api/gmail/status");
  if (!r.ok) throw new Error(`Státusz lekérés hiba (${r.status})`);
  return r.json() as Promise<{ connected: boolean; account: null | { email: string; last_sync_at: string | null; expires_at: string | null } }>;
}

export function GmailConnectCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<null | "connect" | "sync" | "backfill" | "disconnect">(null);

  const status = useQuery({
    queryKey: ["gmail", "status", user?.id],
    enabled: !!user?.id,
    queryFn: fetchStatus,
    staleTime: 30_000,
  });

  const handleConnect = async () => {
    setBusy("connect");
    try {
      const r = await authedFetch("/api/gmail/oauth/start", { method: "POST", body: JSON.stringify({}) });
      const j = await r.json();
      if (!r.ok || !j.authorizationUrl) throw new Error(j.error ?? "Indítás sikertelen");
      window.location.href = j.authorizationUrl;
    } catch (e: any) {
      toast.error("Csatlakozás", { description: e?.message ?? String(e) });
      setBusy(null);
    }
  };

  const handleSync = async () => {
    setBusy("sync");
    try {
      const r = await authedFetch("/api/gmail/sync", { method: "POST", body: JSON.stringify({ max: 25 }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Sync hiba");
      const errs: string[] = j.errors ?? [];
      toast.success(`Szinkron kész: ${j.inserted} új, ${j.skipped} kihagyva, ${j.attachments ?? 0} csatolmány, ${errs.length} hiba`, {
        description: errs.length ? errs.slice(0, 3).join(" | ") : undefined,
      });
      if (errs.length) console.error("[gmail/sync] errors", errs);
      qc.invalidateQueries({ queryKey: ["gmail"] });
      qc.invalidateQueries({ queryKey: ["resource", "emails"] });
      qc.invalidateQueries({ queryKey: ["emails"] });
    } catch (e: any) {
      toast.error("Sync", { description: e?.message ?? String(e) });
    } finally { setBusy(null); }
  };

  const handleBackfill = async () => {
    setBusy("backfill");
    try {
      // Egy futás ~4 perces ablakot dolgoz fel; ha "done: false", a UI újraindítja.
      let total = { inserted: 0, skipped: 0, attachments: 0, errors: 0, runs: 0 };
      let done = false;
      while (!done) {
        const r = await authedFetch("/api/gmail/sync", {
          method: "POST",
          body: JSON.stringify({ backfill: true, max: 5000 }),
        });
        const txt = await r.text();
        let j: any = {};
        try { j = txt ? JSON.parse(txt) : {}; } catch { j = { error: txt }; }
        if (!r.ok) {
          // 504/502 gateway timeout esetén nem dobunk, csak újra próbáljuk a következő körrel.
          if (r.status === 504 || r.status === 502) {
            total.runs++;
            toast.message(`Időtúllépés (${r.status}) — folytatás következő körrel… (eddig ${total.inserted} új)`);
            if (total.runs >= 30) break;
            continue;
          }
          throw new Error(j.error ?? `Backfill hiba (${r.status})`);
        }
        total.inserted += j.inserted ?? 0;
        total.skipped += j.skipped ?? 0;
        total.attachments += j.attachments ?? 0;
        total.errors += (j.errors ?? []).length;
        total.runs++;
        done = !!j.done;
        if (!done) toast.message(`Backfill folyamatban — eddig ${total.inserted} új, ${total.attachments} csatolmány…`);
        // Védő-korlát: max 30 batch (≈ 150k üzenet) egy munkamenetben.
        if (total.runs >= 30) break;
      }
      toast.success(
        `Teljes szinkron kész: ${total.inserted} új, ${total.skipped} kihagyva, ${total.attachments} csatolmány, ${total.errors} hiba (${total.runs} kör).`,
      );
      qc.invalidateQueries({ queryKey: ["gmail"] });
      qc.invalidateQueries({ queryKey: ["emails"] });
    } catch (e: any) {
      toast.error("Backfill", { description: e?.message ?? String(e) });
    } finally { setBusy(null); }
  };

  const handleDisconnect = async () => {
    setBusy("disconnect");
    try {
      const r = await authedFetch("/api/gmail/disconnect", { method: "POST" });
      if (!r.ok) throw new Error((await r.json())?.error ?? "Hiba");
      toast.success("Gmail kapcsolat eltávolítva.");
      qc.invalidateQueries({ queryKey: ["gmail"] });
    } catch (e: any) {
      toast.error("Lecsatlakozás", { description: e?.message ?? String(e) });
    } finally { setBusy(null); }
  };

  const connected = !!status.data?.connected;
  const acc = status.data?.account ?? null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            <CardTitle>Gmail kapcsolat</CardTitle>
          </div>
          {connected ? (
            <Badge variant="outline" className="border-[color:var(--status-success)]/40 text-[color:var(--status-success)]">
              <CheckCircle2 className="mr-1 h-3 w-3" /> csatlakoztatva
            </Badge>
          ) : (
            <Badge variant="secondary">nincs csatlakoztatva</Badge>
          )}
        </div>
        <CardDescription>
          Saját Google OAuth — közvetlen Gmail API hívás. A refresh token a CRM saját adatbázisában tárolódik.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {connected && acc ? (
          <>
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
              Bejelentkezve mint: <span className="font-medium">{acc.email}</span>
              {acc.last_sync_at && (
                <div className="text-xs text-muted-foreground mt-0.5">Utolsó szinkron: {new Date(acc.last_sync_at).toLocaleString("hu-HU")}</div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSync} disabled={busy !== null}>
                <RefreshCw className={`mr-1.5 h-4 w-4 ${busy === "sync" ? "animate-spin" : ""}`} />
                {busy === "sync" ? "Szinkronizálás…" : "Szinkron most"}
              </Button>
              <Button variant="outline" onClick={handleBackfill} disabled={busy !== null}>
                <History className={`mr-1.5 h-4 w-4 ${busy === "backfill" ? "animate-spin" : ""}`} />
                {busy === "backfill" ? "Teljes előzmény…" : "Teljes előzmény szinkronizálása"}
              </Button>
              <Button variant="outline" onClick={handleDisconnect} disabled={busy !== null}>
                <LogOut className="mr-1.5 h-4 w-4" />
                Lecsatlakozás
              </Button>
            </div>
          </>
        ) : (
          <Button onClick={handleConnect} disabled={busy !== null}>
            {busy === "connect" ? "Átirányítás…" : "Csatlakozás Google fiókkal"}
          </Button>
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
