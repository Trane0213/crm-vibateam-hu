import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { BrandLogo } from "@/components/brand-logo";

export const Route = createFileRoute("/forgot-password")({
  ssr: false,
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim()) return setError("Az e-mail cím megadása kötelező.");
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      toast.error("Nem sikerült elküldeni", { description: error.message });
      return;
    }
    setSent(true);
    toast.success("E-mail elküldve", {
      description: "Ellenőrizd a postafiókodat a jelszó visszaállításához.",
    });
  };

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-10">
      <div className="mx-auto max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandLogo className="mb-4 h-12" />
          <h1 className="text-2xl font-semibold tracking-tight">Jelszó visszaállítása</h1>
          <p className="text-sm text-muted-foreground">Kapsz egy e-mailt a visszaállító linkkel.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Elfelejtett jelszó</CardTitle>
            <CardDescription>Add meg a regisztrált e-mail címed.</CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="space-y-4">
                <div className="rounded-md border bg-muted/50 p-3 text-sm">
                  Elküldtük a visszaállító linket a megadott címre. Ha nem találod,
                  ellenőrizd a spam mappát is.
                </div>
                <Button className="w-full" onClick={() => navigate({ to: "/auth" })}>
                  Vissza a bejelentkezéshez
                </Button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="forgot-email">E-mail cím</Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                {error && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Küldés…" : "Visszaállító link kérése"}
                </Button>
                <div className="text-center">
                  <Link
                    to="/auth"
                    className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                  >
                    Vissza a bejelentkezéshez
                  </Link>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}