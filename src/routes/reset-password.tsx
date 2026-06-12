import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { BrandLogo } from "@/components/brand-logo";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase a recovery linkből hash-ben tárolja a tokent és
    // automatikusan beállítja a sessiont (PASSWORD_RECOVERY esemény).
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("A jelszónak legalább 8 karakter hosszúnak kell lennie.");
    if (password !== confirm) return setError("A két jelszó nem egyezik.");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(error.message);
      toast.error("Sikertelen mentés", { description: error.message });
      return;
    }
    toast.success("Új jelszó beállítva", { description: "Bejelentkezve maradsz." });
    navigate({ to: "/today", replace: true });
  };

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-10">
      <div className="mx-auto max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandLogo className="mb-4 h-12" />
          <h1 className="text-2xl font-semibold tracking-tight">Új jelszó beállítása</h1>
          <p className="text-sm text-muted-foreground">Add meg az új jelszavadat.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Jelszó visszaállítása</CardTitle>
            <CardDescription>
              {ready
                ? "Adj meg egy új, biztonságos jelszót."
                : "Visszaállító link feldolgozása…"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-password">Új jelszó</Label>
                <Input
                  id="new-password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Legalább 8 karakter.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-password-confirm">Jelszó megerősítése</Label>
                <Input
                  id="new-password-confirm"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              {error && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
              <Button type="submit" className="w-full" disabled={loading || !ready}>
                {loading ? "Mentés…" : "Új jelszó mentése"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}